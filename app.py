from flask import Flask, render_template, request, jsonify, send_file
import sqlite3
import datetime
import os
from fpdf import FPDF
from pathlib import Path

# app = Flask(__name__)
# app.config['DATABASE'] = 'inventory.db'



import psycopg2
from psycopg2.extras import RealDictCursor # Allows us to access rows like dictionaries
# from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)

# --- DATABASE SETUP ---
def get_db_connection():
    # Vercel automatically provides the POSTGRES_URL environment variable 
    # once you connect the Postgres storage to your project
    conn = psycopg2.connect(os.environ.get('POSTGRES_URL'))
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Postgres uses 'SERIAL' instead of 'INTEGER PRIMARY KEY AUTOINCREMENT'
    cursor.execute('''CREATE TABLE IF NOT EXISTS products 
                      (id SERIAL PRIMARY KEY, 
                       name TEXT UNIQUE, 
                       quantity INTEGER, 
                       reorder_level INTEGER, 
                       price REAL DEFAULT 0, 
                       brand TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS transactions 
                      (id SERIAL PRIMARY KEY, 
                       item_name TEXT, 
                       quantity INTEGER, 
                       type TEXT, 
                       date TEXT, 
                       time TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS sales 
                      (id SERIAL PRIMARY KEY, 
                       sale_num TEXT UNIQUE, 
                       customer TEXT, 
                       date TEXT, 
                       time TEXT, 
                       total_amount REAL, 
                       payment_status TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS sale_items 
                      (id SERIAL PRIMARY KEY, 
                       sale_num TEXT, 
                       item_name TEXT, 
                       quantity INTEGER, 
                       price REAL, 
                       total REAL)''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS expenses 
                      (id SERIAL PRIMARY KEY, 
                       description TEXT, 
                       category TEXT, 
                       amount REAL, 
                       date TEXT, 
                       time TEXT, 
                       notes TEXT)''')
    
    conn.commit()
    cursor.close()
    conn.close()

# Run init_db once
init_db()

# --- AUTHENTICATION HELPERS ---
def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Authentication required'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Authentication required'}), 401
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT role FROM users WHERE id = %s', (session['user_id'],))
        user = cursor.fetchone()
        conn.close()
        
        if not user or user['role'] != 'admin':
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- AUTHENTICATION ROUTES ---
@app.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
    
    if not user['is_active']:
        return jsonify({'success': False, 'error': 'Account is disabled'}), 401
    
    if not check_password_hash(user['password_hash'], password):
        return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
    
    # Set session
    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['full_name'] = user['full_name']
    
    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'full_name': user['full_name'],
            'role': user['role']
        }
    })

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/current-user')
@login_required
def current_user():
    return jsonify({
        'success': True,
        'user': {
            'id': session.get('user_id'),
            'username': session.get('username'),
            'full_name': session.get('full_name'),
            'role': session.get('role')
        }
    })

# --- ROUTES ---
@app.route('/')
@login_required
def index():
    return render_template('dashboard.html')

@app.route('/api/inventory')
def get_inventory():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM products")
    products = cursor.fetchall()
    conn.close()
    return jsonify(products)

@app.route('/api/add-entry', methods=['POST'])
def add_entry():
    data = request.json
    name = data.get('name', '').strip()
    qty = data.get('quantity')
    brand = data.get('brand', '').strip()
    entry_type = data.get('type', 'Intake')
    
    if not name or not isinstance(qty, int) or qty <= 0:
        return jsonify({'success': False, 'error': 'Invalid name or quantity'}), 400
    
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT quantity FROM products WHERE name=%s", (name,))
        row = cursor.fetchone()
        
        if row:
            new_qty = row['quantity'] + qty if entry_type == "Intake" else row['quantity'] - qty
            if new_qty < 0:
                return jsonify({'success': False, 'error': 'Insufficient stock'}), 400
            cursor.execute("UPDATE products SET quantity=%s WHERE name=%s", (new_qty, name))
        else:
            if entry_type == "Supply":
                return jsonify({'success': False, 'error': 'Item does not exist in stock'}), 400
            # Try to insert with brand, fallback without if column doesn't exist
            try:
                cursor.execute("INSERT INTO products (name, quantity, reorder_level, brand) VALUES (%s, %s, %s, %s)", (name, qty, 5, brand))
            except sqlite3.OperationalError:
                # If brand column doesn't exist, insert without it
                cursor.execute("INSERT INTO products (name, quantity, reorder_level) VALUES (%s, %s, %s)", (name, qty, 5))
        
        cursor.execute("INSERT INTO transactions (item_name, quantity, type, date, time) VALUES (%s,%s,%s,%s,%s)",
                      (name, qty, entry_type, date_str, time_str))
        conn.commit()
        return jsonify({'success': True, 'message': f'{entry_type} recorded successfully!'})
    except psycopg2.IntegrityError:
        conn.rollback()
        return jsonify({'success': False, 'error': 'Item name already exists'}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        conn.close()

@app.route('/api/update-reorder', methods=['POST'])
def update_reorder():
    data = request.json
    name = data.get('name', '').strip()
    level = data.get('level')
    
    if not name or not isinstance(level, int) or level < 0:
        return jsonify({'success': False, 'error': 'Invalid input'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE products SET reorder_level=%s WHERE name=%s", (level, name))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/transactions')
def get_transactions():
    date_filter = request.args.get('date')
    type_filter = request.args.get('type', 'All')
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if date_filter:
        if type_filter == 'All':
            cursor.execute("SELECT * FROM transactions WHERE date=%s ORDER BY time DESC", (date_filter,))
        else:
            cursor.execute("SELECT * FROM transactions WHERE date=%s AND type=%s ORDER BY time DESC", (date_filter, type_filter))
    else:
        if type_filter == 'All':
            cursor.execute("SELECT * FROM transactions ORDER BY date DESC, time DESC LIMIT 100")
        else:
            cursor.execute("SELECT * FROM transactions WHERE type=%s ORDER BY date DESC, time DESC LIMIT 100", (type_filter,))
    
    transactions = cursor.fetchall()
    conn.close()
    return jsonify(transactions)

@app.route('/api/generate-invoice', methods=['POST'])
def generate_invoice():
    data = request.json
    customer = data.get('customer', '').strip()
    item = data.get('item', '').strip()
    qty = data.get('quantity')
    
    if not customer or not item or not isinstance(qty, int) or qty <= 0:
        return jsonify({'success': False, 'error': 'Invalid input'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("SELECT quantity FROM products WHERE name=%s", (item,))
    product = cursor.fetchone()
    
    if not product or product['quantity'] < qty:
        return jsonify({'success': False, 'error': 'Insufficient stock'}), 400
    
    inv_num = f"INV-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    today = datetime.date.today().strftime("%Y-%m-%d")
    
    cursor.execute("UPDATE products SET quantity = quantity - %s WHERE name = %s", (qty, item))
    cursor.execute("INSERT INTO transactions (item_name, quantity, type, date, time) VALUES (%s,%s,'Supply',%s,%s)",
                  (item, qty, today, datetime.datetime.now().strftime("%H:%M:%S")))
    cursor.execute("INSERT INTO invoices VALUES (%s,%s,%s,%s)", (inv_num, today, customer, qty))
    conn.commit()
    conn.close()
    
    # Generate PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", 'B', 20)
    pdf.cell(190, 10, "INVOICE", ln=True, align='C')
    pdf.set_font("Arial", size=12)
    pdf.cell(100, 10, f"Invoice No: {inv_num}", ln=True)
    pdf.cell(100, 10, f"Customer: {customer}", ln=True)
    pdf.cell(100, 10, f"Date: {today}", ln=True)
    pdf.ln(10)
    pdf.cell(100, 10, "Item Name", border=1)
    pdf.cell(40, 10, "Quantity", border=1)
    pdf.ln()
    pdf.cell(100, 10, item, border=1)
    pdf.cell(40, 10, str(qty), border=1)
    
    file_name = f"{inv_num}.pdf"
    pdf.output(file_name)
    
    return jsonify({'success': True, 'message': f'Invoice {file_name} generated', 'file': file_name})

@app.route('/download/<filename>')
def download_file(filename):
    if os.path.exists(filename):
        return send_file(filename, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

@app.route('/api/delete-product/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get product name before deleting
    cursor.execute("SELECT name FROM products WHERE id=%s", (product_id,))
    product = cursor.fetchone()
    
    if not product:
        return jsonify({'success': False, 'error': 'Product not found'}), 404
    
    product_name = product['name']
    
    # Delete the product
    cursor.execute("DELETE FROM products WHERE id=%s", (product_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': f'Product "{product_name}" deleted successfully'})

@app.route('/api/delete-transaction/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get transaction details before deleting
    cursor.execute("SELECT * FROM transactions WHERE id=%s", (transaction_id,))
    transaction = cursor.fetchone()
    
    if not transaction:
        return jsonify({'success': False, 'error': 'Transaction not found'}), 404
    
    item_name = transaction['item_name']
    quantity = transaction['quantity']
    tx_type = transaction['type']
    
    # Reverse the transaction effect on inventory
    cursor.execute("SELECT quantity FROM products WHERE name=%s", (item_name,))
    product = cursor.fetchone()
    
    if product:
        current_qty = product['quantity']
        
        # Reverse the effect based on transaction type
        if tx_type == "Intake":
            # If it was an intake, subtract the quantity
            new_qty = current_qty - quantity
        else:  # Supply
            # If it was a supply outgoing, add the quantity back
            new_qty = current_qty + quantity
        
        # Prevent negative stock
        if new_qty < 0:
            return jsonify({'success': False, 'error': 'Cannot delete transaction - would result in negative inventory'}), 400
        
        cursor.execute("UPDATE products SET quantity=%s WHERE name=%s", (new_qty, item_name))
    
    # Delete the transaction
    cursor.execute("DELETE FROM transactions WHERE id=%s", (transaction_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': f'Transaction deleted successfully. Inventory adjusted for "{item_name}"'})

# --- SALES & CREDIT ROUTES ---
@app.route('/api/create-sale', methods=['POST'])
def create_sale():
    data = request.json
    customer = data.get('customer', '').strip()
    items = data.get('items', [])
    payment_status = data.get('payment_status', 'Pending')
    
    if not customer or not items:
        return jsonify({'success': False, 'error': 'Customer and items required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Generate sale number
        sale_num = f"SALE-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        today = datetime.date.today().strftime("%Y-%m-%d")
        current_time = datetime.datetime.now().strftime("%H:%M:%S")
        total_amount = 0
        
        # Process each item
        for item in items:
            item_name = item.get('name', '').strip()
            quantity = item.get('quantity')
            price = item.get('price')
            
            if not item_name or not isinstance(quantity, int) or quantity <= 0 or not isinstance(price, (int, float)) or price < 0:
                return jsonify({'success': False, 'error': 'Invalid item data'}), 400
            
            item_total = quantity * price
            total_amount += item_total
            
            # Check if product exists and has enough stock
            cursor.execute("SELECT quantity FROM products WHERE name=%s", (item_name,))
            product = cursor.fetchone()
            
            if product:
                if product['quantity'] < quantity:
                    return jsonify({'success': False, 'error': f'Insufficient stock for {item_name}'}), 400
                
                # Deduct from inventory
                cursor.execute("UPDATE products SET quantity = quantity - %s WHERE name = %s", (quantity, item_name))
                
                # Log transaction
                cursor.execute("INSERT INTO transactions (item_name, quantity, type, date, time) VALUES (%s,%s,'Supply',%s,%s)",
                              (item_name, quantity, today, current_time))
            
            # Add sale item
            cursor.execute("INSERT INTO sale_items (sale_num, item_name, quantity, price, total) VALUES (%s,%s,%s,%s,%s)",
                          (sale_num, item_name, quantity, price, item_total))
        
        # Create sale record
        cursor.execute("INSERT INTO sales (sale_num, customer, date, time, total_amount, payment_status) VALUES (%s,%s,%s,%s,%s,%s)",
                      (sale_num, customer, today, current_time, total_amount, payment_status))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Sale created successfully', 'sale_num': sale_num, 'total': total_amount})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        conn.close()

@app.route('/api/sales')
def get_sales():
    customer_filter = request.args.get('customer', '').strip()
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if customer_filter and date_filter:
        cursor.execute("SELECT * FROM sales WHERE customer LIKE %s AND date=%s ORDER BY date DESC, time DESC", (f'%{customer_filter}%', date_filter))
    elif date_filter:
        cursor.execute("SELECT * FROM sales WHERE date=%s ORDER BY date DESC, time DESC", (date_filter,))
    elif customer_filter:
        cursor.execute("SELECT * FROM sales WHERE customer LIKE %s ORDER BY date DESC, time DESC", (f'%{customer_filter}%',))
    else:
        cursor.execute("SELECT * FROM sales ORDER BY date DESC, time DESC LIMIT 100")
    
    sales = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(sales)

@app.route('/api/sales-summary')
def get_sales_summary():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if date_filter:
        cursor.execute("""
            SELECT 
                COUNT(*) as total_sales,
                SUM(total_amount) as total_revenue,
                SUM(CASE WHEN payment_status='Paid' THEN total_amount ELSE 0 END) as paid_amount,
                SUM(CASE WHEN payment_status='Credit' THEN total_amount ELSE 0 END) as credit_amount,
                SUM(CASE WHEN payment_status='Pending' THEN total_amount ELSE 0 END) as pending_amount
            FROM sales WHERE date=%s
        """, (date_filter,))
    else:
        cursor.execute("""
            SELECT 
                COUNT(*) as total_sales,
                SUM(total_amount) as total_revenue,
                SUM(CASE WHEN payment_status='Paid' THEN total_amount ELSE 0 END) as paid_amount,
                SUM(CASE WHEN payment_status='Credit' THEN total_amount ELSE 0 END) as credit_amount,
                SUM(CASE WHEN payment_status='Pending' THEN total_amount ELSE 0 END) as pending_amount
            FROM sales
        """)
    
    result = cursor.fetchone()
    conn.close()
    
    return jsonify({
        'total_sales': result['total_sales'] or 0,
        'total_revenue': result['total_revenue'] or 0,
        'paid_amount': result['paid_amount'] or 0,
        'credit_amount': result['credit_amount'] or 0,
        'pending_amount': result['pending_amount'] or 0
    })

@app.route('/api/dashboard-metrics')
def get_dashboard_metrics():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get sales data
    if date_filter:
        cursor.execute("""
            SELECT 
                SUM(total_amount) as total_revenue
            FROM sales WHERE date=%s
        """, (date_filter,))
    else:
        cursor.execute("""
            SELECT 
                SUM(total_amount) as total_revenue
            FROM sales
        """)
    
    sales_result = cursor.fetchone()
    total_revenue = sales_result['total_revenue'] or 0
    
    # Get expenses data
    if date_filter:
        cursor.execute("""
            SELECT 
                SUM(amount) as total_expenses
            FROM expenses WHERE date=%s
        """, (date_filter,))
    else:
        cursor.execute("""
            SELECT 
                SUM(amount) as total_expenses
            FROM expenses
        """)
    
    expenses_result = cursor.fetchone()
    total_expenses = expenses_result['total_expenses'] or 0
    
    # Calculate net profit
    net_profit = total_revenue - total_expenses
    
    conn.close()
    
    return jsonify({
        'total_revenue': total_revenue,
        'total_expenses': total_expenses,
        'net_profit': net_profit
    })

@app.route('/api/sale/<sale_num>')
def get_sale_details(sale_num):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
    sale = cursor.fetchone()
    
    if not sale:
        return jsonify({'success': False, 'error': 'Sale not found'}), 404
    
    cursor.execute("SELECT * FROM sale_items WHERE sale_num=%s", (sale_num,))
    items = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        'sale': dict(sale),
        'items': items
    })

@app.route('/api/generate-sale-invoice/<sale_num>', methods=['GET'])
def generate_sale_invoice(sale_num):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
    sale = cursor.fetchone()
    
    if not sale:
        return jsonify({'success': False, 'error': 'Sale not found'}), 404
    
    cursor.execute("SELECT * FROM sale_items WHERE sale_num=%s", (sale_num,))
    items = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Generate PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", 'B', 20)
    pdf.cell(190, 10, "KEL-B PHONE ACCESSORIES", ln=True, align='C')
    pdf.set_font("Arial", size=16)
    pdf.cell(190, 10, "SHOP 16 GOLDEN POINT PLAZA", ln=True, align='C')
    pdf.cell(190, 10, "TEL: 08034746191, 09033762556", ln=True, align='C')
    pdf.set_font("Arial", size=12)
    pdf.cell(190, 10, "SALES INVOICE", ln=True, align='C')
    pdf.set_font("Arial", size=11)
    pdf.ln(5)
    pdf.cell(95, 8, f"Sale No: {sale['sale_num']}", border=0)
    pdf.cell(95, 8, f"Date: {sale['date']}", border=0, ln=True)
    pdf.cell(95, 8, f"Customer: {sale['customer']}", border=0)
    pdf.cell(95, 8, f"Time: {sale['time']}", border=0, ln=True)
    pdf.ln(5)
    
    # Table header
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(80, 8, "Item", border=1)
    pdf.cell(30, 8, "Qty", border=1)
    pdf.cell(30, 8, "Price", border=1)
    pdf.cell(40, 8, "Total", border=1, ln=True)
    
    # Table rows
    pdf.set_font("Arial", size=10)
    for item in items:
        pdf.cell(80, 8, item['item_name'][:25], border=1)
        pdf.cell(30, 8, str(item['quantity']), border=1)
        pdf.cell(30, 8, f"{item['price']:.2f}", border=1)
        pdf.cell(40, 8, f"{item['total']:.2f}", border=1, ln=True)
    
    # Total
    pdf.set_font("Arial", 'B', 11)
    pdf.cell(140, 10, "Total Amount:", border=0, align='R')
    pdf.cell(40, 10, f"{sale['total_amount']:.2f}", border=1, ln=True)
    
    pdf.set_font("Arial", size=9)
    pdf.ln(5)
    pdf.cell(190, 8, f"Payment Status: {sale['payment_status']}", align='C')
    
    file_name = f"{sale_num}.pdf"
    pdf.output(file_name)
    
    return jsonify({'success': True, 'file': file_name})

@app.route('/api/update-sale-status/<sale_num>', methods=['POST'])
def update_sale_status(sale_num):
    data = request.json
    new_status = data.get('status', '').strip()
    
    valid_statuses = ['Pending', 'Paid', 'Credit', 'Partial']
    
    if new_status not in valid_statuses:
        return jsonify({'success': False, 'error': 'Invalid payment status'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
    sale = cursor.fetchone()
    
    if not sale:
        return jsonify({'success': False, 'error': 'Sale not found'}), 404
    
    cursor.execute("UPDATE sales SET payment_status=%s WHERE sale_num=%s", (new_status, sale_num))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': f'Payment status updated to {new_status}'})

# --- EXPENSES ROUTES ---
@app.route('/api/add-expense', methods=['POST'])
def add_expense():
    data = request.json
    description = data.get('description', '').strip()
    category = data.get('category', '').strip()
    amount = data.get('amount')
    date_str = data.get('date', '').strip()
    notes = data.get('notes', '').strip()
    
    if not description or not category or not isinstance(amount, (int, float)) or amount <= 0 or not date_str:
        return jsonify({'success': False, 'error': 'Invalid expense data'}), 400
    
    time_str = datetime.datetime.now().strftime("%H:%M:%S")
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        cursor.execute("INSERT INTO expenses (description, category, amount, date, time, notes) VALUES (%s,%s,%s,%s,%s,%s)",
                      (description, category, amount, date_str, time_str, notes))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Expense recorded successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/expenses')
def get_expenses():
    date_filter = request.args.get('date', '').strip()
    category_filter = request.args.get('category', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if date_filter and category_filter:
        cursor.execute("SELECT * FROM expenses WHERE date=%s AND category=%s ORDER BY date DESC, time DESC", 
                      (date_filter, category_filter))
    elif date_filter:
        cursor.execute("SELECT * FROM expenses WHERE date=%s ORDER BY date DESC, time DESC", (date_filter,))
    elif category_filter:
        cursor.execute("SELECT * FROM expenses WHERE category=%s ORDER BY date DESC, time DESC", (category_filter,))
    else:
        cursor.execute("SELECT * FROM expenses ORDER BY date DESC, time DESC")
    
    expenses = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(expenses)

@app.route('/api/expenses-summary')
def get_expenses_summary():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    if date_filter:
        cursor.execute("SELECT SUM(amount) as total_expenses FROM expenses WHERE date=%s", (date_filter,))
    else:
        cursor.execute("SELECT SUM(amount) as total_expenses FROM expenses")
    
    result = cursor.fetchone()
    
    if date_filter:
        cursor.execute("SELECT category, SUM(amount) as total FROM expenses WHERE date=%s GROUP BY category ORDER BY total DESC",
                      (date_filter,))
    else:
        cursor.execute("SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC")
    
    categories = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({
        'total_expenses': result['total_expenses'] or 0,
        'by_category': categories
    })

@app.route('/api/delete-expense/<int:expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("SELECT * FROM expenses WHERE id=%s", (expense_id,))
    expense = cursor.fetchone()
    
    if not expense:
        return jsonify({'success': False, 'error': 'Expense not found'}), 404
    
    cursor.execute("DELETE FROM expenses WHERE id=%s", (expense_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Expense deleted successfully'})

@app.route('/api/delete-sale/<sale_num>', methods=['DELETE'])
def delete_sale(sale_num):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get sale details before deleting
    cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
    sale = cursor.fetchone()
    
    if not sale:
        return jsonify({'success': False, 'error': 'Sale not found'}), 404
    
    try:
        # Get all items in this sale to reverse inventory
        cursor.execute("SELECT * FROM sale_items WHERE sale_num=%s", (sale_num,))
        items = [dict(row) for row in cursor.fetchall()]
        
        # Reverse the inventory for each item
        for item in items:
            item_name = item['item_name']
            quantity = item['quantity']
            
            cursor.execute("SELECT quantity FROM products WHERE name=%s", (item_name,))
            product = cursor.fetchone()
            
            if product:
                new_qty = product['quantity'] + quantity
                cursor.execute("UPDATE products SET quantity=%s WHERE name=%s", (new_qty, item_name))
        
        # Delete sale items
        cursor.execute("DELETE FROM sale_items WHERE sale_num=%s", (sale_num,))
        
        # Delete the sale
        cursor.execute("DELETE FROM sales WHERE sale_num=%s", (sale_num,))
        
        # Delete related transactions (Supply type)
        cursor.execute("DELETE FROM transactions WHERE type='Supply' AND item_name IN (SELECT item_name FROM sale_items WHERE sale_num=%s)", (sale_num,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': f'Sale {sale_num} deleted successfully. Inventory reversed.'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)

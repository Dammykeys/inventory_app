from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import datetime
import os
from fpdf import FPDF
from pathlib import Path
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# Configure Database URL with fix for common 'postgres://' prefix issue
db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config['DATABASE_URL'] = db_url
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Initialize Connection Pool Safely
db_pool = None
try:
    if app.config['DATABASE_URL']:
        db_pool = pool.ThreadedConnectionPool(
            1, 20, # min, max connections
            app.config['DATABASE_URL']
        )
        print("Database connection pool initialized.")
    else:
        print("WARNING: DATABASE_URL not found in environment.")
except Exception as e:
    print(f"CRITICAL: Failed to initialize database pool: {e}")


def get_db_connection():
    """Get a connection from the pool"""
    global db_pool
    if not db_pool:
        raise Exception("Database connection pool is not initialized. Check your DATABASE_URL.")
    
    try:
        return db_pool.getconn()
    except Exception as e:
        print(f"Error getting connection from pool: {e}")
        # Try to re-initialize if pool is dead
        try:
            db_pool = pool.ThreadedConnectionPool(1, 20, app.config['DATABASE_URL'])
            return db_pool.getconn()
        except:
            raise e

def release_db_connection(conn):
    """Return a connection to the pool"""
    if not db_pool or not conn:
        return
    try:
        db_pool.putconn(conn)
    except Exception as e:
        print(f"Error releasing connection: {e}")

def init_db():
    if not db_pool:
        print("Skipping init_db: No database pool available.")
        return
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS products 
                          (id SERIAL PRIMARY KEY, 
                           name TEXT UNIQUE, 
                           quantity INTEGER, 
                           reorder_level INTEGER, 
                           cost_price DOUBLE PRECISION DEFAULT 0, 
                           selling_price DOUBLE PRECISION DEFAULT 0, 
                           brand TEXT)''')
        
        # Ensure new columns exist for existing tables
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='cost_price'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE products ADD COLUMN cost_price DOUBLE PRECISION DEFAULT 0")
        
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='selling_price'")
        if not cursor.fetchone():
            cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='price'")
            if cursor.fetchone():
                cursor.execute("ALTER TABLE products RENAME COLUMN price TO selling_price")
            else:
                cursor.execute("ALTER TABLE products ADD COLUMN selling_price DOUBLE PRECISION DEFAULT 0")
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS transactions 
                          (id SERIAL PRIMARY KEY, 
                           item_name TEXT, 
                           quantity INTEGER, 
                           type TEXT, 
                           date TEXT, 
                           time TEXT,
                           performed_by TEXT)''')
        
        # Ensure performed_by exists for existing transactions table
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='performed_by'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE transactions ADD COLUMN performed_by TEXT")
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS sales 
                          (id SERIAL PRIMARY KEY, 
                           sale_num TEXT UNIQUE, 
                           customer TEXT, 
                           date TEXT, 
                           time TEXT, 
                           total_amount DOUBLE PRECISION, 
                           payment_status TEXT,
                           performed_by TEXT)''')
        
        # Ensure performed_by exists for existing sales table
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='sales' AND column_name='performed_by'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE sales ADD COLUMN performed_by TEXT")
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS sale_items 
                          (id SERIAL PRIMARY KEY, 
                           sale_num TEXT, 
                           item_name TEXT, 
                           quantity INTEGER, 
                           price DOUBLE PRECISION, 
                           total DOUBLE PRECISION)''')
    
        cursor.execute('''CREATE TABLE IF NOT EXISTS expenses 
                          (id SERIAL PRIMARY KEY, 
                           description TEXT, 
                           category TEXT, 
                           amount DOUBLE PRECISION, 
                           date TEXT, 
                           time TEXT, 
                           notes TEXT)''')
        
        # Users Table
        cursor.execute('''CREATE TABLE IF NOT EXISTS users 
                          (id SERIAL PRIMARY KEY, 
                           username TEXT UNIQUE NOT NULL,
                           password_hash TEXT NOT NULL,
                           full_name TEXT,
                           email TEXT,
                           role TEXT NOT NULL DEFAULT 'staff',
                           created_at TEXT,
                           is_active BOOLEAN DEFAULT TRUE)''')
    
        cursor.execute('''CREATE TABLE IF NOT EXISTS activity_log 
                          (id SERIAL PRIMARY KEY, 
                           user_id INTEGER, 
                           username TEXT, 
                           action TEXT, 
                           details TEXT, 
                           timestamp TEXT)''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS customers 
                          (id SERIAL PRIMARY KEY, 
                           name TEXT UNIQUE, 
                           phone TEXT, 
                           email TEXT, 
                           address TEXT, 
                           total_debt DOUBLE PRECISION DEFAULT 0,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
        # Create default admin if not exists
        cursor.execute("SELECT * FROM users WHERE username=%s", ('admin',))
        if not cursor.fetchone():
            admin_hash = generate_password_hash('admin123')
            created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""INSERT INTO users (username, password_hash, full_name, email, role, created_at, is_active)
                             VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                          ('admin', admin_hash, 'Administrator', 'admin@inventory.local', 'admin', created_at, True))
            print("Default admin account created.")
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)")
        
        conn.commit()
        print("Database schema initialized successfully.")
    except Exception as e:
        print(f"Error during init_db: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            release_db_connection(conn)

# Safely run init_db
with app.app_context():
    try:
        init_db()
    except Exception as e:
        print(f"Safe init_db failed: {e}")

# --- AUTHENTICATION HELPERS ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Authentication required'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Authentication required'}), 401
            return redirect(url_for('login'))
        
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute('SELECT role FROM users WHERE id = %s', (session['user_id'],))
            user = cursor.fetchone()
            if not user or user['role'] != 'admin':
                return jsonify({'success': False, 'error': 'Admin privileges required'}), 403
            return f(*args, **kwargs)
        except Exception as e:
            print(f"Auth check error: {e}")
            return jsonify({'success': False, 'error': 'Internal authentication error'}), 500
        finally:
            if conn:
                release_db_connection(conn)
    return decorated_function


# --- ACTIVITY LOG HELPER ---
def log_activity(action, details=""):
    conn = None
    try:
        user_id = session.get('user_id')
        username = session.get('username', 'System')
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""INSERT INTO activity_log (user_id, username, action, details, timestamp) 
                         VALUES (%s, %s, %s, %s, %s)""",
                      (user_id, username, action, details, timestamp))
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error logging activity: {e}")
    finally:
        if conn:
            release_db_connection(conn)


@app.route('/api/backup/local', methods=['POST'])
@admin_required
def perform_local_backup():
    """Backup all PostgreSQL data to a local SQLite database"""
    pg_conn = get_db_connection()
    try:
        import sqlite3
        sqlite_conn = sqlite3.connect('emergency_backup.db')
        sqlite_cursor = sqlite_conn.cursor()
        
        pg_cursor = pg_conn.cursor(cursor_factory=RealDictCursor)
        
        tables = ['products', 'transactions', 'sales', 'sale_items', 'expenses', 'users', 'activity_log']
        
        for table in tables:
            # Get data from Postgres
            pg_cursor.execute(f"SELECT * FROM {table}")
            rows = pg_cursor.fetchall()
            
            if not rows:
                continue
                
            # Create table in SQLite (simplified)
            columns = rows[0].keys()
            col_types = ", ".join([f"{col} TEXT" for col in columns]) # Simplified to TEXT for backup
            sqlite_cursor.execute(f"DROP TABLE IF EXISTS {table}")
            sqlite_cursor.execute(f"CREATE TABLE {table} ({col_types})")
            
            # Insert data
            placeholders = ", ".join(["?" for _ in columns])
            insert_query = f"INSERT INTO {table} VALUES ({placeholders})"
            
            data_to_insert = [tuple(str(row[col]) if row[col] is not None else "" for col in columns) for row in rows]
            sqlite_cursor.executemany(insert_query, data_to_insert)
            
        sqlite_conn.commit()
        sqlite_conn.close()
        
        log_activity('Local Backup', "Manual emergency backup to SQLite performed")
        return jsonify({'success': True, 'message': 'Local emergency backup created successfully (emergency_backup.db)'})
    except Exception as e:
        print(f"Backup error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(pg_conn)


@app.route('/api/activity-log')
@login_required
def get_activity_log():
    # Only admins can see full activity log
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute('SELECT role FROM users WHERE id = %s', (session['user_id'],))
        user = cursor.fetchone()
        
        if not user or user['role'] != 'admin':
            # Non-admins only see their own logs
            cursor.execute('SELECT * FROM activity_log WHERE user_id = %s ORDER BY timestamp DESC LIMIT 100', (session['user_id'],))
        else:
            cursor.execute('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 200')
            
        logs = cursor.fetchall()
        return jsonify({'success': True, 'logs': logs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


# --- ROUTES ---



# --- ROUTES ---
@app.route('/')
def index():
    return render_template('dashboard.html')

@app.route('/api/dashboard-combined')
@login_required
def get_dashboard_combined():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        print(f"DEBUG: Starting get_dashboard_combined. Date Filter: '{date_filter}'")
        # 1. Aggregated Inventory Stats (Optimized: No more fetching entire table)
        cursor.execute("""
            SELECT 
                COUNT(*) as total_items,
                SUM(CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock_count,
                SUM(quantity) as total_units
            FROM products
        """)
        inv_stats = cursor.fetchone()
        print(f"DEBUG: Inv stats: {inv_stats}")
        
        # 2. Recent Low Stock Items (Limit to 10 for dashboard)
        cursor.execute("SELECT * FROM products WHERE quantity <= reorder_level ORDER BY quantity ASC LIMIT 10")
        low_stock_products = cursor.fetchall()
        print(f"DEBUG: Low stock products count: {len(low_stock_products)}")
        
        # 3. Recent Transactions
        cursor.execute("SELECT * FROM transactions ORDER BY date DESC, time DESC LIMIT 10")
        transactions = cursor.fetchall()
        print(f"DEBUG: Transactions count: {len(transactions)}")
        
        # 4. Sales Summary
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
        sales_summary_res = cursor.fetchone()
        
        sales_summary = {
            'total_sales': sales_summary_res['total_sales'] or 0,
            'total_revenue': sales_summary_res['total_revenue'] or 0,
            'paid_amount': sales_summary_res['paid_amount'] or 0,
            'credit_amount': sales_summary_res['credit_amount'] or 0,
            'pending_amount': sales_summary_res['pending_amount'] or 0
        }
        
        # 5. Metrics (Expenses)
        if date_filter:
            cursor.execute("SELECT SUM(amount) as total_expenses FROM expenses WHERE date=%s", (date_filter,))
        else:
            cursor.execute("SELECT SUM(amount) as total_expenses FROM expenses")
        
        exp_res = cursor.fetchone()
        total_expenses = exp_res['total_expenses'] or 0
        print(f"DEBUG: Total expenses: {total_expenses}")
        
        # 6. Recent Sales
        if date_filter:
            cursor.execute("SELECT * FROM sales WHERE date=%s ORDER BY date DESC, time DESC LIMIT 10", (date_filter,))
        else:
            cursor.execute("SELECT * FROM sales ORDER BY date DESC, time DESC LIMIT 10")
        recent_sales = cursor.fetchall()
        print(f"DEBUG: Recent sales count: {len(recent_sales)}")
        
        print("DEBUG: Finalizing response...")
        return jsonify({
            'success': True,
            'inventory_stats': {
                'total_items': inv_stats['total_items'] or 0,
                'low_stock_count': inv_stats['low_stock_count'] or 0,
                'total_units': inv_stats['total_units'] or 0
            },
            'low_stock_products': low_stock_products,
            'transactions': transactions,
            'sales_summary': sales_summary,
            'metrics': {
                'total_revenue': sales_summary['total_revenue'],
                'total_expenses': total_expenses
            },
            'recent_sales': recent_sales
        })


        
    except Exception as e:
        import traceback
        print(f"Dashboard Combined Error: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

@app.route('/api/inventory')
@login_required
def get_inventory():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM products ORDER BY LOWER(name) ASC")
        products = cursor.fetchall()
        return jsonify(products)
    except Exception as e:
        import traceback
        print(f"Inventory Error: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/low-stock')
@login_required
def get_low_stock():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM products WHERE quantity <= reorder_level ORDER BY quantity ASC")
        products = cursor.fetchall()
        return jsonify({'success': True, 'products': products})
    except Exception as e:
        import traceback
        print(f"Low Stock Error: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)



@app.route('/api/add-entry', methods=['POST'])
def add_entry():
    data = request.json
    name = data.get('name', '').strip()
    qty = data.get('quantity')
    brand = data.get('brand', '').strip()
    cost_price = data.get('cost_price', 0)
    selling_price = data.get('selling_price', 0)
    entry_type = data.get('type', 'Intake')
    
    if not name or not isinstance(qty, int) or qty <= 0:
        return jsonify({'success': False, 'error': 'Invalid name or quantity'}), 400
    
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        cursor.execute("SELECT quantity FROM products WHERE name=%s", (name,))
        row = cursor.fetchone()
        
        if row:
            new_qty = row['quantity'] + qty if entry_type == "Intake" else row['quantity'] - qty
            if new_qty < 0:
                return jsonify({'success': False, 'error': 'Insufficient stock'}), 400
            
            # Update quantity, prices, and brand if it's an Intake
            if entry_type == "Intake":
                cursor.execute("UPDATE products SET quantity=%s, cost_price=%s, selling_price=%s, brand=%s WHERE name=%s", 
                              (new_qty, cost_price, selling_price, brand, name))
            else:
                cursor.execute("UPDATE products SET quantity=%s WHERE name=%s", (new_qty, name))
        else:
            if entry_type == "Supply":
                return jsonify({'success': False, 'error': 'Item does not exist in stock'}), 400
            
            # For new items, set initial quantity, reorder level, and prices
            cursor.execute("INSERT INTO products (name, quantity, reorder_level, brand, cost_price, selling_price) VALUES (%s, %s, %s, %s, %s, %s)", 
                          (name, qty, 5, brand, cost_price, selling_price))
        
        username = session.get('username', 'System')
        cursor.execute("INSERT INTO transactions (item_name, quantity, type, date, time, performed_by) VALUES (%s,%s,%s,%s,%s,%s)",
                      (name, qty, entry_type, date_str, time_str, username))
        conn.commit()
        
        # Log the inventory activity
        log_activity(f"Inventory {entry_type}", f"Item: {name}, Qty: {qty}, Brand: {brand}")
        return jsonify({'success': True, 'message': f'{entry_type} recorded successfully!'})
    except psycopg2.Error:
        conn.rollback()
        return jsonify({'success': False, 'error': 'Item name already exists'}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        release_db_connection(conn)

@app.route('/api/update-reorder', methods=['POST'])
@login_required
def update_reorder():
    data = request.json
    name = data.get('name', '').strip()
    level = data.get('level')
    
    if not name or not isinstance(level, int) or level < 0:
        return jsonify({'success': False, 'error': 'Invalid input'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE products SET reorder_level=%s WHERE name=%s", (level, name))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/transactions')
@login_required
def get_transactions():
    date_filter = request.args.get('date')
    type_filter = request.args.get('type', 'All')
    
    conn = get_db_connection()
    try:
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
        return jsonify(transactions)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

@app.route('/api/generate-invoice', methods=['POST'])
@login_required
def generate_invoice():
    data = request.json
    customer = data.get('customer', '').strip()
    item = data.get('item', '').strip()
    qty = data.get('quantity')
    
    if not customer or not item or not isinstance(qty, int) or qty <= 0:
        return jsonify({'success': False, 'error': 'Invalid input'}), 400
    
    conn = get_db_connection()
    try:
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
        pdf.cell(15, 10, "S/N", border=1)
        pdf.cell(85, 10, "Item Name", border=1)
        pdf.cell(40, 10, "Quantity", border=1)
        pdf.ln()
        pdf.cell(15, 10, "1", border=1)
        pdf.cell(85, 10, item, border=1)
        pdf.cell(40, 10, str(qty), border=1)
        
        file_name = f"{inv_num}.pdf"
        pdf.output(file_name)
        
        return jsonify({'success': True, 'message': f'Invoice {file_name} generated', 'file': file_name})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/download/<filename>')
def download_file(filename):
    if os.path.exists(filename):
        return send_file(filename, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

@app.route('/api/delete-product/<int:product_id>', methods=['DELETE'])
@admin_required
def delete_product(product_id):
    conn = get_db_connection()
    try:
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
        return jsonify({'success': True, 'message': f'Product "{product_name}" deleted successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/delete-transaction/<int:transaction_id>', methods=['DELETE'])
@admin_required
def delete_transaction(transaction_id):
    conn = get_db_connection()
    try:
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
        return jsonify({'success': True, 'message': f'Transaction deleted successfully. Inventory adjusted for "{item_name}"'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


# --- SALES & CREDIT ROUTES ---
@app.route('/api/create-sale', methods=['POST'])
@login_required
def create_sale():
    data = request.json
    customer = data.get('customer', '').strip()
    items = data.get('items', [])
    payment_status = data.get('payment_status', 'Pending')
    
    if not customer or not items:
        return jsonify({'success': False, 'error': 'Customer and items required'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Generate sale number
        sale_num = f"SALE-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        today = datetime.date.today().strftime("%Y-%m-%d")
        current_time = datetime.datetime.now().strftime("%H:%M:%S")
        total_amount = 0
        
        username = session.get('username', 'System')
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
                
                # Log transaction with performed_by
                cursor.execute("INSERT INTO transactions (item_name, quantity, type, date, time, performed_by) VALUES (%s,%s,'Supply',%s,%s,%s)",
                               (item_name, quantity, today, current_time, username))
            
            # Add sale item
            cursor.execute("INSERT INTO sale_items (sale_num, item_name, quantity, price, total) VALUES (%s,%s,%s,%s,%s)",
                          (sale_num, item_name, quantity, price, item_total))
        
        # Create sale record with performed_by
        cursor.execute("INSERT INTO sales (sale_num, customer, date, time, total_amount, payment_status, performed_by) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                      (sale_num, customer, today, current_time, total_amount, payment_status, username))
        
        # Log the sale activity
        log_activity("Create Sale", f"Sale #{sale_num}, Customer: {customer}, Amount: {total_amount}")
        
        # --- CUSTOMER MANAGEMENT SYNC ---
        # 1. Check if customer exists, if not create them
        cursor.execute("SELECT id, total_debt FROM customers WHERE name = %s", (customer,))
        cust_record = cursor.fetchone()
        
        if not cust_record:
            # Auto-create customer
            cursor.execute("INSERT INTO customers (name, total_debt) VALUES (%s, 0) RETURNING id", (customer,))
            cust_record = {'id': cursor.fetchone()['id'], 'total_debt': 0}
            print(f"DEBUG: Auto-created customer: {customer}")

        # 2. Update debt if it's a Credit sale
        if payment_status == 'Credit':
            cursor.execute("UPDATE customers SET total_debt = total_debt + %s WHERE id = %s", 
                           (total_amount, cust_record['id']))
            print(f"DEBUG: Updated debt for {customer}: +{total_amount}")
        
        conn.commit()
        log_activity('Create Sale', f"Sale No: {sale_num}, Total: {total_amount}, Customer: {customer}")
        return jsonify({'success': True, 'message': 'Sale created successfully', 'sale_num': sale_num, 'total': total_amount})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        release_db_connection(conn)


@app.route('/api/sales')
@login_required
def get_sales():
    customer_filter = request.args.get('customer', '').strip()
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    try:
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
        return jsonify(sales)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/sales-summary')
@login_required
def get_sales_summary():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    try:
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
        return jsonify({
            'total_sales': result['total_sales'] or 0,
            'total_revenue': result['total_revenue'] or 0,
            'paid_amount': result['paid_amount'] or 0,
            'credit_amount': result['credit_amount'] or 0,
            'pending_amount': result['pending_amount'] or 0
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/dashboard-metrics')
@login_required
def get_dashboard_metrics():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    try:
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
        
        return jsonify({
            'total_revenue': total_revenue,
            'total_expenses': total_expenses,
            'net_profit': net_profit
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/sale/<sale_num>')
@login_required
def get_sale_details(sale_num):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
        sale = cursor.fetchone()
        
        if not sale:
            return jsonify({'success': False, 'error': 'Sale not found'}), 404
        
        cursor.execute("SELECT * FROM sale_items WHERE sale_num=%s", (sale_num,))
        items = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'sale': dict(sale),
            'items': items
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/generate-sale-invoice/<sale_num>', methods=['GET'])
@login_required
def generate_sale_invoice(sale_num):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
        sale = cursor.fetchone()
        
        if not sale:
            return jsonify({'success': False, 'error': 'Sale not found'}), 404
        
        cursor.execute("SELECT * FROM sale_items WHERE sale_num=%s", (sale_num,))
        items = [dict(row) for row in cursor.fetchall()]
        
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
        pdf.cell(15, 8, "S/N", border=1)
        pdf.cell(65, 8, "Item", border=1)
        pdf.cell(20, 8, "Qty", border=1)
        pdf.cell(40, 8, "Price", border=1)
        pdf.cell(40, 8, "Total", border=1, ln=True)
        
        # Table rows
        pdf.set_font("Arial", size=10)
        for i, item in enumerate(items, start=1):
            pdf.cell(15, 8, str(i), border=1)
            pdf.cell(65, 8, item['item_name'][:20], border=1)
            pdf.cell(20, 8, str(item['quantity']), border=1)
            pdf.cell(40, 8, f"{float(item['price']):,.2f}", border=1)
            pdf.cell(40, 8, f"{float(item['total']):,.2f}", border=1, ln=True)
        
        # Total
        pdf.set_font("Arial", 'B', 11)
        pdf.cell(140, 10, "Total Amount:", border=0, align='R')
        pdf.cell(40, 10, f"{float(sale['total_amount']):,.2f}", border=1, ln=True)
        
        pdf.set_font("Arial", size=9)
        pdf.ln(5)
        pdf.cell(190, 8, f"Payment Status: {sale['payment_status']}", align='C')
        
        file_name = f"{sale_num}.pdf"
        pdf.output(file_name)
        
        return jsonify({'success': True, 'file': file_name})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/update-sale-status/<sale_num>', methods=['POST'])
@login_required
def update_sale_status(sale_num):
    data = request.json
    new_status = data.get('status', '').strip()
    
    valid_statuses = ['Pending', 'Paid', 'Credit', 'Partial']
    
    if new_status not in valid_statuses:
        return jsonify({'success': False, 'error': 'Invalid payment status'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
        sale = cursor.fetchone()
        
        if not sale:
            return jsonify({'success': False, 'error': 'Sale not found'}), 404
        
        cursor.execute("UPDATE sales SET payment_status=%s WHERE sale_num=%s", (new_status, sale_num))
        
        # Update customer debt if status changed from Credit to Paid
        if sale['payment_status'] == 'Credit' and new_status == 'Paid':
            cursor.execute("UPDATE customers SET total_debt = total_debt - %s WHERE name = %s", 
                           (sale['total_amount'], sale['customer']))
        # Update customer debt if status changed from something else to Credit
        elif sale['payment_status'] != 'Credit' and new_status == 'Credit':
            # Ensure customer exists (could have been deleted or manually added to sales)
            cursor.execute("SELECT id FROM customers WHERE name = %s", (sale['customer'],))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO customers (name, total_debt) VALUES (%s, 0)", (sale['customer'],))
            
            cursor.execute("UPDATE customers SET total_debt = total_debt + %s WHERE name = %s", 
                           (sale['total_amount'], sale['customer']))

        conn.commit()
        return jsonify({'success': True, 'message': f'Payment status updated to {new_status}'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


# --- EXPENSES ROUTES ---
@app.route('/api/add-expense', methods=['POST'])
@login_required
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
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("INSERT INTO expenses (description, category, amount, date, time, notes) VALUES (%s,%s,%s,%s,%s,%s)",
                      (description, category, amount, date_str, time_str, notes))
        conn.commit()
        log_activity('Add Expense', f"Description: {description}, Amount: {amount}")
        return jsonify({'success': True, 'message': 'Expense recorded successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        release_db_connection(conn)


@app.route('/api/expenses')
@login_required
def get_expenses():
    date_filter = request.args.get('date', '').strip()
    category_filter = request.args.get('category', '').strip()
    
    conn = get_db_connection()
    try:
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
        return jsonify(expenses)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/expenses-summary')
@login_required
def get_expenses_summary():
    date_filter = request.args.get('date', '').strip()
    
    conn = get_db_connection()
    try:
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
        
        return jsonify({
            'total_expenses': result['total_expenses'] or 0,
            'by_category': categories
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/delete-expense/<int:expense_id>', methods=['DELETE'])
@admin_required
def delete_expense(expense_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM expenses WHERE id=%s", (expense_id,))
        expense = cursor.fetchone()
        
        if not expense:
            return jsonify({'success': False, 'error': 'Expense not found'}), 404
        
        cursor.execute("DELETE FROM expenses WHERE id=%s", (expense_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Expense deleted successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/delete-sale/<sale_num>', methods=['DELETE'])
@admin_required
def delete_sale(sale_num):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get sale details before deleting
        cursor.execute("SELECT * FROM sales WHERE sale_num=%s", (sale_num,))
        sale = cursor.fetchone()
        
        if not sale:
            return jsonify({'success': False, 'error': 'Sale not found'}), 404
        
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
        return jsonify({'success': True, 'message': f'Sale {sale_num} deleted successfully. Inventory reversed.'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        release_db_connection(conn)



# --- USER MANAGEMENT ROUTES ---
@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users (admin only)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT id, username, full_name, email, role, created_at, is_active FROM users ORDER BY created_at DESC')
        users = cursor.fetchall()
        return jsonify({
            'success': True,
            'users': users
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """Create new user (admin only)"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    email = data.get('email', '').strip()
    role = data.get('role', 'staff')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    if role not in ['admin', 'manager', 'staff']:
        return jsonify({'success': False, 'error': 'Invalid role'}), 400
    
    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(password)
        created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        cursor = conn.cursor()
        cursor.execute("""INSERT INTO users (username, password_hash, full_name, email, role, created_at, is_active)
                       VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (username, password_hash, full_name, email, role, created_at, True))
        user_id = cursor.fetchone()[0]
        conn.commit()
        
        log_activity('Create User', f"Username: {username}, Role: {role}")
        
        return jsonify({
            'success': True,
            'message': 'User created successfully',
            'user_id': user_id
        })
    except psycopg2.Error:
        conn.rollback()
        return jsonify({'success': False, 'error': 'Username already exists'}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update user details (admin only)"""
    data = request.json
    full_name = data.get('full_name')
    email = data.get('email')
    role = data.get('role')
    
    if role and role not in ['admin', 'manager', 'staff']:
        return jsonify({'success': False, 'error': 'Invalid role'}), 400
    
    conn = get_db_connection()
    try:
        updates = []
        params = []
        
        if full_name is not None:
            updates.append('full_name = %s')
            params.append(full_name)
        if email is not None:
            updates.append('email = %s')
            params.append(email)
        if role is not None:
            updates.append('role = %s')
            params.append(role)
        
        if not updates:
            return jsonify({'success': False, 'error': 'No fields to update'}), 400
        
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
        
        log_activity('Update User', f"User ID: {user_id}")
        return jsonify({'success': True, 'message': 'User updated successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/users/<int:user_id>/toggle-active', methods=['POST'])
@admin_required
def toggle_user_active(user_id):
    """Enable/disable user account (admin only)"""
    # Prevent deactivating yourself
    if user_id == session.get('user_id'):
        return jsonify({'success': False, 'error': 'Cannot deactivate your own account'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT is_active FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        new_status = False if user['is_active'] else True
        cursor.execute('UPDATE users SET is_active = %s WHERE id = %s', (new_status, user_id))
        conn.commit()
        
        status_text = 'activated' if new_status else 'deactivated'
        return jsonify({'success': True, 'message': f'User {status_text} successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/users/<int:user_id>/change-password', methods=['POST'])
@login_required
def change_password(user_id):
    """Change user password"""
    data = request.json
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    
    # Users can only change their own password, unless they're admin
    if user_id != session.get('user_id'):
        conn = get_db_connection()
        try:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute('SELECT role FROM users WHERE id = %s', (session['user_id'],))
            user = cursor.fetchone()
            if not user or user['role'] != 'admin':
                return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        finally:
            release_db_connection(conn)
    
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT password_hash FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Verify current password if changing own password
        if user_id == session.get('user_id'):
            if not current_password or not check_password_hash(user['password_hash'], current_password):
                return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401
        
        new_hash = generate_password_hash(new_password)
        cursor.execute('UPDATE users SET password_hash = %s WHERE id = %s', (new_hash, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Password changed successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete user (admin only)"""
    # Prevent deleting yourself
    if user_id == session.get('user_id'):
        return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
        log_activity('Delete User', f"User ID: {user_id}")
        return jsonify({'success': True, 'message': 'User deleted successfully'})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


@app.route('/login')
def login_page():
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
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
        user = cursor.fetchone()
        
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
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)


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

# --- CUSTOMER ENDPOINTS ---
@app.route('/api/customers')
@login_required
def get_customers():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM customers ORDER BY name ASC")
        customers = cursor.fetchall()
        for cust in customers:
            if cust['created_at']:
                cust['created_at'] = cust['created_at'].strftime('%Y-%m-%d %H:%M:%S')
        return jsonify(customers)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

@app.route('/api/add-customer', methods=['POST'])
@login_required
def add_customer():
    data = request.json
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    address = data.get('address', '').strip()

    if not name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO customers (name, phone, email, address) VALUES (%s, %s, %s, %s)",
                       (name, phone, email, address))
        conn.commit()
        return jsonify({'success': True, 'message': 'Customer added successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

@app.route('/api/update-customer/<int:customer_id>', methods=['POST'])
@login_required
def update_customer_endpoint(customer_id):
    data = request.json
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    address = data.get('address', '').strip()

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE customers SET name=%s, phone=%s, email=%s, address=%s WHERE id=%s",
                       (name, phone, email, address, customer_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Customer updated successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

@app.route('/api/delete-customer/<int:customer_id>', methods=['DELETE'])
@login_required
def delete_customer(customer_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM customers WHERE id=%s", (customer_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Customer deleted successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        release_db_connection(conn)

if __name__ == '__main__':
    app.run(debug=True)

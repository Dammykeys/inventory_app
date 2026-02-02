import sqlite3
import datetime
import os
from tkinter import *
from tkinter import ttk, messagebox
from tkcalendar import DateEntry
from fpdf import FPDF

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect("inventory.db")
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS products 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, quantity INTEGER, reorder_level INTEGER)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS transactions 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT, quantity INTEGER, 
                       type TEXT, date TEXT, time TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS invoices 
                      (invoice_num TEXT PRIMARY KEY, date TEXT, customer TEXT, total_items INTEGER)''')
    conn.commit()
    conn.close()

init_db()

# --- MAIN APPLICATION CLASS ---
class InventoryApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Professional Inventory Management System")
        self.root.geometry("1000x700")

        # Container to switch between frames (pages)
        self.container = Frame(self.root)
        self.container.pack(fill="both", expand=True)

        self.frames = {}
        for F in (EntryPage, ReportPage, DailyEntryPage, OrderPage):
            page_name = F.__name__
            frame = F(parent=self.container, controller=self)
            self.frames[page_name] = frame
            frame.grid(row=0, column=0, sticky="nsew")

        self.show_frame("EntryPage")

    def show_frame(self, page_name):
        frame = self.frames[page_name]
        if hasattr(frame, 'refresh'): frame.refresh()
        frame.tkraise()

# --- PAGE 1: ENTRY PAGE ---
class EntryPage(Frame):
    def __init__(self, parent, controller):
        Frame.__init__(self, parent)
        Label(self, text="New Stock Intake / Outgoing Supply", font=("Arial", 18, "bold")).pack(pady=20)
        
        form_frame = Frame(self)
        form_frame.pack(pady=10)

        Label(form_frame, text="Item Name:").grid(row=0, column=0, padx=5, pady=5)
        self.item_name = Entry(form_frame)
        self.item_name.grid(row=0, column=1)

        Label(form_frame, text="Quantity:").grid(row=1, column=0, padx=5, pady=5)
        self.qty = Entry(form_frame)
        self.qty.grid(row=1, column=1)

        Label(form_frame, text="Type:").grid(row=2, column=0, padx=5, pady=5)
        self.type_var = StringVar(value="Intake")
        ttk.Combobox(form_frame, textvariable=self.type_var, values=["Intake", "Supply"]).grid(row=2, column=1)

        Button(self, text="Submit Entry", command=self.save_entry, bg="green", fg="white").pack(pady=20)
        Button(self, text="Go to Reports", command=lambda: controller.show_frame("ReportPage")).pack()

    def save_entry(self):
        name = self.item_name.get().strip()
        qty = self.qty.get()
        t_type = self.type_var.get()
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        if not name or not qty.isdigit():
            messagebox.showerror("Error", "Valid Name and Quantity required")
            return

        qty = int(qty)
        conn = sqlite3.connect("inventory.db")
        c = conn.cursor()
        
        # Update Products table
        c.execute("SELECT quantity FROM products WHERE name=?", (name,))
        row = c.fetchone()
        if row:
            new_qty = row[0] + qty if t_type == "Intake" else row[0] - qty
            c.execute("UPDATE products SET quantity=? WHERE name=?", (new_qty, name))
        else:
            if t_type == "Supply": 
                messagebox.showerror("Error", "Item does not exist in stock")
                return
            c.execute("INSERT INTO products (name, quantity, reorder_level) VALUES (?, ?, ?)", (name, qty, 5))
        
        # Log Transaction
        c.execute("INSERT INTO transactions (item_name, quantity, type, date, time) VALUES (?,?,?,?,?)",
                  (name, qty, t_type, date_str, time_str))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", f"{t_type} recorded successfully!")

# --- PAGE 2: REPORT PAGE ---
class ReportPage(Frame):
    def __init__(self, parent, controller):
        Frame.__init__(self, parent)
        self.controller = controller
        Label(self, text="Inventory Summary & Analysis", font=("Arial", 18, "bold")).pack(pady=10)

        # Reorder Level Update Section
        update_frame = Frame(self)
        update_frame.pack(pady=5)
        Label(update_frame, text="Update Reorder Level for Item:").grid(row=0, column=0)
        self.up_name = Entry(update_frame)
        self.up_name.grid(row=0, column=1, padx=5)
        self.up_level = Entry(update_frame, width=5)
        self.up_level.grid(row=0, column=2, padx=5)
        Button(update_frame, text="Update", command=self.update_reorder).grid(row=0, column=3)

        # Treeview for summary
        self.tree = ttk.Treeview(self, columns=("Name", "Stock", "Reorder", "Status"), show="headings")
        self.tree.heading("Name", text="Item Name")
        self.tree.heading("Stock", text="Available Stock")
        self.tree.heading("Reorder", text="Reorder Level")
        self.tree.heading("Status", text="Status/Analysis")
        self.tree.pack(fill="both", expand=True, padx=20)

        Button(self, text="Back to Entry", command=lambda: controller.show_frame("EntryPage")).pack(side="left", padx=50, pady=10)
        Button(self, text="Daily Log", command=lambda: controller.show_frame("DailyEntryPage")).pack(side="left", pady=10)
        Button(self, text="Place Order", command=lambda: controller.show_frame("OrderPage")).pack(side="right", padx=50, pady=10)

    def refresh(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        conn = sqlite3.connect("inventory.db")
        c = conn.cursor()
        c.execute("SELECT name, quantity, reorder_level FROM products")
        for row in c.fetchall():
            status = "Low Stock!" if row[1] <= row[2] else "Healthy"
            self.tree.insert("", "end", values=(row[0], row[1], row[2], status))
        conn.close()

    def update_reorder(self):
        name = self.up_name.get()
        lvl = self.up_level.get()
        if name and lvl.isdigit():
            conn = sqlite3.connect("inventory.db")
            conn.execute("UPDATE products SET reorder_level=? WHERE name=?", (int(lvl), name))
            conn.commit()
            conn.close()
            self.refresh()

# --- PAGE 3: DAILY ENTRY PAGE ---
class DailyEntryPage(Frame):
    def __init__(self, parent, controller):
        Frame.__init__(self, parent)
        Label(self, text="Daily Transaction Log", font=("Arial", 18, "bold")).pack(pady=10)

        filter_frame = Frame(self)
        filter_frame.pack(pady=5)
        self.date_sel = DateEntry(filter_frame, width=12, background='darkblue', foreground='white', borderwidth=2)
        self.date_sel.grid(row=0, column=0, padx=10)
        
        self.cat_sel = ttk.Combobox(filter_frame, values=["All", "Intake", "Supply"])
        self.cat_sel.set("All")
        self.cat_sel.grid(row=0, column=1, padx=10)

        Button(filter_frame, text="Filter", command=self.refresh).grid(row=0, column=2, padx=10)
        Button(filter_frame, text="Print Report (PDF)", command=self.print_report).grid(row=0, column=3, padx=10)

        self.tree = ttk.Treeview(self, columns=("Time", "Item", "Qty", "Type"), show="headings")
        for col in ("Time", "Item", "Qty", "Type"): self.tree.heading(col, text=col)
        self.tree.pack(fill="both", expand=True, padx=20)
        
        Button(self, text="Back", command=lambda: controller.show_frame("ReportPage")).pack(pady=10)

    def refresh(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        sel_date = self.date_sel.get_date().strftime("%Y-%m-%d")
        cat = self.cat_sel.get()
        
        conn = sqlite3.connect("inventory.db")
        c = conn.cursor()
        if cat == "All":
            c.execute("SELECT time, item_name, quantity, type FROM transactions WHERE date=?", (sel_date,))
        else:
            c.execute("SELECT time, item_name, quantity, type FROM transactions WHERE date=? AND type=?", (sel_date, cat))
        
        for row in c.fetchall():
            self.tree.insert("", "end", values=row)
        conn.close()

    def print_report(self):
        # Logic to generate a simple PDF of current view
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(190, 10, f"Inventory Report - {self.date_sel.get_date()}", ln=True, align='C')
        pdf.set_font("Arial", size=12)
        for i in self.tree.get_children():
            val = self.tree.item(i)['values']
            pdf.cell(190, 10, f"{val[0]} | {val[1]} | Qty: {val[2]} | {val[3]}", ln=True)
        pdf.output("daily_report.pdf")
        os.startfile("daily_report.pdf") # Opens the file for printing

# --- PAGE 4: ORDER & INVOICE PAGE ---
class OrderPage(Frame):
    def __init__(self, parent, controller):
        Frame.__init__(self, parent)
        Label(self, text="Place Order & Generate Invoice", font=("Arial", 18, "bold")).pack(pady=10)
        
        form = Frame(self)
        form.pack(pady=10)
        Label(form, text="Customer Name:").grid(row=0, column=0)
        self.cust = Entry(form)
        self.cust.grid(row=0, column=1)

        Label(form, text="Item:").grid(row=1, column=0)
        self.item_box = ttk.Combobox(form)
        self.item_box.grid(row=1, column=1)

        Label(form, text="Quantity:").grid(row=2, column=0)
        self.order_qty = Entry(form)
        self.order_qty.grid(row=2, column=1)

        Button(self, text="Generate Invoice (PDF)", command=self.generate_invoice, bg="blue", fg="white").pack(pady=20)
        Button(self, text="Back", command=lambda: controller.show_frame("ReportPage")).pack()

    def refresh(self):
        conn = sqlite3.connect("inventory.db")
        c = conn.cursor()
        c.execute("SELECT name FROM products WHERE quantity > 0")
        self.item_box['values'] = [r[0] for r in c.fetchall()]
        conn.close()

    def generate_invoice(self):
        cust = self.cust.get()
        item = self.item_box.get()
        qty_str = self.order_qty.get()
        
        if not cust or not item or not qty_str.isdigit():
            messagebox.showerror("Error", "Fill all fields")
            return

        qty = int(qty_str)
        inv_num = f"INV-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Deduct from stock
        conn = sqlite3.connect("inventory.db")
        c = conn.cursor()
        c.execute("UPDATE products SET quantity = quantity - ? WHERE name = ?", (qty, item))
        c.execute("INSERT INTO transactions (item_name, quantity, type, date, time) VALUES (?,?,'Supply',?,?)",
                  (item, qty, datetime.date.today(), datetime.datetime.now().strftime("%H:%M:%S")))
        conn.commit()
        conn.close()

        # Create PDF Invoice
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", 'B', 20)
        pdf.cell(190, 10, "INVOICE", ln=True, align='C')
        pdf.set_font("Arial", size=12)
        pdf.cell(100, 10, f"Invoice No: {inv_num}", ln=True)
        pdf.cell(100, 10, f"Customer: {cust}", ln=True)
        pdf.cell(100, 10, f"Date: {datetime.date.today()}", ln=True)
        pdf.ln(10)
        pdf.cell(100, 10, "Item Name", border=1)
        pdf.cell(40, 10, "Quantity", border=1)
        pdf.ln()
        pdf.cell(100, 10, item, border=1)
        pdf.cell(40, 10, str(qty), border=1)
        
        file_name = f"{inv_num}.pdf"
        pdf.output(file_name)
        messagebox.showinfo("Success", f"Invoice {file_name} generated and stock updated.")
        os.startfile(file_name)

if __name__ == "__main__":
    root = Tk()
    app = InventoryApp(root)
    root.mainloop()
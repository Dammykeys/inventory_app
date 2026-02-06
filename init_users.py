import psycopg2
import os
from werkzeug.security import generate_password_hash
import datetime

def init_users_db():
    """Initialize users table and create default admin account"""
    conn = psycopg2.connect(os.environ.get('POSTGRES_URL'))
    cursor = conn.cursor()
    
    # Create users table (PostgreSQL syntax)
    cursor.execute('''CREATE TABLE IF NOT EXISTS users 
                      (id SERIAL PRIMARY KEY, 
                       username TEXT UNIQUE NOT NULL,
                       password_hash TEXT NOT NULL,
                       full_name TEXT,
                       email TEXT,
                       role TEXT NOT NULL DEFAULT 'staff',
                       created_at TEXT,
                       is_active BOOLEAN DEFAULT true)''')
    
    # Check if admin user exists
    cursor.execute("SELECT * FROM users WHERE username=%s", ('admin',))
    if not cursor.fetchone():
        # Create default admin account
        admin_hash = generate_password_hash('admin123')
        created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""INSERT INTO users (username, password_hash, full_name, email, role, created_at, is_active)
                         VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                      ('admin', admin_hash, 'Administrator', 'admin@inventory.local', 'admin', created_at, True))
        print("[OK] Default admin account created (username: admin, password: admin123)")
        print("[WARNING] Please change the default password after first login!")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_users_db()
    print("[OK] User database initialized successfully")

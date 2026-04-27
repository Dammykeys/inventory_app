import sqlite3
import os

db_path = 'inventory.db'
if not os.path.exists(db_path):
    print(f'Database file {db_path} NOT FOUND.')
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
    print(f'Tables: {[t[0] for t in tables]}')
    
    for table in [t[0] for t in tables]:
        count = cursor.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        print(f'Table {table}: {count} records')
    
    conn.close()

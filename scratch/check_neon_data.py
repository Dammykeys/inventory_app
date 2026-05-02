import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
neon_url = os.environ.get('DATABASE_URL')

try:
    conn = psycopg2.connect(neon_url)
    cur = conn.cursor()
    cur.execute("SELECT name, quantity FROM products LIMIT 5")
    rows = cur.fetchall()
    print("--- Products in Neon ---")
    for row in rows:
        print(f"Name: {row[0]}, Qty: {row[1]}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")

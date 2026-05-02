import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
neon_url = os.environ.get('DATABASE_URL')

try:
    conn = psycopg2.connect(neon_url)
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions WHERE time = '15:09:06'")
    rows = cur.fetchall()
    print(f"Transactions found: {rows}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")

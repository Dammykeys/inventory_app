import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

neon_url = os.environ.get('DATABASE_URL')
local_url = "postgresql://postgres:postgres@localhost:5432/postgres" # Common default

def count_products(url, name):
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM products")
        count = cur.fetchone()[0]
        print(f"{name} Database: {count} products found.")
        conn.close()
        return count
    except Exception as e:
        print(f"Could not connect to {name} database: {e}")
        return 0

print("--- Database Comparison ---")
count_products(neon_url, "Neon (Cloud)")
count_products(local_url, "Local PostgreSQL")

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv('DATABASE_URL')
print(f"Connecting to: {db_url}")

try:
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    cursor.execute("SELECT 1")
    print("Success!")
    cursor.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")

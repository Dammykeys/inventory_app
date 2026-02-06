import sqlite3
import json

def audit_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    report = {
        "tables": {},
        "integrity": {},
        "performance_hints": []
    }
    
    # Get tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t['name'] for t in cursor.fetchall()]
    
    for table in tables:
        # Schema info
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [dict(c) for c in cursor.fetchall()]
        
        # Row count
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {table}")
        count = cursor.fetchone()['cnt']
        
        # Indexes
        cursor.execute(f"PRAGMA index_list({table})")
        indexes = [dict(i) for i in cursor.fetchall()]
        
        # Foreign Keys
        cursor.execute(f"PRAGMA foreign_key_list({table})")
        fks = [dict(f) for f in cursor.fetchall()]
        
        report["tables"][table] = {
            "columns": columns,
            "row_count": count,
            "indexes": indexes,
            "foreign_keys": fks
        }
        
        # Look for missing indexes on common query fields
        if table == 'transactions' and not any('item_name' in str(idx) for idx in indexes):
            report["performance_hints"].append(f"Table '{table}' might benefit from an index on 'item_name'.")
        if table == 'sales' and not any('customer' in str(idx) for idx in indexes):
            report["performance_hints"].append(f"Table '{table}' might benefit from an index on 'customer'.")

    # Integrity check
    cursor.execute("PRAGMA integrity_check")
    report["integrity"]["result"] = cursor.fetchone()[0]
    
    cursor.execute("PRAGMA foreign_key_check")
    report["integrity"]["foreign_key_violations"] = cursor.fetchall()
    
    conn.close()
    return report

if __name__ == "__main__":
    results = audit_db('inventory.db')
    print(json.dumps(results, indent=2))

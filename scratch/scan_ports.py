import socket

def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        try:
            s.connect(('127.0.0.1', port))
            return True
        except:
            return False

print("--- Port Scan (Local DBs) ---")
for port in range(5430, 5440):
    if check_port(port):
        print(f"Port {port} is OPEN")

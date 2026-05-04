import requests

def test_api(url):
    print(f"Testing {url}...")
    try:
        # Assuming you're logged in? Or does it need auth?
        # The app requires login_required.
        # I'll try to just call it and see if I get 401 or 500.
        r = requests.get(url)
        print(f"Status: {r.status_code}")
        print(f"Body: {r.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

test_api("http://127.0.0.1:5000/api/customers")
test_api("http://127.0.0.1:5000/api/sales")

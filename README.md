# Modern Web-Based Inventory Management System

A beautifully designed, responsive web application for managing inventory with a professional UI built with Flask, HTML5, CSS3, and JavaScript. **Now with full offline functionality!**

## ✨ Key Features

### 🌐 Offline-First Technology (NEW!)
- **Works Completely Offline**: Browse and manage inventory without internet
- **Automatic Data Caching**: All data cached in browser for instant offline access
- **Smart Sync**: Automatically syncs all changes when connection is restored
- **No Data Loss**: All offline operations queued and safely synced
- **Visual Status**: Real-time online/offline status indicator in header

### 📊 Modern Dashboard
- Real-time inventory statistics
- Low stock alerts
- Recent transaction logs
- Financial metrics and calculations
- Date filtering for all reports

### 📦 Inventory Management
- View all items with stock levels
- Update reorder levels easily
- Brand field for product organization
- Search and filter functionality
- Status indicators (Healthy/Low Stock)

### 💳 Sales & Credit Management
- Create sales with multiple items per transaction
- Track customer credits
- Payment status management (Paid/Pending/Credit/Partial)
- Sales history with date filtering
- Quick status updates

### 💰 Expense Tracking
- Record expenses with categories
- Add notes to transactions
- Expense summary and analytics
- Category-wise expense breakdown
- Financial dashboard integration

### 📝 Transaction Tracking
- Record stock intake and outgoing supply
- Filter transactions by date and type
- Complete transaction history
- Timestamp tracking

### 📊 Advanced Analytics
- Daily/monthly transaction logs
- Financial dashboard with metrics
- Inventory summary and analysis
- PDF invoice generation
- Stock movement tracking

## System Requirements

- Python 3.7+
- Modern web browser with offline support (Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+)
- Windows/Mac/Linux

## Installation

1. **Clone or extract the project**
   ```bash
   cd inventory_app
   ```

2. **Create a virtual environment (optional but recommended)**
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment**
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - Mac/Linux:
     ```bash
     source venv/bin/activate
     ```

4. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application

1. **Start the Flask server**
   ```bash
   python app.py
   ```

2. **Open your browser**
   - Navigate to: `http://localhost:5000`

3. **Start managing your inventory!**

4. **Offline mode is automatically available**
   - Browser automatically registers Service Worker
   - Data is cached for offline use
   - Sync happens automatically when connection restored

## Project Structure

```
inventory_app/
├── app.py                           # Flask backend server
├── requirements.txt                 # Python dependencies
├── inventory.db                     # SQLite database (auto-created)
├── OFFLINE_FUNCTIONALITY.md         # Offline feature documentation
├── OFFLINE_TESTING_GUIDE.md         # How to test offline mode
├── OFFLINE_TECHNICAL_DETAILS.md     # Technical architecture
├── OFFLINE_QUICK_REFERENCE.md       # API reference
├── templates/
│   └── dashboard.html              # Main web interface
└── static/
    ├── style.css                   # Modern styling
    ├── script.js                   # Frontend logic
    ├── service-worker.js           # Offline support (Service Worker)
    └── ...
```

## Database Schema

### Products Table
- `id`: Unique identifier
- `name`: Item name
- `quantity`: Current stock quantity
- `reorder_level`: Threshold for low stock alert
- `brand`: Product brand (optional)

### Transactions Table
- `id`: Transaction ID
- `item_name`: Item involved
- `quantity`: Amount transacted
- `type`: Intake or Supply
- `date`: Transaction date
- `time`: Transaction time

### Sales Table
- `id`: Sale ID
- `sale_num`: Unique sale number
- `customer`: Customer name
- `date`: Sale date
- `total_amount`: Sale total
- `payment_status`: Paid/Pending/Credit/Partial

### Sale Items Table
- `id`: Item ID
- `sale_num`: Reference to sale
- `item_name`: Item sold
- `quantity`: Quantity sold
- `price`: Unit price

### Expenses Table
- `id`: Expense ID
- `description`: Expense description
- `category`: Expense category
- `amount`: Expense amount
- `date`: Expense date
- `notes`: Additional notes

## Features Overview

### Dashboard
- Key metrics at a glance
- Monitor low stock items
- Track recent activities
- Financial overview
- Date-based filtering

### Inventory Page
- Complete list of all items with brands
- Quick search functionality
- Update reorder levels with one click
- Status indicators
- **Works offline with cached data**

### Sales & Credit
- Create sales with multiple items
- Track customer credits
- Payment status management
- Sales history with filtering
- **Offline: Create sales, auto-syncs when online**

### Expenses
- Record expenses by category
- Expense summary
- Financial tracking
- **Offline: Record expenses, auto-syncs when online**

### Transactions Page
- View detailed transaction history
- Filter by date and type
- Export as PDF reports
- Complete audit trail

## Offline Functionality Guide

### How It Works
1. **App loads normally** - Caches all data in browser
2. **Connection lost** - App switches to offline mode
3. **Use offline** - All features work with cached data
4. **Create entries** - Sales, expenses, inventory updates queued locally
5. **Connection restored** - All queued operations automatically sync

### Testing Offline Mode
1. **Chrome/Edge/Firefox**:
   - Open DevTools (F12)
   - Go to Network tab
   - Check "Offline" checkbox
   - Continue using the app

2. **What to try**:
   - Add inventory items
   - Create sales
   - Record expenses
   - Note "Offline" badge in header
   - See "saved offline" notifications

3. **Restore connection**:
   - Uncheck "Offline"
   - Watch "Syncing..." progress
   - All data automatically syncs
   - Badge returns to "Online"

### Visual Status
- **🌧️ Offline** (red): No connection
- **⟳ Syncing...** (yellow): Sending changes
- **☁️ Online** (green): Connected and synced

### Data Persistence
- All data stored in browser cache
- Survives page refresh
- Survives browser restart
- Cleared only when clearing browser cache

## Browser Compatibility

✓ Chrome 40+
✓ Firefox 44+
✓ Safari 11.1+
✓ Edge 17+
✓ Mobile browsers

## User Interface Highlights

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Modern Aesthetics**: Clean, professional interface with smooth animations
- **Dark Sidebar**: Easy navigation with organized menu
- **Real-time Updates**: Auto-refresh data without page reload
- **Intuitive Forms**: Clear labels and helpful placeholders
- **Status Badges**: Quick visual indicators and offline status
- **Toast Notifications**: User feedback for all actions
- **Offline Support**: Seamless offline-to-online synchronization

## Keyboard & Navigation

- Click on navigation items to switch pages
- Enter key to submit forms
- Escape key to close modals
- Search box filters inventory in real-time
- DevTools → Network → "Offline" to simulate offline mode

## Troubleshooting

**Problem: Port 5000 already in use**
- Edit `app.py` and change the port: `app.run(debug=True, port=5001)`

**Problem: Database errors**
- Delete `inventory.db` and restart the app to reinitialize

**Problem: Service Worker not working**
- Clear DevTools cache (Application → Cache Storage → Delete all)
- Refresh with Ctrl+Shift+R (hard refresh)
- Check Application tab → Service Workers

**Problem: Offline data not syncing**
- Verify internet connection is stable
- Check DevTools → Network for sync requests
- Try refreshing the page

**See OFFLINE_TESTING_GUIDE.md for comprehensive troubleshooting**

## Documentation

### For Users
- **OFFLINE_FUNCTIONALITY.md** - Complete offline feature guide
- **OFFLINE_TESTING_GUIDE.md** - How to test offline mode

### For Developers
- **OFFLINE_QUICK_REFERENCE.md** - API and function reference
- **OFFLINE_TECHNICAL_DETAILS.md** - Architecture and implementation

## Future Enhancements

- User authentication & role-based access
- Multi-warehouse support
- Advanced reporting and analytics
- Barcode scanning
- Email notifications for low stock
- API integrations with suppliers
- Mobile app version
- Conflict resolution for simultaneous edits
- Background sync API for queue persistence

## Support

For issues or questions:
1. Check the offline documentation files
2. Review DevTools console for error messages
3. See troubleshooting section above
4. Refer to Flask and SQLite official documentation

## Version History

**v2.1** (Current) - Full Offline Support
- Offline functionality with Service Workers
- IndexedDB caching and sync queue
- Automatic synchronization
- Online/offline status indicator
- Complete documentation

**v2.0** - Web-based version
- Sales & Credit management
- Expense tracking
- Financial dashboard
- Item autocomplete

**v1.0** - Original Tkinter desktop app

## License

This project is provided as-is for inventory management purposes.

---

**Current Version**: 2.1 (Offline-Ready)
**Built with**: Flask, HTML5, CSS3, JavaScript, SQLite, Service Workers, IndexedDB
**Status**: ✅ Production Ready

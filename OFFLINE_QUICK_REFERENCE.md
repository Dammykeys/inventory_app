# Offline System - Quick Reference

## API Reference

### IndexedDB Functions

```javascript
// Initialize database (called automatically on page load)
await initIndexedDB()

// Save data to store
await saveToIndexedDB('inventory', products)  // Single store
await saveToIndexedDB('sales', [sales])       // Multiple items

// Get data from store
const products = await getFromIndexedDB('inventory')
const sales = await getFromIndexedDB('sales')
const expenses = await getFromIndexedDB('expenses')

// Add operation to sync queue
await addToSyncQueue('POST', '/api/add-entry', { name, quantity })
await addToSyncQueue('POST', '/api/create-sale', { customer, items })

// Get pending operations
const pending = await getPendingSyncOperations()
// Returns: [ { id, method, endpoint, data, timestamp, synced } ]

// Mark operation as synced
await markAsSynced(operationId)
```

### Status Functions

```javascript
// Update sync status badge
updateSyncStatus('Syncing...', 'syncing')  // Yellow spinner
updateSyncStatus('Offline', 'offline')      // Red badge
updateSyncStatus('', 'synced')              // Green badge
updateSyncStatus('', '')                    // Hide badge
```

### Sync Functions

```javascript
// Manually trigger sync (called automatically on 'online' event)
await syncOfflineChanges()
```

## Common Patterns

### Pattern 1: GET Request with Caching
```javascript
async function loadData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        await saveToIndexedDB('data_store', data);  // Cache it
        return data;
    } catch (error) {
        if (!navigator.onLine) {
            return await getFromIndexedDB('data_store');  // Use cache
        }
        throw error;
    }
}
```

### Pattern 2: POST Request with Offline Queuing
```javascript
async function createData(payload) {
    try {
        const response = await fetch('/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (error) {
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/create', payload);
            showNotification('Saved offline - will sync when online', 'info');
            updateSyncStatus('Offline', 'offline');
            return { success: true, offline: true };
        }
        throw error;
    }
}
```

### Pattern 3: Check Online Status
```javascript
if (navigator.onLine) {
    // Connected to internet
} else {
    // Offline
}

// Or use event listeners
window.addEventListener('online', () => {
    syncOfflineChanges();
});

window.addEventListener('offline', () => {
    updateSyncStatus('Offline', 'offline');
});
```

## Database Stores

### inventory
```javascript
{
    id: 1,
    name: "Product Name",
    quantity: 50,
    reorder_level: 10,
    price: 100.00,
    brand: "Brand Name"
}
```

### sales
```javascript
{
    id: 1,
    sale_num: "SALE-001",
    customer: "Customer Name",
    date: "2026-02-02",
    total_amount: 5000.00,
    payment_status: "Paid" // or "Pending", "Credit", "Partial"
}
```

### expenses
```javascript
{
    id: 1,
    description: "Expense Description",
    category: "Supplies",
    amount: 1000.00,
    date: "2026-02-02",
    notes: "Optional notes"
}
```

### syncQueue
```javascript
{
    id: 1,  // Auto-increment
    method: "POST",
    endpoint: "/api/add-entry",
    data: { name, quantity, type },
    timestamp: 1643836800000,
    synced: false
}
```

## Status Badge States

```javascript
// Offline (red badge)
updateSyncStatus('Offline', 'offline')
// Shows: 🌧️ Offline

// Syncing (yellow with spinner)
updateSyncStatus('Syncing...', 'syncing')
// Shows: ⟳ Syncing...

// Online (green badge)
updateSyncStatus('', 'synced')
// Shows: ☁️ Online

// Hidden (no badge)
updateSyncStatus('', '')
// Shows: nothing
```

## Notifications

```javascript
// Show notification with type
showNotification('Message here', 'success')  // Green
showNotification('Message here', 'error')    // Red
showNotification('Message here', 'warning')  // Orange
showNotification('Message here', 'info')     // Blue

// Auto-disappears after 3 seconds
```

## Events

### Online Event
```javascript
window.addEventListener('online', () => {
    console.log('Connection restored');
    updateSyncStatus('Syncing...', 'syncing');
    syncOfflineChanges();
});
```

### Offline Event
```javascript
window.addEventListener('offline', () => {
    console.log('Connection lost');
    updateSyncStatus('Offline', 'offline');
});
```

## DevTools Inspection

### Check Service Worker Status
1. Open DevTools (F12)
2. Application tab → Service Workers
3. Should see "service-worker.js" - activated and running

### Check IndexedDB Data
1. Open DevTools (F12)
2. Application tab → IndexedDB → InventoryAppDB
3. Expand any store to see data
4. Check "syncQueue" for pending operations

### Check Cache Storage
1. Open DevTools (F12)
2. Application tab → Cache Storage
3. See "inventory-app-v1" (static assets)
4. See "inventory-app-api-v1" (API responses)

### Monitor Network Requests
1. Open DevTools (F12)
2. Network tab
3. Check "Offline" to simulate offline mode
4. Watch sync requests when going back online

### Check Console
1. Open DevTools (F12)
2. Console tab
3. See logs like "Synced: POST /api/add-entry"
4. Check for errors (red messages)

## Debugging Tips

### Log Pending Operations
```javascript
const pending = await getPendingSyncOperations();
console.log('Pending operations:', pending);
```

### Check Database State
```javascript
const inventory = await getFromIndexedDB('inventory');
const sales = await getFromIndexedDB('sales');
const expenses = await getFromIndexedDB('expenses');
const queue = await getFromIndexedDB('syncQueue');
console.log({ inventory, sales, expenses, queue });
```

### Clear All Data
```javascript
// Clear specific store
db.transaction(['syncQueue'], 'readwrite').objectStore('syncQueue').clear();

// Clear entire database
indexedDB.deleteDatabase('InventoryAppDB');

// Then reload page
location.reload();
```

### Force Sync
```javascript
// Manually trigger sync
await syncOfflineChanges();
```

### Check Online Status
```javascript
console.log('Online:', navigator.onLine);
// Output: true or false
```

## Troubleshooting Commands

### Verify Service Worker Installed
```javascript
navigator.serviceWorker.getRegistrations()
    .then(registrations => console.log('Service Workers:', registrations));
```

### Check for Unsynced Operations
```javascript
const pending = await getPendingSyncOperations();
if (pending.length > 0) {
    console.log('Unsynced operations:', pending.length);
    pending.forEach(op => console.log(`${op.method} ${op.endpoint}`));
} else {
    console.log('All operations synced');
}
```

### View Sync Queue in IndexedDB
```javascript
const queue = await getFromIndexedDB('syncQueue');
console.table(queue);
```

### Test Offline Mode
```javascript
// In console while viewing page:
window.dispatchEvent(new Event('offline'));
// Simulate offline

window.dispatchEvent(new Event('online'));
// Simulate online
```

## Performance Tips

### Optimize Sync Performance
- Keep sync queue small (<=50 items typical)
- Regular testing prevents large queues
- Consider manual sync in high-latency scenarios

### Reduce Storage Usage
- Archive old sales/expenses periodically
- Clear cache manually if needed
- Monitor storage with DevTools

### Improve Load Times
- First load caches data in background
- Subsequent offline loads are instant
- Sync happens asynchronously

## Best Practices

### For Users
- ✓ Always check status badge before disconnecting
- ✓ Complete critical tasks before losing connection
- ✓ Don't rapidly toggle online/offline
- ✓ Let sync complete before closing app

### For Developers
- ✓ Always wrap fetch calls in try/catch
- ✓ Queue operations on network error
- ✓ Test offline scenarios regularly
- ✓ Monitor console for errors
- ✓ Update UI status appropriately
- ✓ Cache critical data on load

### Data Safety
- ✓ Never assume data is synced without checking UI
- ✓ Wait for "Online" badge before relying on sync
- ✓ Test recovery from network failures
- ✓ Backup important data periodically

## Common Issues & Solutions

### Service Worker Not Updating
**Problem**: Changes to service-worker.js not taking effect
**Solution**: 
1. Clear DevTools cache
2. DevTools → Application → Cache → Delete all
3. Refresh page with Ctrl+Shift+R

### Data Not Syncing
**Problem**: Operations remain in syncQueue after reconnection
**Solution**:
1. Check internet connection is stable
2. Verify server is responding (Network tab)
3. Refresh page and try again
4. Check browser console for errors

### Duplicate Entries After Sync
**Problem**: Data appears multiple times
**Solution**:
1. Reload page to refresh from server
2. Duplicates indicate sync issues
3. Check DevTools → Network for errors

### Storage Full Error
**Problem**: "QuotaExceededError" in console
**Solution**:
1. Clear old data from IndexedDB
2. Delete cache: Application → Cache → Delete
3. Rebuild database: Delete → Reload page

## Quick Start for New Features

### Adding Offline Support to New Form

1. **Wrap fetch in try/catch**:
```javascript
try {
    const response = await fetch(url, options);
    return response.json();
} catch (error) {
    if (!navigator.onLine) {
        await addToSyncQueue(method, url, data);
        showNotification('Saved offline', 'info');
        updateSyncStatus('Offline', 'offline');
    } else {
        throw error;
    }
}
```

2. **Cache GET responses**:
```javascript
const response = await fetch(url);
const data = await response.json();
await saveToIndexedDB('store_name', data);
```

3. **Handle offline display**:
```javascript
.catch(error => {
    if (!navigator.onLine) {
        const data = await getFromIndexedDB('store_name');
        displayData(data);
        showNotification('Offline mode', 'warning');
    }
});
```

## File Locations

- **Service Worker**: `/static/service-worker.js`
- **Main Script**: `/static/script.js`
- **HTML Template**: `/templates/dashboard.html`
- **Styles**: `/static/style.css`
- **Server Code**: `/app.py`

## Documentation Files

- **OFFLINE_FUNCTIONALITY.md** - Feature overview
- **OFFLINE_TESTING_GUIDE.md** - Testing instructions
- **OFFLINE_TECHNICAL_DETAILS.md** - Architecture details
- **OFFLINE_IMPLEMENTATION_SUMMARY.md** - Summary of changes
- **This file** - Quick reference

---

**Last Updated**: February 2, 2026
**Offline System Version**: 1.0

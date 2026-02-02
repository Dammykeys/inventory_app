# Offline Functionality - Technical Architecture

## System Overview

The offline system uses a three-layer architecture:

```
┌─────────────────────────────────────┐
│     User Interface (HTML/CSS/JS)    │
│  - Shows online/offline status      │
│  - Queues operations locally        │
│  - Caches rendered data             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Service Worker Layer             │
│  - Intercepts network requests      │
│  - Implements cache-first strategy  │
│  - Provides offline responses       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    IndexedDB / Browser Cache        │
│  - Stores product inventory         │
│  - Stores transactions              │
│  - Queues pending operations        │
│  - Persists across sessions         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Flask Server (app.py)          │
│  - Validates operations             │
│  - Updates database                 │
│  - Provides data to client          │
└─────────────────────────────────────┘
```

## Component Details

### 1. Service Worker (`service-worker.js`)

**Purpose**: Network request interception and caching

**Key Functions**:
```javascript
- install: Cache static assets
- activate: Clean old caches
- fetch: Network-first strategy with cache fallback
- message: Listen for client messages
```

**Caching Strategy**:
- **Static Assets**: Cache on first load, serve from cache
- **API Requests**: Try network, cache successful responses
- **Fallback**: Return cached response if network fails
- **Offline Response**: Return JSON with offline flag

**Cache Names**:
- `inventory-app-v1`: Static assets (HTML, CSS, JS)
- `inventory-app-api-v1`: API responses

### 2. IndexedDB Database

**Database**: `InventoryAppDB` (v1)

**Object Stores**:

1. **inventory**
   - Key: `id` (product ID)
   - Data: Product name, quantity, reorder_level, brand
   - Purpose: Cache of current inventory
   - Updated: Whenever inventory loads

2. **sales**
   - Key: `id` (sale ID)
   - Data: Sale number, customer, date, total, status
   - Purpose: Cache of sales history
   - Updated: When sales page loaded

3. **expenses**
   - Key: `id` (expense ID)
   - Data: Description, category, amount, date, notes
   - Purpose: Cache of expense records
   - Updated: When expenses page loaded

4. **transactions**
   - Key: `id` (transaction ID)
   - Data: Item name, quantity, type, date, time
   - Purpose: Cache of transaction history
   - Updated: When transactions page loaded

5. **syncQueue**
   - Key: Auto-incrementing ID
   - Data: `{ method, endpoint, data, timestamp, synced }`
   - Purpose: Queue of pending operations
   - Updated: When operations fail while offline

### 3. Client-Side Logic (`script.js`)

**Key Variables**:
```javascript
const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 1;
let db; // IndexedDB connection

navigator.onLine // Current online status
```

**Core Functions**:

#### Database Functions
```javascript
initIndexedDB()              // Initialize database on page load
saveToIndexedDB(store, data) // Save data to store
getFromIndexedDB(store)      // Retrieve data from store
```

#### Queue Functions
```javascript
addToSyncQueue(method, endpoint, data)  // Add operation to queue
getPendingSyncOperations()               // Get all unsynced ops
markAsSynced(id)                        // Mark operation as synced
```

#### Sync Functions
```javascript
syncOfflineChanges()         // Process all pending operations
updateSyncStatus(msg, status) // Update UI badge
```

#### Network Events
```javascript
window.addEventListener('online', syncOfflineChanges)
window.addEventListener('offline', updateStatus)
```

### 4. Fetch Wrapper Pattern

All API calls modified to support offline:

**Before** (old pattern):
```javascript
const response = await fetch(url);
const data = await response.json();
// Process data
```

**After** (offline-aware):
```javascript
try {
    const response = await fetch(url);
    const data = await response.json();
    await saveToIndexedDB(store, data); // Cache it
    return data;
} catch (error) {
    if (!navigator.onLine) {
        const cached = await getFromIndexedDB(store);
        showNotification('Showing cached data - offline mode', 'warning');
        return cached;
    }
    throw error;
}
```

**For mutations** (POST/PUT/DELETE):
```javascript
try {
    const response = await fetch(url, { method, body });
    return response.json();
} catch (error) {
    if (!navigator.onLine) {
        await addToSyncQueue(method, url, data);
        showNotification('Saved offline - will sync when online', 'info');
    } else {
        throw error;
    }
}
```

## Data Flow Scenarios

### Scenario 1: Create Entry While Online

```
User fills form → Submit (Enter key)
    ↓
POST /api/add-entry {name, quantity, ...}
    ↓
Server: INSERT into products
    ↓
Response: { success: true }
    ↓
Clear form, refresh inventory list
    ↓
loadInventory() → fetch /api/inventory
    ↓
Save to IndexedDB['inventory']
    ↓
Display in table
```

### Scenario 2: Create Entry While Offline

```
User fills form → Submit (Enter key)
    ↓
POST /api/add-entry {name, quantity, ...}
    ↓
Network fails → Exception caught
    ↓
Check: !navigator.onLine → true
    ↓
addToSyncQueue('POST', '/api/add-entry', {data})
    ↓
Show: "Saved offline - will sync when online"
    ↓
Clear form, update status badge to "Offline"
    ↓
Store in IndexedDB['syncQueue']:
    {
        method: 'POST',
        endpoint: '/api/add-entry',
        data: {name, quantity, ...},
        timestamp: 1643836800000,
        synced: false
    }
```

### Scenario 3: Reconnect and Sync

```
Network restored
    ↓
window.online event fires
    ↓
updateSyncStatus('Syncing...', 'syncing')
    ↓
syncOfflineChanges() called
    ↓
getPendingSyncOperations() → [op1, op2, op3, ...]
    ↓
For each operation:
    ├─ fetch(op.endpoint, {method: op.method, body: op.data})
    ├─ Server processes and returns success
    ├─ markAsSynced(op.id) → set synced = true
    └─ Log: "Synced: POST /api/add-entry"
    ↓
After all synced:
    ├─ loadDashboard()
    ├─ loadInventory()
    ├─ loadSalesHistory()
    └─ loadExpenses()
    ↓
updateSyncStatus('', 'synced')
```

## Network Status Detection

### Online/Offline Events

```javascript
// Triggered when connection lost
window.addEventListener('offline', () => {
    updateSyncStatus('Offline', 'offline');
});

// Triggered when connection restored
window.addEventListener('online', async () => {
    updateSyncStatus('Syncing...', 'syncing');
    await syncOfflineChanges();
});

// Check current status
if (navigator.onLine) {
    // Connected
} else {
    // Offline
}
```

### Initial Status Check
```javascript
// On page load
if (!navigator.onLine) {
    updateSyncStatus('Offline', 'offline');
}
```

## Error Handling

### Network Errors
- **Detected**: `fetch()` throws exception
- **Handling**: Catch block checks `!navigator.onLine`
- **Action**: Queue operation if offline, show error if online

### Sync Failures
- **Detected**: Server returns non-200 response during sync
- **Handling**: Log error, skip to next operation
- **Result**: Operation remains in queue for retry

### Database Errors
- **Detected**: IndexedDB operations fail
- **Handling**: Promise rejection caught
- **Action**: Console log, continue with fallback

### Conflict Resolution
- **Method**: Server-side validation (current)
- **Future**: Implement client-side conflict detection
- **Strategy**: Use timestamps and version numbers

## Performance Considerations

### Storage Limits
- **IndexedDB Quota**: 
  - Chrome: ~50MB per origin
  - Firefox: ~50MB per origin
  - Safari: ~50MB per origin
  - Edge: ~50MB per origin
- **Current Usage**: ~1-2MB typical (expandable)

### Cache Size
- **Static Assets**: ~200-400KB
- **Typical Data**: Depends on inventory size
- **Sync Queue**: Minimal (1-2KB per operation)

### Sync Performance
- **Typical Speed**: 100-500ms per operation
- **Batching**: Sequential (ensures order)
- **Retry**: Manual (on next online event)

## Security Considerations

### Data Storage
- **IndexedDB**: Same-origin policy
- **Service Worker**: HTTPS required in production
- **Cache**: No encryption (consider https + CSP)

### Sync Validation
- **Frontend**: Item names checked against cached inventory
- **Backend**: All operations validated before execution
- **Conflict**: Server rejects invalid operations

### User Data
- **Persistence**: Data survives page refresh
- **Privacy**: All data stored locally in browser
- **Clearing**: Clearing browser data removes caches/db

## Testing Strategy

### Unit Tests (Recommended)
```javascript
// Test IndexedDB operations
test('saveToIndexedDB saves data', async () => {
    await saveToIndexedDB('inventory', [{id: 1, name: 'Test'}]);
    const data = await getFromIndexedDB('inventory');
    expect(data).toHaveLength(1);
});

// Test offline detection
test('addToSyncQueue when offline', async () => {
    navigator.onLine = false;
    await addToSyncQueue('POST', '/api/test', {data});
    const pending = await getPendingSyncOperations();
    expect(pending).toHaveLength(1);
});
```

### Integration Tests
```javascript
// Test full offline → online cycle
test('sync restores all operations', async () => {
    // Create data offline
    // Simulate sync
    // Verify all appear in server
});
```

### Manual Testing
- See OFFLINE_TESTING_GUIDE.md

## Browser Compatibility

### Required APIs
- **Service Workers**: Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+
- **IndexedDB**: All modern browsers
- **Fetch API**: All modern browsers
- **Promise**: All modern browsers (IE 11 with polyfill)

### Polyfills Needed
- Promise (for IE 11)
- Fetch (for IE 11)

### Tested On
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+

## Future Enhancements

### Planned Features
1. **Selective Sync**: User chooses what to sync
2. **Background Sync API**: Queue operations even if tab closed
3. **Conflict Resolution**: Handle simultaneous edits
4. **Encryption**: Encrypt sensitive data in IndexedDB
5. **Analytics**: Track offline usage patterns
6. **Compression**: Reduce storage with compression

### Optimization Ideas
1. **Partial Sync**: Sync only changed data
2. **Differential Sync**: Send only deltas
3. **Batch Operations**: Group similar operations
4. **Priority Queue**: Sync critical operations first

## Maintenance

### Clearing Data
```javascript
// Clear specific store
db.transaction(['inventory'], 'readwrite').objectStore('inventory').clear();

// Clear all data
indexedDB.deleteDatabase('InventoryAppDB');
```

### Updating Cache
```javascript
// Automatically done on every fetch
// Manual refresh available via page reload
```

### Monitoring
- Check DevTools → Application → IndexedDB
- Check DevTools → Network → Service Workers
- Monitor browser console for errors
- Track sync status badge

## Conclusion

The offline system provides:
- ✓ Seamless offline experience
- ✓ Automatic data caching
- ✓ Operation queuing
- ✓ Smart synchronization
- ✓ No data loss
- ✓ Clear user feedback

Technical reliability through proven browser APIs and careful error handling.

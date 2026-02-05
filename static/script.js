// Page Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = item.getAttribute('data-page');
        showPage(pageName);
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
    });
});

// Dashboard date filter
document.getElementById('dashboardDateFilter').addEventListener('change', () => {
    loadDashboard();
});

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageName).classList.add('active');
    
    if (pageName === 'dashboard') loadDashboard();
    if (pageName === 'inventory') loadInventory();
    if (pageName === 'transactions') loadTransactions();
    if (pageName === 'sales') {
        loadSalesHistory();
        loadSalesRecords();
    }
    if (pageName === 'expenses') {
        loadExpenses();
        loadExpensesSummary();
    }
}

// Update Date/Time
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('dateTime').textContent = now.toLocaleDateString('en-US', options);
}
updateDateTime();
setInterval(updateDateTime, 60000);

// Notification System
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

// ==================== OFFLINE FUNCTIONALITY ====================
// IndexedDB Setup
const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 1;
let db;

// Initialize IndexedDB
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Create object stores for different data types
            if (!db.objectStoreNames.contains('inventory')) {
                db.createObjectStore('inventory', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('sales')) {
                db.createObjectStore('sales', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('expenses')) {
                db.createObjectStore('expenses', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('transactions')) {
                db.createObjectStore('transactions', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('syncQueue')) {
                db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Save data to IndexedDB
async function saveToIndexedDB(storeName, data) {
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        if (Array.isArray(data)) {
            data.forEach(item => store.put(item));
        } else {
            store.put(data);
        }
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// Get data from IndexedDB
async function getFromIndexedDB(storeName) {
    if (!db) return [];
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Add operation to sync queue
async function addToSyncQueue(method, endpoint, data) {
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        
        store.add({
            method,
            endpoint,
            data,
            timestamp: new Date().getTime(),
            synced: false
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// Get all pending sync operations
async function getPendingSyncOperations() {
    if (!db) return [];
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['syncQueue'], 'readonly');
        const store = transaction.objectStore('syncQueue');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const pending = request.result.filter(op => !op.synced);
            resolve(pending);
        };
        request.onerror = () => reject(request.error);
    });
}

// Mark operation as synced
async function markAsSynced(id) {
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const operation = getRequest.result;
            if (operation) {
                operation.synced = true;
                store.put(operation);
            }
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// Sync pending operations when online
async function syncOfflineChanges() {
    const pending = await getPendingSyncOperations();
    
    if (pending.length === 0) return;
    
    updateSyncStatus(`Syncing ${pending.length} changes...`, 'syncing');
    
    for (const operation of pending) {
        try {
            const response = await fetch(operation.endpoint, {
                method: operation.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(operation.data)
            });
            
            if (response.ok) {
                await markAsSynced(operation.id);
                console.log(`Synced: ${operation.method} ${operation.endpoint}`);
            }
        } catch (error) {
            console.error(`Failed to sync: ${operation.method} ${operation.endpoint}`, error);
        }
    }
    
    updateSyncStatus('', 'synced');
    loadDashboard();
    loadInventory();
    loadSalesHistory();
    loadExpenses();
}

// Update sync status display
function updateSyncStatus(message, status) {
    const statusElement = document.getElementById('syncStatus');
    if (!statusElement) return;
    
    if (status === 'offline') {
        statusElement.innerHTML = '<span class="status-badge offline"><i class="fas fa-cloud-slash"></i> Offline</span>';
        statusElement.title = 'Working offline - changes will be synced when connection restored';
    } else if (status === 'syncing') {
        statusElement.innerHTML = '<span class="status-badge syncing"><i class="fas fa-sync-alt"></i> ' + message + '</span>';
    } else if (status === 'synced') {
        statusElement.innerHTML = '<span class="status-badge online"><i class="fas fa-cloud-check"></i> Online</span>';
        statusElement.title = 'All changes synced';
    } else {
        statusElement.innerHTML = '';
    }
}

// Monitor online/offline status
window.addEventListener('online', async () => {
    console.log('Connection restored');
    updateSyncStatus('Syncing...', 'syncing');
    await syncOfflineChanges();
});

window.addEventListener('offline', () => {
    console.log('Connection lost');
    updateSyncStatus('Offline', 'offline');
});

// Check initial online status
if (!navigator.onLine) {
    updateSyncStatus('Offline', 'offline');
}

// Initialize IndexedDB on page load
initIndexedDB().catch(error => console.error('Failed to initialize IndexedDB:', error));


// --- DASHBOARD ---
async function loadDashboard() {
    const dateFilter = document.getElementById('dashboardDateFilter').value || '';
    
    try {
        const response = await fetch('/api/inventory');
        const products = await response.json();
        
        const transactions = await fetch('/api/transactions').then(r => r.json());
        
        // Get sales summary
        let salesUrl = '/api/sales-summary';
        if (dateFilter) {
            salesUrl += `?date=${dateFilter}`;
        }
        const salesSummary = await fetch(salesUrl).then(r => r.json());
        
        // Get dashboard metrics (revenue, expenses, profit)
        let metricsUrl = '/api/dashboard-metrics';
        if (dateFilter) {
            metricsUrl += `?date=${dateFilter}`;
        }
        const metrics = await fetch(metricsUrl).then(r => r.json());
        
        // Get recent sales
        let recentSalesUrl = '/api/sales' + (dateFilter ? `?date=${dateFilter}` : '');
        const recentSales = await fetch(recentSalesUrl).then(r => r.json());
        
        // Calculate stats
        const totalItems = products.length;
        const lowStock = products.filter(p => p.quantity <= p.reorder_level).length;
        const healthyStock = totalItems - lowStock;
        const totalUnits = products.reduce((sum, p) => sum + p.quantity, 0);
        
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('lowStock').textContent = lowStock;
        document.getElementById('healthyStock').textContent = healthyStock;
        document.getElementById('totalUnits').textContent = totalUnits;
        
        // Sales stats
        document.getElementById('todaysSales').textContent = salesSummary.total_sales || 0;
        document.getElementById('totalRevenue').textContent = `₦${(metrics.total_revenue || 0).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('totalExpenses').textContent = `₦${(metrics.total_expenses || 0).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        // Total credit
        const totalCredit = salesSummary.credit_amount || 0;
        document.getElementById('totalCredit').textContent = `₦${totalCredit.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        // Total pending
        const totalPending = salesSummary.pending_amount || 0;
        document.getElementById('totalPending').textContent = `₦${totalPending.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        // Realized payment (paid amount - expenses)
        const paidAmount = salesSummary.paid_amount || 0;
        const totalExpenses = metrics.total_expenses || 0;
        const realizedPayment = paidAmount - totalExpenses;
        const realizedPaymentElement = document.getElementById('realizedPayment');
        realizedPaymentElement.textContent = `₦${realizedPayment.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (realizedPayment < 0) {
            realizedPaymentElement.style.color = 'var(--danger-color)';
        } else {
            realizedPaymentElement.style.color = 'var(--secondary-color)';
        }
        
        // Low stock items
        const lowStockItems = products.filter(p => p.quantity <= p.reorder_level);
        const lowStockTable = document.getElementById('lowStockTable');
        lowStockTable.innerHTML = lowStockItems.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.reorder_level}</td>
                <td><span class="status-badge danger">Low Stock</span></td>
            </tr>
        `).join('');
        
        if (lowStockItems.length === 0) {
            lowStockTable.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No low stock items</td></tr>';
        }
        
        // Recent transactions
        const recentTx = transactions.slice(0, 5);
        const txTable = document.getElementById('recentTransactions');
        txTable.innerHTML = recentTx.map(tx => `
            <tr>
                <td>${tx.item_name}</td>
                <td>${tx.quantity}</td>
                <td><span class="status-badge ${tx.type === 'Intake' ? 'success' : 'warning'}">${tx.type}</span></td>
                <td>${tx.time}</td>
            </tr>
        `).join('');
        
        if (recentTx.length === 0) {
            txTable.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No transactions yet</td></tr>';
        }
        
        // Recent sales
        const recentSalesLimited = recentSales.slice(0, 5);
        const recentSalesTable = document.getElementById('recentSalesTable');
        recentSalesTable.innerHTML = recentSalesLimited.map(sale => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${parseFloat(sale.total_amount).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td><span class="payment-status-badge ${statusColor}">${sale.payment_status}</span></td>
                </tr>
            `;
        }).join('');
        
        if (recentSalesLimited.length === 0) {
            recentSalesTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading dashboard', 'error');
    }
}

// --- INVENTORY ---
async function loadInventory() {
    try {
        const response = await fetch('/api/inventory');
        let products = await response.json();
        
        // Save to IndexedDB
        await saveToIndexedDB('inventory', products);
        
        // Update item suggestions
        updateItemSuggestions(products);
        
        const table = document.getElementById('inventoryTable');
        table.innerHTML = products.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.brand || '-'}</td>
                <td>${item.quantity}</td>
                <td>${item.reorder_level}</td>
                <td>
                    <span class="status-badge ${item.quantity <= item.reorder_level ? 'danger' : 'healthy'}">
                        ${item.quantity <= item.reorder_level ? 'Low Stock' : 'Healthy'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="openReorderModal('${item.name}', ${item.reorder_level})">Update</button>
                        <button class="action-btn delete" onclick="confirmDelete(${item.id}, 'product', '${item.name}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        if (products.length === 0) {
            table.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No items in inventory</td></tr>';
        }
        
        // Setup search
        document.getElementById('searchInventory').addEventListener('keyup', () => {
            const searchTerm = document.getElementById('searchInventory').value.toLowerCase();
            document.querySelectorAll('#inventoryTable tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    } catch (error) {
        console.error('Error loading inventory:', error);
        // Load from cache on error
        const products = await getFromIndexedDB('inventory');
        updateItemSuggestions(products);
        
        const table = document.getElementById('inventoryTable');
        if (products.length > 0) {
            table.innerHTML = products.map(item => `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.brand || '-'}</td>
                    <td>${item.quantity}</td>
                    <td>${item.reorder_level}</td>
                    <td>
                        <span class="status-badge ${item.quantity <= item.reorder_level ? 'danger' : 'healthy'}">
                            ${item.quantity <= item.reorder_level ? 'Low Stock' : 'Healthy'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="openReorderModal('${item.name}', ${item.reorder_level})">Update</button>
                            <button class="action-btn delete" onclick="confirmDelete(${item.id}, 'product', '${item.name}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join('');
            showNotification('Showing cached inventory - offline mode', 'warning');
        } else {
            table.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No cached inventory available</td></tr>';
        }
        showNotification('Error loading inventory', 'error');
    }
}

// Update item suggestions for forms
function updateItemSuggestions(products) {
    const itemNames = products.map(p => p.name);
    
    // Update reorder item suggestions
    const reorderSuggestions = document.getElementById('itemSuggestions');
    if (reorderSuggestions) {
        reorderSuggestions.innerHTML = itemNames.map(name => `<option value="${name}">`).join('');
    }
    
    // Update sale item suggestions
    const saleSuggestions = document.getElementById('saleItemSuggestions');
    if (saleSuggestions) {
        saleSuggestions.innerHTML = itemNames.map(name => `<option value="${name}">`).join('');
    }
}

// --- NEW ENTRY FORM ---
document.getElementById('entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('itemName').value.trim();
    const brand = document.getElementById('itemBrand').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);
    const type = document.getElementById('entryType').value;
    
    if (!name || quantity <= 0) {
        showNotification('Please fill in all fields correctly', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/add-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, brand, quantity, type })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            document.getElementById('entryForm').reset();
            document.getElementById('itemBrand').value = '';
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        // Queue the operation for sync
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/add-entry', { name, brand, quantity, type });
            showNotification('Entry saved offline - will sync when online', 'info');
            document.getElementById('entryForm').reset();
            document.getElementById('itemBrand').value = '';
            updateSyncStatus('Offline', 'offline');
        } else {
            showNotification('Error recording entry', 'error');
        }
    }
});

// --- REORDER FORM ---
document.getElementById('reorderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('reorderItem').value.trim();
    const level = parseInt(document.getElementById('reorderLevel').value);
    
    if (!name || level < 0) {
        showNotification('Please fill in all fields correctly', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/update-reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Reorder level updated', 'success');
            document.getElementById('reorderForm').reset();
            loadInventory();
        } else {
            showNotification('Error updating reorder level', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        // Queue the operation for sync
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/update-reorder', { name, level });
            showNotification('Update saved offline - will sync when online', 'info');
            document.getElementById('reorderForm').reset();
            updateSyncStatus('Offline', 'offline');
        } else {
            showNotification('Error updating reorder level', 'error');
        }
        console.error('Error:', error);
        showNotification('Error updating reorder level', 'error');
    }
});

// --- TRANSACTIONS ---
async function loadTransactions() {
    const date = document.getElementById('transactionDate').value;
    const type = document.getElementById('transactionType').value;
    
    try {
        const url = new URL('/api/transactions', window.location);
        if (date) url.searchParams.append('date', date);
        if (type !== 'All') url.searchParams.append('type', type);
        
        const response = await fetch(url);
        const transactions = await response.json();
        
        const table = document.getElementById('transactionsTable');
        table.innerHTML = transactions.map(tx => `
            <tr>
                <td>${tx.date}</td>
                <td>${tx.time}</td>
                <td>${tx.item_name}</td>
                <td>${tx.quantity}</td>
                <td><span class="status-badge ${tx.type === 'Intake' ? 'success' : 'warning'}">${tx.type}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn delete" onclick="confirmDelete(${tx.id}, 'transaction', '${tx.item_name}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        if (transactions.length === 0) {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No transactions found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        showNotification('Error loading transactions', 'error');
    }
}

document.getElementById('filterBtn').addEventListener('click', loadTransactions);

// --- INVOICE FORM ---
document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const customer = document.getElementById('customerName').value.trim();
    const item = document.getElementById('invoiceItem').value.trim();
    const quantity = parseInt(document.getElementById('invoiceQuantity').value);
    
    if (!customer || !item || quantity <= 0) {
        showNotification('Please fill in all fields correctly', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/generate-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer, item, quantity })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            document.getElementById('invoiceForm').reset();
            
            // Download the PDF
            const link = document.createElement('a');
            link.href = `/download/${result.file}`;
            link.download = result.file;
            link.click();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error generating invoice', 'error');
    }
});

// --- MODAL FOR REORDER ---
const modal = document.getElementById('reorderModal');
const closeBtn = document.querySelector('.close');

function openReorderModal(itemName, currentLevel) {
    document.getElementById('quickReorderItem').value = itemName;
    document.getElementById('quickReorderLevel').value = currentLevel;
    modal.classList.add('show');
}

closeBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('show');
    }
});

document.getElementById('quickReorderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('quickReorderItem').value;
    const level = parseInt(document.getElementById('quickReorderLevel').value);
    
    try {
        const response = await fetch('/api/update-reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Reorder level updated', 'success');
            modal.classList.remove('show');
            loadInventory();
        }
    } catch (error) {
        showNotification('Error updating reorder level', 'error');
    }
});

// Load dashboard on startup
loadDashboard();

// --- EXPENSES FUNCTIONALITY ---
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const description = document.getElementById('expenseDescription').value.trim();
    const category = document.getElementById('expenseCategory').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    const notes = document.getElementById('expenseNotes').value.trim();
    
    if (!description || !category || amount <= 0 || !date) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/add-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, category, amount, date, notes })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            document.getElementById('expenseForm').reset();
            loadExpenses();
            loadExpensesSummary();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        // Queue the operation for sync
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/add-expense', { description, category, amount, date, notes });
            showNotification('Expense saved offline - will sync when online', 'info');
            document.getElementById('expenseForm').reset();
            updateSyncStatus('Offline', 'offline');
        } else {
            showNotification('Error recording expense', 'error');
        }
    }
});

async function loadExpenses() {
    let dateFilter = document.getElementById('expenseDateFilter').value;
    
    // If no filter set, default to today
    if (!dateFilter) {
        const today = new Date().toISOString().split('T')[0];
        dateFilter = today;
        document.getElementById('expenseDateFilter').value = today;
    }
    
    try {
        let url = '/api/expenses';
        if (dateFilter) {
            url += `?date=${dateFilter}`;
        }
        
        const response = await fetch(url);
        const expenses = await response.json();
        
        // Cache expenses data
        await saveToIndexedDB('expenses', expenses);
        
        const table = document.getElementById('expensesTable');
        table.innerHTML = expenses.map(expense => `
            <tr>
                <td>${expense.date}</td>
                <td>${expense.description}</td>
                <td><span class="status-badge healthy">${expense.category}</span></td>
                <td><strong>₦${parseFloat(expense.amount).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                <td>${expense.notes || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn delete" onclick="confirmDeleteExpense(${expense.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        if (expenses.length === 0) {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No expenses recorded</td></tr>';
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        // Load from cache on error
        const expenses = await getFromIndexedDB('expenses');
        
        const table = document.getElementById('expensesTable');
        if (expenses.length > 0) {
            table.innerHTML = expenses.map(expense => `
                <tr>
                    <td>${expense.date}</td>
                    <td>${expense.description}</td>
                    <td><span class="status-badge healthy">${expense.category}</span></td>
                    <td><strong>₦${parseFloat(expense.amount).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                    <td>${expense.notes || '-'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn delete" onclick="confirmDeleteExpense(${expense.id})">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join('');
            showNotification('Showing cached expenses - offline mode', 'warning');
        } else {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No cached expenses available</td></tr>';
        }
    }
}

async function loadExpensesSummary() {
    let dateFilter = document.getElementById('expenseDateFilter').value;
    
    // If no filter set, default to today
    if (!dateFilter) {
        const today = new Date().toISOString().split('T')[0];
        dateFilter = today;
        document.getElementById('expenseDateFilter').value = today;
    }
    
    try {
        let url = '/api/expenses-summary';
        if (dateFilter) {
            url += `?date=${dateFilter}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        document.getElementById('totalExpenses').textContent = `₦${parseFloat(data.total_expenses).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        const categoryDiv = document.getElementById('expensesByCategory');
        categoryDiv.innerHTML = data.by_category.map(cat => `
            <div class="category-item">
                <span class="category-name">${cat.category}</span>
                <span class="category-amount">₦${parseFloat(cat.total).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
        `).join('');
        
        if (data.by_category.length === 0) {
            categoryDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No expenses in categories</p>';
        }
    } catch (error) {
        console.error('Error loading summary:', error);
        showNotification('Error loading expenses summary', 'error');
    }
}

document.getElementById('filterExpensesBtn').addEventListener('click', () => {
    loadExpenses();
    loadExpensesSummary();
});

function confirmDeleteExpense(expenseId) {
    deleteData = { id: expenseId, type: 'expense', name: 'expense' };
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this expense? This action cannot be undone.';
    confirmModal.classList.add('show');
}

function confirmDeleteSale(saleNum) {
    deleteData = { id: saleNum, type: 'sale', name: saleNum };
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this sale? Inventory will be reversed. This action cannot be undone.';
    confirmModal.classList.add('show');
}

// --- DELETE FUNCTIONALITY ---
const confirmModal = document.getElementById('confirmModal');
let deleteData = { type: null, id: null, name: null };

function confirmDelete(id, type, name) {
    deleteData = { id, type, name };
    const typeLabel = type === 'product' ? 'product' : 'transaction';
    document.getElementById('confirmMessage').textContent = `Are you sure you want to delete this ${typeLabel}? This action cannot be undone.`;
    confirmModal.classList.add('show');
}

document.getElementById('confirmBtn').addEventListener('click', async () => {
    if (!deleteData.id) return;
    
    try {
        let url = '';
        if (deleteData.type === 'product') {
            url = `/api/delete-product/${deleteData.id}`;
        } else if (deleteData.type === 'transaction') {
            url = `/api/delete-transaction/${deleteData.id}`;
        } else if (deleteData.type === 'expense') {
            url = `/api/delete-expense/${deleteData.id}`;
        } else if (deleteData.type === 'sale') {
            url = `/api/delete-sale/${deleteData.id}`;
        }
        
        const response = await fetch(url, { method: 'DELETE' });
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            confirmModal.classList.remove('show');
            
            // Reload appropriate data
            if (deleteData.type === 'product') {
                loadInventory();
                loadDashboard();
            } else if (deleteData.type === 'transaction') {
                loadTransactions();
                loadInventory();
                loadDashboard();
            } else if (deleteData.type === 'expense') {
                loadExpenses();
                loadExpensesSummary();
            } else if (deleteData.type === 'sale') {
                loadSalesHistory();
                loadSalesRecords();
                loadInventory();
                loadDashboard();
            }
        } else {
            showNotification(result.error || 'Error deleting item', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error deleting item', 'error');
    }
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    confirmModal.classList.remove('show');
});

// --- SALES PAGE FUNCTIONALITY ---
let currentSaleNum = null;

document.getElementById('addItemBtn').addEventListener('click', () => {
    const container = document.getElementById('saleItemsContainer');
    const itemRow = document.createElement('div');
    itemRow.className = 'sale-item-row';
    itemRow.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>Item Name <span class="required">*</span></label>
                <input type="text" class="item-name" placeholder="Item name" list="itemSuggestions" required>
            </div>
            <div class="form-group">
                <label>Quantity <span class="required">*</span></label>
                <input type="number" class="item-qty" min="1" placeholder="Qty" required>
            </div>
            <div class="form-group">
                <label>Price <span class="required">*</span></label>
                <input type="number" class="item-price" min="0" step="0.01" placeholder="Price" required>
            </div>
            <div class="form-group">
                <label>Total</label>
                <input type="number" class="item-total" readonly placeholder="0.00">
            </div>
            <div class="form-group btn-group">
                <label>&nbsp;</label>
                <button type="button" class="btn btn-danger btn-small remove-item" onclick="removeItem(this)">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
        </div>
    `;
    container.appendChild(itemRow);
    attachItemListeners(itemRow);
});

function removeItem(button) {
    button.closest('.sale-item-row').remove();
    updateSaleSummary();
}

function attachItemListeners(row) {
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const totalInput = row.querySelector('.item-total');
    
    const updateTotal = () => {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        const total = qty * price;
        totalInput.value = total.toFixed(2);
        updateSaleSummary();
    };
    
    qtyInput.addEventListener('change', updateTotal);
    qtyInput.addEventListener('input', updateTotal);
    priceInput.addEventListener('change', updateTotal);
    priceInput.addEventListener('input', updateTotal);
}

function updateSaleSummary() {
    const rows = document.querySelectorAll('.sale-item-row');
    let totalItems = 0;
    let totalQty = 0;
    let totalAmount = 0;
    
    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const total = parseFloat(row.querySelector('.item-total').value) || 0;
        
        if (qty > 0) totalItems++;
        totalQty += qty;
        totalAmount += total;
    });
    
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalQty').textContent = totalQty;
    document.getElementById('saleTotal').textContent = totalAmount.toFixed(2);
}

// Initialize item listeners
document.querySelectorAll('.sale-item-row').forEach(row => {
    attachItemListeners(row);
});

// Submit sale form
document.getElementById('saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const customer = document.getElementById('saleCustomer').value.trim();
    const paymentStatus = document.getElementById('paymentStatus').value;
    
    if (!customer) {
        showNotification('Please enter customer name', 'error');
        return;
    }
    
    // Get inventory to validate items
    let inventoryItems = [];
    try {
        const inventoryResponse = await fetch('/api/inventory');
        const inventoryData = await inventoryResponse.json();
        inventoryItems = inventoryData.map(p => p.name.toLowerCase());
    } catch (error) {
        console.error('Error fetching inventory:', error);
        showNotification('Error validating items', 'error');
        return;
    }
    
    const items = [];
    let invalidItem = null;
    
    document.querySelectorAll('.sale-item-row').forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const qty = parseInt(row.querySelector('.item-qty').value);
        const price = parseFloat(row.querySelector('.item-price').value);
        
        if (name && qty > 0 && price >= 0) {
            // Check if item exists in inventory
            if (!inventoryItems.includes(name.toLowerCase())) {
                invalidItem = name;
            }
            items.push({ name, quantity: qty, price });
        }
    });
    
    if (items.length === 0) {
        showNotification('Please add at least one item', 'error');
        return;
    }
    
    if (invalidItem) {
        showNotification(`Item "${invalidItem}" is not in the inventory list`, 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/create-sale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer, items, payment_status: paymentStatus })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Sale created successfully! Sale #${result.sale_num}`, 'success');
            document.getElementById('saleForm').reset();
            
            // Reset to single item row
            document.getElementById('saleItemsContainer').innerHTML = `
                <div class="sale-item-row">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Item Name <span class="required">*</span></label>
                            <input type="text" class="item-name" placeholder="Item name" list="saleItemSuggestions" required>
                        </div>
                        <div class="form-group">
                            <label>Quantity <span class="required">*</span></label>
                            <input type="number" class="item-qty" min="1" placeholder="Qty" required>
                        </div>
                        <div class="form-group">
                            <label>Price <span class="required">*</span></label>
                            <input type="number" class="item-price" min="0" step="0.01" placeholder="Price" required>
                        </div>
                        <div class="form-group">
                            <label>Total</label>
                            <input type="number" class="item-total" readonly placeholder="0.00">
                        </div>
                        <div class="form-group btn-group">
                            <label>&nbsp;</label>
                            <button type="button" class="btn btn-danger btn-small remove-item" onclick="removeItem(this)">
                                <i class="fas fa-trash"></i> Remove
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.querySelectorAll('.sale-item-row').forEach(row => {
                attachItemListeners(row);
            });
            
            updateSaleSummary();
            loadSalesHistory();
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        // Queue the operation for sync
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/create-sale', { customer, items, payment_status: paymentStatus });
            showNotification('Sale saved offline - will sync when online', 'info');
            document.getElementById('saleForm').reset();
            updateSyncStatus('Offline', 'offline');
        } else {
            showNotification('Error creating sale', 'error');
        }
    }
});

async function loadSalesHistory() {
    try {
        let dateFilter = '';
        const salesDateFilter = document.getElementById('salesDateFilter');
        
        // If no filter set, default to today
        if (salesDateFilter) {
            dateFilter = salesDateFilter.value;
            if (!dateFilter) {
                const today = new Date().toISOString().split('T')[0];
                dateFilter = today;
                salesDateFilter.value = today;
            }
        }
        
        let url = '/api/sales';
        if (dateFilter) {
            url += `?date=${dateFilter}`;
        }
        
        const response = await fetch(url);
        const sales = await response.json();
        
        // Cache sales data
        await saveToIndexedDB('sales', sales);
        
        const table = document.getElementById('salesTable');
        table.innerHTML = sales.map(sale => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${parseFloat(sale.total_amount).toFixed(2)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${sale.payment_status}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                            ${sale.payment_status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            ${sale.payment_status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        if (sales.length === 0) {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
        }
    } catch (error) {
        console.error('Error loading sales:', error);
        // Load from cache on error
        const sales = await getFromIndexedDB('sales');
        
        const table = document.getElementById('salesTable');
        if (sales.length > 0) {
            table.innerHTML = sales.map(sale => {
                const statusColor = sale.payment_status.toLowerCase();
                return `
                    <tr>
                        <td><strong>${sale.sale_num}</strong></td>
                        <td>${sale.customer}</td>
                        <td>${sale.date}</td>
                        <td>₦${parseFloat(sale.total_amount).toFixed(2)}</td>
                        <td>
                            <span class="payment-status-badge ${statusColor}">
                                ${sale.payment_status}
                            </span>
                        </td>
                        <td>
                            <div class="action-buttons">
                                <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                                ${sale.payment_status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                                ${sale.payment_status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
            showNotification('Showing cached sales - offline mode', 'warning');
        } else {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No cached sales available</td></tr>';
        }
    }
}

async function loadSalesRecords() {
    try {
        let dateFilter = '';
        const salesRecordsDateFilter = document.getElementById('salesRecordsDateFilter');
        
        // If no filter set, default to today
        if (salesRecordsDateFilter) {
            dateFilter = salesRecordsDateFilter.value;
            if (!dateFilter) {
                const today = new Date().toISOString().split('T')[0];
                dateFilter = today;
                salesRecordsDateFilter.value = today;
            }
        }
        
        let url = '/api/sales';
        if (dateFilter) {
            url += `?date=${dateFilter}`;
        }
        
        const response = await fetch(url);
        const sales = await response.json();
        
        const table = document.getElementById('salesRecordsTable');
        table.innerHTML = sales.map(sale => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${parseFloat(sale.total_amount).toFixed(2)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${sale.payment_status}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                            ${sale.payment_status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            ${sale.payment_status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            <button class="action-btn delete" onclick="confirmDeleteSale('${sale.sale_num}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        if (sales.length === 0) {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
        }
    } catch (error) {
        console.error('Error loading sales records:', error);
        showNotification('Error loading sales records', 'error');
    }
}

async function viewSaleDetails(saleNum) {
    try {
        const response = await fetch(`/api/sale/${saleNum}`);
        const result = await response.json();
        
        const sale = result.sale;
        const items = result.items;
        
        let itemsHTML = '<div class="table-responsive"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>';
        
        items.forEach(item => {
            itemsHTML += `
                <tr>
                    <td>${item.item_name}</td>
                    <td>${item.quantity}</td>
                    <td>₦${parseFloat(item.price).toFixed(2)}</td>
                    <td>₦${parseFloat(item.total).toFixed(2)}</td>
                </tr>
            `;
        });
        
        itemsHTML += '</tbody></table></div>';
        
        const detailsHTML = `
            <div style="margin-bottom: 15px;">
                <p><strong>Sale No:</strong> ${sale.sale_num}</p>
                <p><strong>Customer:</strong> ${sale.customer}</p>
                <p><strong>Date:</strong> ${sale.date} ${sale.time}</p>
                <p><strong>Payment Status:</strong> <span class="payment-status-badge ${sale.payment_status.toLowerCase()}">${sale.payment_status}</span></p>
            </div>
            ${itemsHTML}
            <div style="margin-top: 15px; padding: 10px; background-color: var(--light-bg); border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 600;">
                    <span>Total Amount:</span>
                    <span style="color: var(--primary-color);">₦${parseFloat(sale.total_amount).toFixed(2)}</span>
                </div>
            </div>
        `;
        
        currentSaleNum = saleNum;
        document.getElementById('saleDetailsContent').innerHTML = detailsHTML;
        document.getElementById('saleDetailsModal').classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error loading sale details', 'error');
    }
}

function closeSaleDetailsModal() {
    document.getElementById('saleDetailsModal').classList.remove('show');
}

async function downloadSaleInvoice() {
    if (!currentSaleNum) return;
    
    try {
        const response = await fetch(`/api/generate-sale-invoice/${currentSaleNum}`);
        const result = await response.json();
        
        if (result.success) {
            const link = document.createElement('a');
            link.href = `/download/${result.file}`;
            link.download = result.file;
            link.click();
            showNotification('Invoice downloaded', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error downloading invoice', 'error');
    }
}

function openUpdateStatusModal() {
    document.getElementById('updateStatusModal').classList.add('show');
}

function closeUpdateStatusModal() {
    document.getElementById('updateStatusModal').classList.remove('show');
}

document.getElementById('updateStatusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newStatus = document.getElementById('statusSelect').value;
    
    if (!newStatus || !currentSaleNum) {
        showNotification('Please select a status', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/update-sale-status/${currentSaleNum}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            closeUpdateStatusModal();
            closeSaleDetailsModal();
            loadSalesHistory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error updating status', 'error');
    }
});

async function quickUpdateStatus(saleNum, newStatus) {
    try {
        const response = await fetch(`/api/update-sale-status/${saleNum}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            loadSalesHistory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error updating status', 'error');
    }
}

document.getElementById('searchSalesBtn').addEventListener('click', async () => {
    const customer = document.getElementById('searchCustomer').value.trim();
    const date = document.getElementById('salesHistoryDate').value;
    
    try {
        const url = new URL('/api/sales', window.location);
        if (customer) url.searchParams.append('customer', customer);
        if (date) url.searchParams.append('date', date);
        
        const response = await fetch(url);
        const sales = await response.json();
        
        const table = document.getElementById('salesTable');
        table.innerHTML = sales.map(sale => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${parseFloat(sale.total_amount).toFixed(2)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${sale.payment_status}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                            ${sale.payment_status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            ${sale.payment_status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        if (sales.length === 0) {
            table.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No sales found</td></tr>';
        }
    } catch (error) {
        console.error('Error searching sales:', error);
        showNotification('Error searching sales', 'error');
    }
});

document.getElementById('filterSalesRecordsBtn').addEventListener('click', () => {
    loadSalesRecords();
});

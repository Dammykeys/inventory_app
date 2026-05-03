/**
 * Custom Autocomplete Component
 * Replaces native datalists for better reliability and UX
 */
class Autocomplete {
    constructor(input, dataCallback) {
        this.input = input;
        this.dataCallback = dataCallback;
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'autocomplete-wrapper';
        this.list = document.createElement('div');
        this.list.className = 'autocomplete-list';
        
        // Setup DOM
        if (this.input.parentNode) {
            this.input.parentNode.insertBefore(this.wrapper, this.input);
            this.wrapper.appendChild(this.input);
            this.wrapper.appendChild(this.list);
        }
        
        // Events
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('focus', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });
        
        this.activeIndex = -1;
    }

    async onInput() {
        const val = this.input.value.toLowerCase();
        const data = await this.dataCallback();
        
        this.list.innerHTML = '';
        this.activeIndex = -1;

        if (!val) {
            this.close();
            return;
        }

        const matches = data.filter(item => item.toLowerCase().includes(val)).slice(0, 10);
        
        if (matches.length === 0) {
            this.close();
            return;
        }

        matches.forEach((match, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            
            // Highlight matching part
            const start = match.toLowerCase().indexOf(val);
            if (start !== -1) {
                const before = match.substring(0, start);
                const middle = match.substring(start, start + val.length);
                const after = match.substring(start + val.length);
                item.innerHTML = `${before}<strong>${middle}</strong>${after}`;
            } else {
                item.textContent = match;
            }

            item.addEventListener('click', () => {
                this.select(match);
            });
            
            this.list.appendChild(item);
        });

        this.list.classList.add('show');
    }

    onKeyDown(e) {
        const items = this.list.querySelectorAll('.autocomplete-item');
        if (!this.list.classList.contains('show')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.activeIndex = (this.activeIndex + 1) % items.length;
            this.updateActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
            this.updateActive(items);
        } else if (e.key === 'Enter') {
            if (this.activeIndex > -1) {
                e.preventDefault();
                this.select(items[this.activeIndex].textContent);
            }
        } else if (e.key === 'Escape') {
            this.close();
        }
    }

    updateActive(items) {
        items.forEach((item, index) => {
            if (index === this.activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    select(value) {
        this.input.value = value;
        this.close();
        // Trigger events for logic dependent on this field
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    close() {
        this.list.classList.remove('show');
        this.activeIndex = -1;
    }
}

// Enhanced Mobile Responsiveness
document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.querySelector('.sidebar');
    // const closeSidebar = document.getElementById('closeSidebar'); // Removed as sidebar closes on outside click
    const mainContent = document.querySelector('.main-content');

    // Mobile sidebar toggle functionality
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            // Prevent body scroll when sidebar is open
            document.body.style.overflow = 'hidden';
        });
    }

    // Close sidebar when clicking outside (overlay effect)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            (!mobileToggle || !mobileToggle.contains(e.target))) {

            sidebar.classList.remove('active');
            document.body.style.overflow = '';
        }
    });



    // Auto-close sidebar when a navigation link is clicked (mobile only)
    const sidebarLinks = document.querySelectorAll('.nav-item');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Desktop sidebar toggle functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });
    }

    // Restore sidebar state
    if (localStorage.getItem('sidebarCollapsed') === 'true' && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        // Close mobile sidebar if window is resized to desktop size
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
            document.body.style.overflow = '';

            // Re-apply collapsed state if it was saved
            if (localStorage.getItem('sidebarCollapsed') === 'true') {
                sidebar.classList.add('collapsed');
            }
        } else {
            // Remove collapsed state on mobile
            sidebar.classList.remove('collapsed');
        }
    });

    // Touch gesture support for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const swipeDistance = touchEndX - touchStartX;

        // Swipe right to open sidebar (only when closed)
        if (swipeDistance > swipeThreshold && !sidebar.classList.contains('active') && window.innerWidth <= 768) {
            sidebar.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        // Swipe left to close sidebar (only when open)
        else if (swipeDistance < -swipeThreshold && sidebar.classList.contains('active') && window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Helper: Inject data-labels for mobile tables
    function injectMobileLabels() {
        document.querySelectorAll('table').forEach(table => {
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
            table.querySelectorAll('tbody tr').forEach(row => {
                row.querySelectorAll('td').forEach((cell, index) => {
                    if (headers[index]) {
                        cell.setAttribute('data-label', headers[index]);
                    }
                });
            });
        });
    }

    // Call on load and after dynamic content updates
    injectMobileLabels();

    // Observer for dynamic content
    const observer = new MutationObserver((mutations) => {
        injectMobileLabels();
    });

    document.querySelectorAll('tbody').forEach(tbody => {
        observer.observe(tbody, { childList: true });
    });

    // Improve form inputs for mobile
    const formInputs = document.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        // Prevent zoom on focus for iOS
        input.addEventListener('focus', () => {
            if (window.innerWidth <= 768) {
                input.style.fontSize = '16px';
            }
        });

        input.addEventListener('blur', () => {
            if (window.innerWidth <= 768) {
                // Reset font size after blur
                setTimeout(() => {
                    input.style.fontSize = '';
                }, 100);
            }
        });
    });

    // Enhanced table scrolling for mobile
    const tableContainers = document.querySelectorAll('.table-responsive');
    tableContainers.forEach(container => {
        // Add scroll indicators
        const checkScroll = () => {
            const scrollLeft = container.scrollLeft;
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;

            container.classList.toggle('scroll-start', scrollLeft > 0);
            container.classList.toggle('scroll-end', scrollLeft < scrollWidth - clientWidth);
        };

        container.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);
        checkScroll(); // Initial check
    });

    // --- SALES FORM INITIALIZATION ---
    try {
        console.log('Initializing Sales Form listeners...');
        const saleForm = document.getElementById('saleForm');
        if (saleForm) {
            saleForm.addEventListener('submit', handleSaleSubmit);
            console.log('saleForm listener attached');
        } else {
            console.warn('saleForm element not found during init');
        }

        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', addNewSaleRow);
            console.log('addItemBtn listener attached');
        }

        // Initialize existing rows
        document.querySelectorAll('.sale-item-row').forEach(row => {
            attachItemListeners(row);
        });
    } catch (err) {
        console.error('Error during Sales Form initialization:', err);
    }

    // --- ENTRY FORM INITIALIZATION ---
    try {
        const entryForm = document.getElementById('entryForm');
        if (entryForm) {
            entryForm.addEventListener('submit', handleEntrySubmit);
            console.log('entryForm listener attached');

            // Auto-fill existing item details when name is selected
            const itemNameInput = document.getElementById('itemName');
            if (itemNameInput) {
                itemNameInput.addEventListener('change', async () => {
                    const itemName = itemNameInput.value.trim();
                    if (!itemName) return;

                    try {
                        const inventory = await getFromIndexedDB('inventory');
                        const item = inventory.find(i => i.name.toLowerCase() === itemName.toLowerCase());
                        if (item) {
                            const brandEl = document.getElementById('itemBrand');
                            const costEl = document.getElementById('costPrice');
                            const sellingEl = document.getElementById('sellingPrice');

                            if (brandEl) brandEl.value = item.brand || '';
                            if (costEl) costEl.value = item.cost_price || 0;
                            if (sellingEl) sellingEl.value = item.selling_price || 0;
                            

                        }
                    } catch (err) {
                        console.error('Error auto-filling entry form:', err);
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error during Entry Form initialization:', err);
    }

    // --- OTHER FORMS INITIALIZATION ---
    try {
        const reorderForm = document.getElementById('reorderForm');
        if (reorderForm) reorderForm.addEventListener('submit', handleReorderSubmit);

        const quickReorderForm = document.getElementById('quickReorderForm');
        if (quickReorderForm) quickReorderForm.addEventListener('submit', handleQuickReorderSubmit);

        const expenseForm = document.getElementById('expenseForm');
        if (expenseForm) expenseForm.addEventListener('submit', handleExpenseSubmit);

        const updateStatusForm = document.getElementById('updateStatusForm');
        if (updateStatusForm) updateStatusForm.addEventListener('submit', handleUpdateStatusSubmit);

        const filterSalesRecordsBtn = document.getElementById('filterSalesRecordsBtn');
        if (filterSalesRecordsBtn) {
            filterSalesRecordsBtn.addEventListener('click', () => {
                loadSalesRecords();
            });
        }

        const searchSalesBtn = document.getElementById('searchSalesBtn');
        if (searchSalesBtn) {
            searchSalesBtn.addEventListener('click', async () => {
                const customerEl = document.getElementById('searchCustomer');
                const dateEl = document.getElementById('salesHistoryDate');
                if (!customerEl || !dateEl) return;
                
                const customer = customerEl.value.trim();
                const date = dateEl.value;

                try {
                    const response = await fetch(`/api/search-sales?customer=${customer}&date=${date}`);
                    const sales = await response.json();
                    renderSearchResults(sales);
                } catch (error) {
                    console.error('Error searching sales:', error);
                    showNotification('Error searching sales', 'error');
                }
            });
        }

        const customerForm = document.getElementById('customerForm');
        if (customerForm) customerForm.addEventListener('submit', handleCustomerSubmit);

        // Close modals when clicking on the background overlay
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });

    // Ctrl + F Shortcut for searching
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            const activePage = document.querySelector('.page.active');
            if (activePage) {
                const searchBox = activePage.querySelector('.search-box');
                if (searchBox) {
                    e.preventDefault();
                    searchBox.focus();
                    searchBox.select(); // Highlight content
                    searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Smooth visual feedback via CSS class
                    searchBox.classList.add('highlight-trigger');
                    setTimeout(() => {
                        searchBox.classList.remove('highlight-trigger');
                    }, 1000);
                }
            }
        }
    });

    console.log('Other forms listeners attached');

    // Fetch initial data for autocompletes
    fetch('/api/inventory').then(r => r.json()).then(products => {
        if (Array.isArray(products)) {
            window.inventoryItemNames = products.map(p => p.name);
            // Re-initialize static autocompletes now that data is loaded
            const itemNameInput = document.getElementById('itemName');
            const reorderItemInput = document.getElementById('reorderItem');
            if (itemNameInput) new Autocomplete(itemNameInput, async () => window.inventoryItemNames || []);
            if (reorderItemInput) new Autocomplete(reorderItemInput, async () => window.inventoryItemNames || []);
        }
    });
} catch (err) {
    console.error('Error during Other Forms initialization:', err);
}
});

function renderSearchResults(sales) {
    const table = document.getElementById('salesRecordsTable');
    if (!table) return;
    
    table.innerHTML = sales.map((sale, index) => {
        const statusColor = sale.payment_status.toLowerCase();
        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${sale.sale_num}</strong></td>
                <td>${sale.customer}</td>
                <td>${sale.date}</td>
                <td>₦${formatCurrency(sale.total_amount)}</td>
                <td>
                    <span class="payment-status-badge ${statusColor}">
                        ${sale.payment_status}
                    </span>
                </td>
                <td>${sale.performed_by || '-'}</td>
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
        table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No sales found</td></tr>';
    }
}

// Stub for reorder form submit handler
function handleReorderSubmit(event) {
    event.preventDefault();
    console.warn('handleReorderSubmit is not yet implemented.');
    // TODO: Implement reorder logic here
}

// Page Navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.getAttribute('data-page');
            if (pageName) {
                showPage(pageName);

                // Update active state for both navs
                document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(nav => {
                    nav.classList.remove('active');
                    if (nav.getAttribute('data-page') === pageName) {
                        nav.classList.add('active');
                    }
                });
            }
        });
    });

    // FAB Action
    const mainFab = document.getElementById('mainFab');
    if (mainFab) {
        mainFab.addEventListener('click', () => {
            showPage('entry');
            // Update active state
            document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(nav => {
                nav.classList.remove('active');
                if (nav.getAttribute('data-page') === 'entry') {
                    nav.classList.add('active');
                }
            });
        });
    }

    // More menu for mobile
    const moreMobileNav = document.getElementById('moreMobileNav');
    if (moreMobileNav) {
        moreMobileNav.addEventListener('click', (e) => {
            e.preventDefault();
            const sidebar = document.querySelector('.sidebar');
            sidebar.classList.toggle('active');
        });
    }
}

initializeNavigation();

// Dashboard date filter
document.getElementById('dashboardDateFilter').addEventListener('change', () => {
    loadDashboard();
});

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageName).classList.add('active');

    // Persist current page across refreshes
    localStorage.setItem('activePage', pageName);

    // Update active state for both sidebar and bottom nav
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageName) {
            nav.classList.add('active');
        }
    });

    if (pageName === 'dashboard') loadDashboard();
    if (pageName === 'inventory') loadInventory();
    if (pageName === 'stock_log') loadTransactions();
    if (pageName === 'sales_history') loadSalesHistory();
    if (pageName === 'sales') {
        loadSalesHistory();
        loadSalesRecords();
        // Pre-load customer suggestions for POS autocomplete
        fetch('/api/customers').then(r => r.json()).then(customers => {
            if (Array.isArray(customers)) {
                window.customerNames = customers.map(c => c.name);
                const customerInput = document.getElementById('saleCustomer');
                if (customerInput) {
                    new Autocomplete(customerInput, async () => window.customerNames || []);
                }
            }
        }).catch(() => {});
    }
    if (pageName === 'admin') {
        loadUsers();
        loadActivityLog();
    }
    if (pageName === 'expenses') {
        loadExpenses();
        loadExpensesSummary();
    }
    if (pageName === 'lowStockItems') {
        loadLowStockItems();
    }
    if (pageName === 'customers') {
        loadCustomers();
    }
}

// Full Low Stock Items
async function loadLowStockItems() {
    const table = document.getElementById('fullLowStockTable');
    table.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const response = await fetch('/api/low-stock');
        const data = await response.json();

        if (data.success) {
            table.innerHTML = data.products.map((item, index) => {
                const deficit = item.reorder_level - item.quantity;
                return `
                    <tr class="low-stock-row">
                        <td>${index + 1}</td>
                        <td><strong>${item.name}</strong></td>
                        <td>${item.brand || '-'}</td>
                        <td><span class="status-badge danger">${item.quantity}</span></td>
                        <td>₦${formatCurrency(item.cost_price || 0)}</td>
                        <td>₦${formatCurrency(item.selling_price || 0)}</td>
                        <td>${item.reorder_level}</td>
                        <td><span style="color: var(--danger); font-weight: 600;">${deficit}</span></td>
                        <td>
                            <div class="action-buttons">
                                <button class="action-btn edit" onclick="openReorderModal('${item.name}', ${item.reorder_level})">Update Level</button>
                                <button class="action-btn success" onclick="showPage('entry'); document.getElementById('itemName').value='${item.name}';">Restock</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if (data.products.length === 0) {
                table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No low stock items found. All good!</td></tr>';
            }
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading low stock items:', error);
        table.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--danger);">Error: ${error.message}</td></tr>`;
    }
}

let isLowStockFiltered = false;
function toggleLowStockFilter() {
    isLowStockFiltered = !isLowStockFiltered;
    const btnText = document.getElementById('lowStockFilterText');
    const rows = document.querySelectorAll('#inventoryTable tr');

    if (isLowStockFiltered) {
        btnText.textContent = 'Show All Items';
        rows.forEach(row => {
            const status = row.querySelector('.status-badge');
            if (status && !status.classList.contains('danger')) {
                row.style.display = 'none';
            } else {
                row.style.display = '';
            }
        });
    } else {
        btnText.textContent = 'Show Only Low Stock';
        rows.forEach(row => row.style.display = '');
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

function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalContent = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        button.style.opacity = '0.7';
        button.style.cursor = 'not-allowed';
    } else {
        button.disabled = false;
        if (button.dataset.originalContent) {
            button.innerHTML = button.dataset.originalContent;
        }
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    }
}


/**
 * Formats a number with comma separators and 2 decimal places.
 * Example: 1250000 -> 1,250,000.00
 */
function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
    return parseFloat(amount).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Notification System (Now using Beautiful Modals)
function showNotification(message, type = 'success') {
    // Determine title based on type
    let title = 'Notification';
    if (type === 'success') title = 'Success';
    if (type === 'error') title = 'Action Failed';
    if (type === 'warning') title = 'Warning';
    if (type === 'info') title = 'System Info';

    // Fallback toast for feedback without modal interruption

    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => notification.classList.remove('show'), 4000);
    }
}


// Universal Alert Modal
function showAlertModal(message, type = 'info', title = 'Notification') {
    const modal = document.getElementById('alertModal');
    const icon = document.getElementById('alertModalIcon');
    const titleEl = document.getElementById('alertModalTitle');
    const messageEl = document.getElementById('alertModalMessage');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Set icon and colors based on type
    let iconClass = 'fa-info-circle';
    modal.className = `modal modal-${type}`;

    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-circle';
    if (type === 'warning') iconClass = 'fa-exclamation-triangle';

    icon.innerHTML = `<i class="fas ${iconClass}"></i>`;
    modal.classList.add('show');
}

function closeAlertModal() {
    document.getElementById('alertModal').classList.remove('show');
}

// Override native alert
window.alert = function (message) {
    showAlertModal(message, 'info', 'System Message');
};

// Override native confirm (Async version needed for logic, so we use a custom one below)


// ==================== OFFLINE FUNCTIONALITY ====================
// IndexedDB Setup
const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 3;
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
            if (!db.objectStoreNames.contains('dashboard')) {
                db.createObjectStore('dashboard', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('customers')) {
                db.createObjectStore('customers', { keyPath: 'id' });
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

    // Batch size for parallel requests
    const BATCH_SIZE = 5;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (operation) => {
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
        }));
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
    const cacheKey = `dashboard_${dateFilter || 'all'}`;

    // 1. Try to load from cache first for instant UI
    try {
        const cachedData = await getFromIndexedDB('dashboard');
        const latestCache = cachedData.find(d => d.id === cacheKey);
        if (latestCache) {
            renderDashboard(
                latestCache.data.inventory_stats,
                latestCache.data.low_stock_products,
                latestCache.data.transactions,
                latestCache.data.sales_summary,
                latestCache.data.metrics,
                latestCache.data.recent_sales
            );
            console.log('Dashboard rendered from cache');
        }
    } catch (err) {
        console.warn('Cache load failed:', err);
    }

    // 2. Fetch fresh data in the background
    try {
        const response = await fetch(`/api/dashboard-combined${dateFilter ? `?date=${dateFilter}` : ''}`);
        const data = await response.json();

        if (data.success) {
            // Update UI with fresh data
            renderDashboard(
                data.inventory_stats,
                data.low_stock_products,
                data.transactions,
                data.sales_summary,
                data.metrics,
                data.recent_sales
            );
            
            // Save to cache for next time
            await saveToIndexedDB('dashboard', { id: cacheKey, data: data, timestamp: new Date().getTime() });
            console.log('Dashboard updated from network and cached');
        } else {
            // Handle specific errors from the API
            if (data.error === 'Authentication required') {
                window.location.href = '/login';
                return;
            }
            throw new Error(data.error || 'Failed to load dashboard data');
        }

    } catch (error) {
        console.error('Error loading fresh dashboard data:', error);
        // Only show notification if we don't even have cached data to show
        if (!cachedProducts || cachedProducts.length === 0) {
            const errorMsg = error.message.includes('Authentication') ? 'Session expired. Please login again.' : 'Error loading dashboard data';
            showNotification(errorMsg, 'error');

            if (error.message.includes('Authentication')) {
                setTimeout(() => window.location.href = '/login', 2000);
            }
        }
    }
}

// Separate rendering logic for reusability
function renderDashboard(inventoryStats, lowStockProducts, transactions, salesSummary, metrics, recentSales) {
    // Check if we're using old products array or new stats object
    let totalItems, lowStock, healthyStock, totalUnits;

    if (inventoryStats && inventoryStats.total_items !== undefined) {
        // Optimized path
        totalItems = inventoryStats.total_items;
        lowStock = inventoryStats.low_stock_count;
        healthyStock = totalItems - lowStock;
        totalUnits = inventoryStats.total_units;
    } else {
        // Fallback for cached full inventory
        const products = Array.isArray(inventoryStats) ? inventoryStats : [];
        totalItems = products.length;
        lowStock = products.filter(p => p.quantity <= p.reorder_level).length;
        healthyStock = totalItems - lowStock;
        totalUnits = products.reduce((sum, p) => sum + p.quantity, 0);
    }

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('lowStock').textContent = lowStock;
    document.getElementById('healthyStock').textContent = healthyStock;
    document.getElementById('totalUnits').textContent = totalUnits;

    // Sales stats
    document.getElementById('todaysSales').textContent = salesSummary.total_sales || 0;
    document.getElementById('totalRevenue').textContent = `₦${formatCurrency(metrics.total_revenue || 0)}`;
    document.getElementById('totalExpenses').textContent = `₦${formatCurrency(metrics.total_expenses || 0)}`;

    // Total credit
    const totalCredit = salesSummary.credit_amount || 0;
    document.getElementById('totalCredit').textContent = `₦${formatCurrency(totalCredit)}`;

    // Total pending
    const totalPending = salesSummary.pending_amount || 0;
    document.getElementById('totalPending').textContent = `₦${formatCurrency(totalPending)}`;

    // Realized payment (paid amount - expenses)
    const paidAmount = salesSummary.paid_amount || 0;
    const totalExpenses = metrics.total_expenses || 0;
    const realizedPayment = paidAmount - totalExpenses;
    const realizedPaymentElement = document.getElementById('realizedPayment');
    realizedPaymentElement.textContent = `₦${formatCurrency(realizedPayment)}`;
    if (realizedPayment < 0) {
        realizedPaymentElement.style.color = 'var(--danger-color)';
    } else {
        realizedPaymentElement.style.color = 'var(--secondary-color)';
    }

    // Low stock items
    const lowStockTable = document.getElementById('lowStockTable');
    const displayItems = Array.isArray(lowStockProducts) ? lowStockProducts :
        (Array.isArray(inventoryStats) ? inventoryStats.filter(p => p.quantity <= p.reorder_level) : []);

    lowStockTable.innerHTML = displayItems.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.reorder_level}</td>
            <td><span class="status-badge danger">Low Stock</span></td>
        </tr>
    `).join('');

    if (displayItems.length === 0) {
        lowStockTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No low stock items</td></tr>';
    }

    // Recent transactions
    const recentTx = transactions.slice(0, 5);
    const txTable = document.getElementById('recentTransactions');
    txTable.innerHTML = recentTx.map((tx, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${tx.item_name}</td>
            <td>${tx.quantity}</td>
            <td><span class="status-badge ${tx.type === 'Intake' ? 'success' : 'warning'}">${tx.type}</span></td>
            <td>${tx.time}</td>
            <td>${tx.performed_by || '-'}</td>
        </tr>
    `).join('');

    if (recentTx.length === 0) {
        txTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No transactions yet</td></tr>';
    }

    // Recent sales
    const recentSalesLimited = recentSales.slice(0, 5);
    const recentSalesTable = document.getElementById('recentSalesTable');
    recentSalesTable.innerHTML = recentSalesLimited.map((sale, index) => {
        const statusColor = sale.payment_status.toLowerCase();
        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${sale.sale_num}</strong></td>
                <td>${sale.customer}</td>
                <td>${sale.date}</td>
                <td>₦${formatCurrency(sale.total_amount)}</td>
                <td><span class="payment-status-badge ${statusColor}">${sale.payment_status}</span></td>
                <td>${sale.performed_by || '-'}</td>
            </tr>
        `;
    }).join('');

    if (recentSalesLimited.length === 0) {
        recentSalesTable.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
    }
}


// --- INVENTORY ---
async function loadInventory() {
    // 1. Show cached data immediately
    try {
        const cachedProducts = await getFromIndexedDB('inventory');
        if (cachedProducts && cachedProducts.length > 0) {
            renderInventory(cachedProducts);
            updateItemSuggestions(cachedProducts);
            console.log('Inventory rendered from cache');
        }
    } catch (err) {
        console.warn('Inventory cache load failed:', err);
    }

    // 2. Fetch fresh data in background
    try {
        const response = await fetch('/api/inventory');
        const products = await response.json();

        if (Array.isArray(products)) {
            renderInventory(products);
            updateItemSuggestions(products);
            
            // Clear and update cache
            // Note: In a real app we might want a more sophisticated cache update
            await saveToIndexedDB('inventory', products);
            console.log('Inventory updated from network and cached');
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
        if (!navigator.onLine) {
            showNotification('Offline - showing cached data', 'info');
        } else {
            showNotification('Error updating inventory', 'error');
        }
    }
}

// Helper to render inventory table
function renderInventory(products) {
    const table = document.getElementById('inventoryTable');
    if (!table) return;

    table.innerHTML = products.map((item, index) => {
        const isLow = item.quantity <= item.reorder_level;
        return `
            <tr class="${isLow ? 'low-stock-row' : ''}">
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td>${item.brand || '-'}</td>
                <td>${item.quantity}</td>
                <td>₦${formatCurrency(item.cost_price || 0)}</td>
                <td>₦${formatCurrency(item.selling_price || 0)}</td>
                <td>${item.reorder_level}</td>
                <td>
                    <span class="status-badge ${isLow ? 'danger' : 'healthy'}">
                        ${isLow ? 'Low Stock' : 'Healthy'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="openReorderModal('${item.name}', ${item.reorder_level})">Update</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (products.length === 0) {
        table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No items in inventory</td></tr>';
    }

    // Re-setup search listener if needed (or just use event delegation)
    setupInventorySearch();
}

function setupInventorySearch() {
    const searchInput = document.getElementById('searchInventory');
    if (!searchInput) return;

    // Use a fresh listener
    searchInput.onkeyup = () => {
        const searchTerm = searchInput.value.toLowerCase();
        document.querySelectorAll('#inventoryTable tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    };
}

// Update item suggestions for forms
function updateItemSuggestions(products) {
    window.inventoryItemNames = products.map(p => p.name);
}

// Initialize autocomplete for static fields
document.addEventListener('DOMContentLoaded', () => {
    const itemNameInput = document.getElementById('itemName');
    const reorderItemInput = document.getElementById('reorderItem');
    
    if (itemNameInput) new Autocomplete(itemNameInput, async () => window.inventoryItemNames || []);
    if (reorderItemInput) new Autocomplete(reorderItemInput, async () => window.inventoryItemNames || []);
});

// --- NEW ENTRY FORM ---
async function handleEntrySubmit(e) {
    e.preventDefault();
    console.log('Entry form submission started');

    const nameEl = document.getElementById('itemName');
    const brandEl = document.getElementById('itemBrand');
    const quantityEl = document.getElementById('quantity');
    const typeEl = document.getElementById('entryType');

    if (!nameEl || !quantityEl || !typeEl) {
        console.error('Entry form elements not found');
        return;
    }

    const costPriceEl = document.getElementById('costPrice');
    const sellingPriceEl = document.getElementById('sellingPrice');
    const name = nameEl.value.trim();
    const brand = brandEl ? brandEl.value.trim() : '';
    const quantity = parseInt(quantityEl.value);
    const cost_price = costPriceEl ? parseFloat(costPriceEl.value) || 0 : 0;
    const selling_price = sellingPriceEl ? parseFloat(sellingPriceEl.value) || 0 : 0;
    const type = typeEl.value;

    if (!name || quantity <= 0) {
        showNotification('Please fill in all fields correctly', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true);

    try {
        const response = await fetch('/api/add-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, brand, quantity, cost_price, selling_price, type })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message, 'success');
            document.getElementById('entryForm').reset();
            if (brandEl) brandEl.value = '';
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        // Queue the operation for sync
        if (!navigator.onLine) {
            await addToSyncQueue('POST', '/api/add-entry', { name, brand, quantity, cost_price, selling_price, type });
            showNotification('Entry saved offline - will sync when online', 'info');
            document.getElementById('entryForm').reset();
            if (brandEl) brandEl.value = '';
            updateSyncStatus('Offline', 'offline');
        } else {
            showNotification('Error recording entry', 'error');
        }
    } finally {
        setButtonLoading(submitBtn, false);
    }
}

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
        const result = await response.json();

        if (!response.ok || !Array.isArray(result)) {
            throw new Error(result.error || 'Failed to load transactions');
        }

        const transactions = result;
        const table = document.getElementById('transactionsTable');
        table.innerHTML = transactions.map((tx, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${tx.date}</td>
                <td>${tx.time}</td>
                <td>${tx.item_name}</td>
                <td>${tx.quantity}</td>
                <td><span class="status-badge ${tx.type === 'Intake' ? 'success' : 'warning'}">${tx.type}</span></td>
                <td>${tx.performed_by || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn delete" onclick="confirmDelete(${tx.id}, 'transaction', '${tx.item_name}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (transactions.length === 0) {
            table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No transactions found</td></tr>';
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

async function handleQuickReorderSubmit(e) {
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
}
document.getElementById('quickReorderForm').addEventListener('submit', handleQuickReorderSubmit);

// --- AUTHENTICATION & ADMIN ---
let currentUserId = null;

// Check login status on load
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/current-user');
        const data = await response.json();

        if (data.success) {
            const user = data.user;
            currentUserId = user.id;
            document.getElementById('currentUser').textContent = user.username;

            // Show admin links if admin
            if (user.role === 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
            }
            // Set avatar initial
            const avatar = document.getElementById('userAvatar');
            if (avatar && user.username) {
                avatar.textContent = user.username.charAt(0).toUpperCase();
            }
        } else {
            // Not logged in, redirect to login
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Error checking login status:', error);
        // If offline, maybe allow access if cached? But security...
        // For now, redirect to login on error if not offline-capable for auth
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }
}

// Initial check
if (window.location.pathname !== '/login') {
    checkLoginStatus();
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    confirmAction('Are you sure you want to log out?', async () => {
        try {
            const response = await fetch('/api/logout', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/login';
        }
    });
});

// --- ADMIN PANEL FUNCTIONS ---

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('usersTable');
            tbody.innerHTML = data.users.map((user, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${user.username}</td>
                    <td>${user.full_name || '-'}</td>
                    <td><span class="status-badge ${user.role}">${user.role}</span></td>
                    <td>
                        <span class="status-badge ${user.is_active ? 'success' : 'danger'}">
                            ${user.is_active ? 'Active' : 'Disabled'}
                        </span>
                    </td>
                    <td>${user.created_at}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" title="Edit User" 
                                    onclick="openEditUserModal(${user.id}, '${user.username}', '${user.full_name || ''}', '${user.email || ''}', '${user.role}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn" style="background-color: #f59e0b; color: white;" title="Reset Password"
                                    onclick="openAdminResetPasswordModal(${user.id}, '${user.username}')">
                                <i class="fas fa-key"></i>
                            </button>
                            <button class="action-btn ${user.is_active ? 'warning' : 'success'}" 
                                    title="${user.is_active ? 'Disable' : 'Enable'} User"
                                    onclick="toggleUserActive(${user.id})"
                                    ${user.id === currentUserId ? 'disabled' : ''}>
                                <i class="fas ${user.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                            </button>
                            <button class="action-btn delete" title="Delete User"
                                    onclick="deleteUser(${user.id})"
                                    ${user.id === currentUserId ? 'disabled' : ''}>
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Error loading users', 'error');
    }
}

async function loadActivityLog() {
    try {
        const response = await fetch('/api/activity-log');
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('activityLogTable');
            if (tbody) {
                tbody.innerHTML = data.logs.map(log => `
                    <tr onclick="showActivityDetails('${log.username}', '${log.action}', '${log.details.replace(/'/g, "\\'")}', '${log.timestamp}')" style="cursor: pointer;">
                        <td><strong>${log.username}</strong></td>
                        <td>${log.action}</td>
                        <td><small>${log.details || '-'}</small></td>
                        <td>${log.timestamp}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading activity log:', error);
    }
}

function showActivityDetails(user, action, details, time) {
    const message = `User: ${user}\nAction: ${action}\nDetails: ${details}\nTime: ${time}`;
    showAlertModal(message, 'info', 'Activity Details');
}

// User Search
document.getElementById('searchUsers')?.addEventListener('keyup', () => {
    const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
    document.querySelectorAll('#usersTable tr').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
});

// Add User Modal
const addUserModal = document.getElementById('addUserModal');
function openAddUserModal() {
    addUserModal.classList.add('show');
}
function closeAddUserModal() {
    addUserModal.classList.remove('show');
    document.getElementById('addUserForm').reset();
}

document.getElementById('addUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const full_name = document.getElementById('newFullName').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, full_name, email, password, role })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('User created successfully', 'success');
            closeAddUserModal();
            loadUsers();
        } else {
            showNotification(data.error || 'Failed to create user', 'error');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('Error creating user', 'error');
    }
});

async function toggleUserActive(userId) {
    confirmAction('Change user status?', async () => {

        try {
            const response = await fetch(`/api/users/${userId}/toggle-active`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                showNotification(data.message, 'success');
                loadUsers();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error('Error toggling user:', error);
            showNotification('Error updating user status', 'error');
        }
    });
}

async function performLocalBackup() {
    try {
        showNotification('Starting backup...', 'info');
        const response = await fetch('/api/backup/local', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.error || 'Backup failed', 'error');
        }
    } catch (error) {
        console.error('Error performing backup:', error);
        showNotification('Error connecting to server', 'error');
    }
}

async function deleteUser(userId) {
    confirmAction('Are you sure you want to delete this user? This cannot be undone.', async () => {

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                showNotification('User deleted successfully', 'success');
                loadUsers();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Error deleting user', 'error');
        }
    });
}

// Edit User Modal
const editUserModal = document.getElementById('editUserModal');
function openEditUserModal(id, username, fullName, email, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = username;
    document.getElementById('editFullName').value = fullName;
    document.getElementById('editEmail').value = email;
    document.getElementById('editRole').value = role;
    editUserModal.classList.add('show');
}
function closeEditUserModal() {
    editUserModal.classList.remove('show');
    document.getElementById('editUserForm').reset();
}

document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const fullName = document.getElementById('editFullName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const role = document.getElementById('editRole').value;

    try {
        const response = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: fullName, email, role })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('User updated successfully', 'success');
            closeEditUserModal();
            loadUsers();
        } else {
            showNotification(data.error || 'Failed to update user', 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showNotification('Error updating user', 'error');
    }
});

// Admin Reset Password Modal
const adminResetPasswordModal = document.getElementById('adminResetPasswordModal');
function openAdminResetPasswordModal(id, username) {
    document.getElementById('resetUserId').value = id;
    document.getElementById('resetUserUsername').value = username;
    adminResetPasswordModal.classList.add('show');
}
function closeAdminResetPasswordModal() {
    adminResetPasswordModal.classList.remove('show');
    document.getElementById('adminResetPasswordForm').reset();
}

document.getElementById('adminResetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('resetUserId').value;
    const newPassword = document.getElementById('resetNewPassword').value;

    try {
        const response = await fetch(`/api/users/${id}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPassword })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Password reset successfully', 'success');
            closeAdminResetPasswordModal();
        } else {
            showNotification(data.error || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showNotification('Error resetting password', 'error');
    }
});

// Hook into showPage to load users when Admin tab is clicked
const originalShowPage = showPage;
showPage = function (pageName) {
    originalShowPage(pageName);
    if (pageName === 'admin') {
        loadUsers();
    }
};

// Restore last visited page on startup (defaults to 'dashboard')
const savedPage = localStorage.getItem('activePage') || 'dashboard';
const validPages = ['dashboard', 'inventory', 'entry', 'transactions', 'invoice', 'sales', 'expenses', 'admin'];
const pageToRestore = validPages.includes(savedPage) ? savedPage : 'dashboard';

// Sync active nav state with the restored page
document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(nav => {
    nav.classList.remove('active');
    if (nav.getAttribute('data-page') === pageToRestore) {
        nav.classList.add('active');
    }
});

showPage(pageToRestore);


// --- EXPENSES FUNCTIONALITY ---
// --- EXPENSES FUNCTIONALITY ---
async function handleExpenseSubmit(e) {
    if (e) e.preventDefault();

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
            loadDashboard();
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
}

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
        table.innerHTML = expenses.map((expense, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${expense.date}</td>
                <td>${expense.description}</td>
                <td><span class="status-badge healthy">${expense.category}</span></td>
                <td><strong>₦${formatCurrency(expense.amount)}</strong></td>
                <td>${expense.notes || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn delete" onclick="confirmDeleteExpense(${expense.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (expenses.length === 0) {
            table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No expenses recorded</td></tr>';
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
        // Load from cache on error
        const expenses = await getFromIndexedDB('expenses');

        const table = document.getElementById('expensesTable');
        if (expenses.length > 0) {
            table.innerHTML = expenses.map((expense, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${expense.date}</td>
                    <td>${expense.description}</td>
                    <td><span class="status-badge healthy">${expense.category}</span></td>
                    <td><strong>₦${formatCurrency(expense.amount)}</strong></td>
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
            table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No cached expenses available</td></tr>';
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

        document.getElementById('totalExpenses').textContent = `₦${formatCurrency(data.total_expenses)}`;

        const categoryDiv = document.getElementById('expensesByCategory');
        categoryDiv.innerHTML = data.by_category.map(cat => `
            <div class="category-item">
                <span class="category-name">${cat.category}</span>
                <span class="category-amount">₦${formatCurrency(cat.total)}</span>
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

    // Disable button to prevent double-click
    const confirmBtn = document.getElementById('confirmBtn');
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

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
            showAlertModal(result.message, 'success', 'Deleted Successfully');
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
            showAlertModal(result.error || 'Error deleting item', 'error', 'Action Failed');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlertModal('Error connecting to server', 'error', 'Connection Error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
});

// Helper for confirmation actions
let confirmCallback = null;
function confirmAction(message, callback) {
    confirmCallback = callback;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').classList.add('show');
}

// Handle global confirmation
document.getElementById('confirmBtn').addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
        document.getElementById('confirmModal').classList.remove('show');
    }
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    confirmModal.classList.remove('show');
});

// --- SALES PAGE FUNCTIONALITY ---
let currentSaleNum = null;

function addNewSaleRow() {
    const container = document.getElementById('saleItemsContainer');
    if (!container) return;
    const itemRow = document.createElement('div');
    itemRow.className = 'sale-item-row';
    itemRow.innerHTML = `
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
                <input type="text" inputmode="decimal" class="item-price" placeholder="Price" required>
            </div>
            <div class="form-group">
                <label>Total</label>
                <input type="text" class="item-total" readonly placeholder="0.00">
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
    const newNameInput = itemRow.querySelector('.item-name');
    if (newNameInput) {
        newNameInput.focus();
    }
}

document.getElementById('addItemBtn')?.addEventListener('click', addNewSaleRow);

function removeItem(button) {
    button.closest('.sale-item-row').remove();
    updateSaleSummary();
}

function attachItemListeners(row) {
    const nameInput = row.querySelector('.item-name');
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const totalInput = row.querySelector('.item-total');

    const updateTotal = () => {
        const qty = parseFloat(qtyInput.value) || 0;
        const priceStr = priceInput.value.replace(/,/g, '');
        const price = parseFloat(priceStr) || 0;
        const total = qty * price;
        totalInput.value = formatCurrency(total);
        
        // Instant visual stock warning
        const available = qtyInput.dataset.available ? parseInt(qtyInput.dataset.available) : null;
        const formGroup = qtyInput.closest('.form-group');
        let warningEl = formGroup.querySelector('.qty-warning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.className = 'qty-warning';
            warningEl.style.color = 'var(--danger)';
            warningEl.style.fontSize = '0.75rem';
            warningEl.style.marginTop = '0.25rem';
            warningEl.style.display = 'none';
            formGroup.appendChild(warningEl);
        }

        if (available !== null && qty > available) {
            qtyInput.style.borderColor = 'var(--danger)';
            qtyInput.style.backgroundColor = '#fff1f2';
            warningEl.textContent = `Only ${available} left!`;
            warningEl.style.display = 'block';
        } else {
            qtyInput.style.borderColor = '';
            qtyInput.style.backgroundColor = '';
            warningEl.style.display = 'none';
        }

        updateSaleSummary();
    };

    // Auto-fill price from inventory
    const handleNameSelect = async () => {
        const itemName = nameInput.value.trim();
        if (!itemName) {
            qtyInput.dataset.available = "";
            return;
        }

        try {
            const inventory = await getFromIndexedDB('inventory');
            const item = inventory.find(i => i.name.toLowerCase() === itemName.toLowerCase());
            if (item) {
                qtyInput.dataset.available = item.quantity;
                priceInput.value = formatCurrency(item.selling_price || 0);
                updateTotal();
            }
        } catch (err) {
            console.error('Error fetching inventory item for validation:', err);
        }
    };
    
    nameInput.addEventListener('change', handleNameSelect);
    nameInput.addEventListener('input', handleNameSelect);

    qtyInput.addEventListener('change', updateTotal);
    qtyInput.addEventListener('input', updateTotal);
    priceInput.addEventListener('change', updateTotal);
    priceInput.addEventListener('input', updateTotal);
    priceInput.addEventListener('blur', () => {
        if (!priceInput.value) return;
        const priceStr = priceInput.value.replace(/,/g, '');
        const price = parseFloat(priceStr) || 0;
        priceInput.value = formatCurrency(price);
    });

    // Initialize autocomplete for this row
    new Autocomplete(nameInput, async () => window.inventoryItemNames || []);
}

function updateSaleSummary() {
    const rows = document.querySelectorAll('.sale-item-row');
    let totalItems = 0;
    let totalQty = 0;
    let totalAmount = 0;

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const totalStr = row.querySelector('.item-total').value.replace(/,/g, '');
        const total = parseFloat(totalStr) || 0;

        if (qty > 0) totalItems++;
        totalQty += qty;
        totalAmount += total;
    });

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalQty').textContent = totalQty;
    document.getElementById('saleTotal').textContent = formatCurrency(totalAmount);
}

// Initialize item listeners
document.querySelectorAll('.sale-item-row').forEach(row => {
    attachItemListeners(row);
});

// Submit sale form
async function handleSaleSubmit(e) {
    e.preventDefault();

    const customer = document.getElementById('saleCustomer').value.trim();
    const paymentStatus = document.getElementById('paymentStatus').value;

    if (!customer) {
        showNotification('Please enter customer name', 'error');
        return;
    }

    // Get inventory to validate items and stock
    let inventoryMap = {};
    try {
        const inventoryResponse = await fetch('/api/inventory');
        const inventoryData = await inventoryResponse.json();
        inventoryData.forEach(p => {
            inventoryMap[p.name.toLowerCase()] = p.quantity;
        });
    } catch (error) {
        console.error('Error fetching inventory:', error);
        showNotification('Error validating items', 'error');
        return;
    }

    const items = [];
    let invalidItem = null;
    let insufficientStockItem = null;
    const requestedQtys = {};

    document.querySelectorAll('.sale-item-row').forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const qty = parseInt(row.querySelector('.item-qty').value);
        const priceStr = row.querySelector('.item-price').value.replace(/,/g, '');
        const price = parseFloat(priceStr);

        if (name && qty > 0 && price >= 0) {
            const lowerName = name.toLowerCase();
            
            requestedQtys[lowerName] = (requestedQtys[lowerName] || 0) + qty;

            // Check if item exists in inventory
            if (!(lowerName in inventoryMap)) {
                invalidItem = name;
            } else if (requestedQtys[lowerName] > inventoryMap[lowerName]) {
                if (!insufficientStockItem) {
                    insufficientStockItem = { name: name, available: inventoryMap[lowerName] };
                }
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

    if (insufficientStockItem) {
        showNotification(`Insufficient stock for "${insufficientStockItem.name}". Only ${insufficientStockItem.available} available.`, 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true);

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
                            <input type="text" inputmode="decimal" class="item-price" placeholder="Price" required>
                        </div>
                        <div class="form-group">
                            <label>Total</label>
                            <input type="text" class="item-total" readonly placeholder="0.00">
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

            attachItemListeners(document.querySelector('.sale-item-row'));
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
    } finally {
        if (submitBtn) {
            setButtonLoading(submitBtn, false);
        }
    }
}
document.getElementById('saleForm').addEventListener('submit', handleSaleSubmit);

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
        const recentTable = document.getElementById('recentSalesTable');

        const rowsHTML = sales.map((sale, index) => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${formatCurrency(sale.total_amount)}</td>
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

        if (table) {
            table.innerHTML = rowsHTML || '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
        }

        if (recentTable) {
            // Show last 8 sales in condensed view
            const recentSales = sales.slice(0, 8);
            recentTable.innerHTML = recentSales.map(sale => {
                const statusColor = sale.payment_status.toLowerCase();
                return `
                    <tr>
                        <td><strong>${sale.sale_num}</strong></td>
                        <td>${sale.customer}</td>
                        <td>${sale.date}</td>
                        <td>₦${formatCurrency(sale.total_amount)}</td>
                        <td><span class="payment-status-badge ${statusColor}">${sale.payment_status}</span></td>
                        <td><button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button></td>
                    </tr>
                `;
            }).join('') || '<tr><td colspan="6" style="text-align:center;">No recent sales</td></tr>';
        }
    } catch (error) {
        console.error('Error loading sales:', error);
        // Load from cache on error
        const sales = await getFromIndexedDB('sales');

        const table = document.getElementById('salesTable');
        if (sales.length > 0) {
            table.innerHTML = sales.map((sale, index) => {
                const statusColor = sale.payment_status.toLowerCase();
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${sale.sale_num}</strong></td>
                        <td>${sale.customer}</td>
                        <td>${sale.date}</td>
                        <td>₦${formatCurrency(sale.total_amount)}</td>
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
            table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No cached sales available</td></tr>';
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
        table.innerHTML = sales.map((sale, index) => {
            const statusColor = sale.payment_status.toLowerCase();
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer}</td>
                    <td>${sale.date}</td>
                    <td>₦${formatCurrency(sale.total_amount)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${sale.payment_status}
                        </span>
                    </td>
                    <td>${sale.performed_by || '-'}</td>
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
            table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
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
                    <td>₦${formatCurrency(item.price)}</td>
                    <td>₦${formatCurrency(item.total)}</td>
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
                    <span style="color: var(--primary-color);">₦${formatCurrency(sale.total_amount)}</span>
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

async function handleUpdateStatusSubmit(e) {
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
}
const updateStatusForm = document.getElementById('updateStatusForm');
if (updateStatusForm) {
    updateStatusForm.addEventListener('submit', handleUpdateStatusSubmit);
}

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

const searchSalesBtn = document.getElementById('searchSalesBtn');
if (searchSalesBtn) {
    searchSalesBtn.addEventListener('click', async () => {
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
                        <td>₦${formatCurrency(sale.total_amount)}</td>
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
}

const filterSalesRecordsBtn = document.getElementById('filterSalesRecordsBtn');
if (filterSalesRecordsBtn) {
    filterSalesRecordsBtn.addEventListener('click', () => {
        loadSalesRecords();
    });
}

// --- MODAL & FORM HANDLERS ---
function openReorderModal(name, currentLevel) {
    const itemEl = document.getElementById('quickReorderItem');
    const levelEl = document.getElementById('quickReorderLevel');
    const modalEl = document.getElementById('reorderModal');
    
    if (itemEl) itemEl.value = name;
    if (levelEl) levelEl.value = currentLevel;
    if (modalEl) modalEl.classList.add('show');
}

function closeReorderModal() {
    const modalEl = document.getElementById('reorderModal');
    if (modalEl) modalEl.classList.remove('show');
}

async function handleQuickReorderSubmit(e) {
    e.preventDefault();
    const nameEl = document.getElementById('quickReorderItem');
    const levelEl = document.getElementById('quickReorderLevel');
    if (!nameEl || !levelEl) return;

    const name = nameEl.value;
    const level = parseInt(levelEl.value);

    try {
        const response = await fetch('/api/update-reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Reorder level updated successfully', 'success');
            closeReorderModal();
            loadInventory();
            loadDashboard();
            const lowStockPage = document.getElementById('lowStockItems');
            if (lowStockPage && lowStockPage.classList.contains('active')) {
                loadLowStockItems();
            }
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error updating reorder level', 'error');
    }
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const descEl = document.getElementById('expenseDescription');
    const catEl = document.getElementById('expenseCategory');
    const amtEl = document.getElementById('expenseAmount');
    const dateEl = document.getElementById('expenseDate');
    const notesEl = document.getElementById('expenseNotes');

    if (!descEl || !catEl || !amtEl || !dateEl) return;

    const description = descEl.value.trim();
    const category = catEl.value;
    const amount = parseFloat(amtEl.value);
    const date = dateEl.value;
    const notes = notesEl ? notesEl.value.trim() : '';

    try {
        const response = await fetch('/api/add-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, category, amount, date, notes })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Expense recorded successfully', 'success');
            e.target.reset();
            loadExpenses();
            loadExpensesSummary();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error recording expense', 'error');
    }
}

// --- CUSTOMER MANAGEMENT ---
async function loadCustomers() {
    // 1. Show cached data immediately
    try {
        const cached = await getFromIndexedDB('customers');
        if (cached && cached.length > 0) {
            renderCustomers(cached);
        }
    } catch (err) {
        console.warn('Customer cache load failed:', err);
    }

    // 2. Fetch fresh data in background
    try {
        const response = await fetch('/api/customers');
        const customers = await response.json();

        if (Array.isArray(customers)) {
            renderCustomers(customers);
            // Update cache
            await saveToIndexedDB('customers', customers);
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        if (!navigator.onLine) {
            showNotification('Offline - showing cached customers', 'info');
        }
    }
}

function renderCustomers(customers) {
    const table = document.getElementById('customersTable');
    if (!table) return;

    table.innerHTML = customers.map((c, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${c.name}</strong></td>
            <td>${c.phone || '-'}</td>
            <td>${c.email || '-'}</td>
            <td>${c.address || '-'}</td>
            <td>₦${formatCurrency(c.total_debt || 0)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="editCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})">Edit</button>
                    <button class="action-btn delete" onclick="confirmDeleteCustomer(${c.id}, '${c.name}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    if (customers.length === 0) {
        table.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No customers found</td></tr>';
    }

    // Populate customer name autocomplete for POS form
    const datalist = document.getElementById('customerSuggestions');
    if (datalist) {
        datalist.innerHTML = customers.map(c => `<option value="${c.name}">`).join('');
    }

    // Setup search
    const searchInput = document.getElementById('searchCustomers');
    if (searchInput) {
        searchInput.onkeyup = () => {
            const searchTerm = searchInput.value.toLowerCase();
            document.querySelectorAll('#customersTable tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        };
    }
}

function openCustomerModal() {
    document.getElementById('customerModalTitle').innerText = 'Add Customer';
    document.getElementById('customerId').value = '';
    document.getElementById('customerForm').reset();
    document.getElementById('customerModal').classList.add('show');
}

function closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('show');
}

function editCustomer(c) {
    document.getElementById('customerModalTitle').innerText = 'Edit Customer';
    document.getElementById('customerId').value = c.id;
    document.getElementById('customerName').value = c.name;
    document.getElementById('customerPhone').value = c.phone || '';
    document.getElementById('customerEmail').value = c.email || '';
    document.getElementById('customerAddress').value = c.address || '';
    document.getElementById('customerModal').classList.add('show');
}

async function handleCustomerSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('customerId').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    const address = document.getElementById('customerAddress').value.trim();

    const endpoint = id ? `/api/update-customer/${id}` : '/api/add-customer';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, address })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(result.message, 'success');
            closeCustomerModal();
            loadCustomers();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error saving customer:', error);
        showNotification('Error saving customer', 'error');
    }
}

async function confirmDeleteCustomer(id, name) {
    if (confirm(`Are you sure you want to delete customer "${name}"?`)) {
        try {
            const response = await fetch(`/api/delete-customer/${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                showNotification('Customer deleted', 'success');
                loadCustomers();
            } else {
                showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting customer:', error);
            showNotification('Error deleting customer', 'error');
        }
    }
}



/**
 * Custom Autocomplete Component
 * Replaces native datalists for better reliability and UX
 */

/**
 * Utility: Debounce function to limit execution frequency
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Utility: Render pagination controls
 */
function renderPagination(containerId, currentPage, totalPages, callbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="pagination" style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem;">
            <button class="action-btn" ${currentPage === 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} 
                    onclick="${callbackName}(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i> Prev
            </button>
            <span style="font-weight: 600; color: var(--text-secondary);">Page ${currentPage} of ${totalPages}</span>
            <button class="action-btn" ${currentPage === totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} 
                    onclick="${callbackName}(${currentPage + 1})">
                Next <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

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
        
        // Events (Debounced for performance)
        const debouncedInput = debounce(() => this.onInput(), 300);
        this.input.addEventListener('input', debouncedInput);
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


// ============================================================
// OFFLINE SYNC & CACHING (IndexedDB)
// ============================================================
const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 5;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Drop and recreate stores to ensure clean schema without keyPaths
            ['inventory', 'sales', 'customers', 'expenses', 'syncQueue'].forEach(store => {
                if (db.objectStoreNames.contains(store)) {
                    db.deleteObjectStore(store);
                }
            });
            
            ['inventory', 'sales', 'customers', 'expenses'].forEach(store => {
                db.createObjectStore(store);
            });
            db.createObjectStore('syncQueue', { autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToIndexedDB(storeName, data) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data, 'latest');
    } catch (err) { console.error('Cache Save Error:', err); }
}

async function getFromIndexedDB(storeName) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get('latest');
        return new Promise(resolve => {
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (err) { return []; }
}

async function addToSyncQueue(method, url, data) {
    try {
        const db = await initIndexedDB();
        const tx = db.transaction('syncQueue', 'readwrite');
        tx.objectStore('syncQueue').add({ method, url, data, timestamp: new Date().getTime() });
        updateSyncStatus('Offline - Pending Sync', 'warning');
    } catch (err) { console.error('Sync Queue Error:', err); }
}

async function syncData() {
    if (!navigator.onLine) return;
    
    try {
        const db = await initIndexedDB();
        const tx = db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const request = store.getAll();

        request.onsuccess = () => {
            const items = request.result;
            if (items.length === 0) {
                updateSyncStatus('Online', 'success');
                return;
            }

            const keysRequest = store.getAllKeys();
            keysRequest.onsuccess = async () => {
                const keys = keysRequest.result;
                updateSyncStatus(`Syncing ${items.length} items...`, 'info');

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    try {
                        const response = await fetch(item.url, {
                            method: item.method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(item.data)
                        });
                        if (response.ok) {
                            const deleteTx = db.transaction('syncQueue', 'readwrite');
                            deleteTx.objectStore('syncQueue').delete(keys[i]);
                        }
                    } catch (err) { break; }
                }
                updateSyncStatus('Sync Complete', 'success');
            };
        };
    } catch (err) { console.error('Sync Execution Error:', err); }
}

function updateSyncStatus(message, type) {
    const statusEl = document.getElementById('syncStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-badge ${type}`;
    }
}

window.addEventListener('online', syncData);
window.addEventListener('offline', () => updateSyncStatus('Offline Mode', 'offline'));

// --- NAVBAR & PROFILE INITIALIZATION ---
async function initializeNavbar() {
    try {
        // Set current date immediately
        const dateEl = document.getElementById('dateTime');
        if (dateEl) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateEl.textContent = new Date().toLocaleDateString(undefined, options);
        }

        // Load user profile
        const response = await fetch('/api/current-user');
        const data = await response.json();
        if (data.success) {
            const user = data.user;
            const userNameEl = document.getElementById('currentUser');
            const userAvatarEl = document.getElementById('userAvatar');
            
            if (userNameEl) userNameEl.textContent = user.full_name || user.username;
            if (userAvatarEl) userAvatarEl.textContent = (user.full_name || user.username || 'U').charAt(0).toUpperCase();

            // Show admin links if user is IT or Admin
            if (user.role && (user.role.toLowerCase() === 'it' || user.role.toLowerCase() === 'admin')) {
                document.querySelectorAll('.admin-only').forEach(el => {
                    if (el.tagName === 'A') el.style.display = 'flex';
                    else el.style.display = 'block';
                });
            }
        }
    } catch (err) {
        console.error('Error initializing navbar profile:', err);
    }
}

// Enhanced Mobile Responsiveness
function initializeApp() {
    console.log('--- Inventory App Initialization Started ---');
    initializeNavbar();
    syncData();

    // --- LOGOUT INITIALIZATION (Moved to top for priority) ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            confirmAction('Are you sure you want to log out?', async () => {
                try {
                    const response = await fetch('/api/logout', { method: 'POST' });
                    const data = await response.json();
                    if (data.success) window.location.href = '/login';
                    else window.location.href = '/login'; // Fallback
                } catch (error) {
                    console.error('Logout error:', error);
                    window.location.href = '/login';
                }
            }, 'Yes, Log Out', 'Cancel');
        });
    }

    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    // Mobile sidebar toggle functionality
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close sidebar when clicking outside (overlay effect)
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    const closeSidebar = () => {
        sidebar.classList.remove('active');
        document.body.style.overflow = '';
    };

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            (!mobileToggle || !mobileToggle.contains(e.target)) &&
            (!sidebarOverlay || !sidebarOverlay.contains(e.target))) {

            closeSidebar();
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
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const xDiff = touchEndX - touchStartX;
        const yDiff = touchEndY - touchStartY;
        const swipeThreshold = 50;

        // Swipe right to open sidebar (only from near edge)
        if (xDiff > swipeThreshold && Math.abs(xDiff) > Math.abs(yDiff) && 
            window.innerWidth <= 768 && touchStartX < 40) {
            sidebar.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        // Swipe left to close sidebar (only when open)
        else if (xDiff < -swipeThreshold && Math.abs(xDiff) > Math.abs(yDiff) && sidebar.classList.contains('active') && window.innerWidth <= 768) {
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

        const paymentStatusEl = document.getElementById('paymentStatus');
        const paymentMethodGroup = document.getElementById('paymentMethodGroup');
        if (paymentStatusEl && paymentMethodGroup) {
            paymentStatusEl.addEventListener('change', (e) => {
                if (e.target.value === 'Credit') {
                    paymentMethodGroup.style.display = 'none';
                } else {
                    paymentMethodGroup.style.display = 'block';
                }
            });
        }

        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', addNewSaleRow);
        }

        // --- OTHER FORM LISTENERS ---
        document.getElementById('entryForm')?.addEventListener('submit', handleEntrySubmit);
        document.getElementById('updateStatusForm')?.addEventListener('submit', handleUpdateStatusSubmit);
        document.getElementById('adjustmentForm')?.addEventListener('submit', handleAdjustmentSubmit);
        document.getElementById('reorderForm')?.addEventListener('submit', handleReorderSubmit);
        document.getElementById('quickReorderForm')?.addEventListener('submit', handleQuickReorderSubmit);
        document.getElementById('expenseForm')?.addEventListener('submit', handleExpenseSubmit);
        document.getElementById('customerForm')?.addEventListener('submit', handleCustomerSubmit);

        // --- ADMIN LISTENERS ---
        document.getElementById('addUserForm')?.addEventListener('submit', handleAddUserSubmit);
        document.getElementById('editUserForm')?.addEventListener('submit', handleEditUserSubmit);
        document.getElementById('adminResetPasswordForm')?.addEventListener('submit', handleAdminResetPasswordSubmit);

        // --- CASHIER LISTENERS ---
        document.getElementById('openShiftForm')?.addEventListener('submit', handleOpenShiftSubmit);
        document.getElementById('closeShiftForm')?.addEventListener('submit', handleCloseShiftSubmit);
        document.getElementById('matchPaymentForm')?.addEventListener('submit', handleMatchPaymentSubmit);

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

        // --- STOCK ADJUSTMENT INITIALIZATION ---
        const adjustmentForm = document.getElementById('adjustmentForm');
        if (adjustmentForm) {
            const adjustItemInput = document.getElementById('adjustItemName');
            const adjustType = document.getElementById('adjustType');
            const adjustQuantity = document.getElementById('adjustQuantity');
            const adjustReason = document.getElementById('adjustReason');
            const adjustNotesGroup = document.getElementById('adjustNotesGroup');
            const adjustCurrentStockEl = document.getElementById('adjustCurrentStock');
            const adjustNewStockEl = document.getElementById('adjustNewStock');

            let currentAdjustItemData = null;

            // Autocomplete for adjustment search
            if (adjustItemInput) {
                new Autocomplete(adjustItemInput, async () => {
                    try {
                        const response = await fetch('/api/inventory');
                        const inventory = await response.json();
                        return inventory.map(p => p.name);
                    } catch (err) { return []; }
                });

                // Track selected item to show current stock
                adjustItemInput.addEventListener('change', async () => {
                    const itemName = adjustItemInput.value.trim();
                    try {
                        const response = await fetch('/api/inventory');
                        const inventory = await response.json();
                        const product = inventory.find(p => p.name.toLowerCase() === itemName.toLowerCase());
                        
                        if (product) {
                            currentAdjustItemData = product;
                            adjustCurrentStockEl.textContent = product.quantity;
                            updateAdjustmentPreview();
                        } else {
                            currentAdjustItemData = null;
                            adjustCurrentStockEl.textContent = '-';
                            adjustNewStockEl.textContent = '-';
                        }
                    } catch (err) { console.error(err); }
                });
            }

            // Update preview on any relevant input
            if (adjustType && adjustQuantity) {
                [adjustType, adjustQuantity].forEach(el => {
                    el.addEventListener('input', updateAdjustmentPreview);
                });
            }

            function updateAdjustmentPreview() {
                if (!currentAdjustItemData) return;
                const qty = parseInt(adjustQuantity.value) || 0;
                const current = currentAdjustItemData.quantity;
                let result = current;
                
                if (adjustType.value === 'Addition') {
                    result = current + qty;
                } else {
                    result = current - qty;
                }
                
                adjustNewStockEl.textContent = result;
                adjustNewStockEl.style.color = result < 0 ? 'var(--danger)' : 'var(--accent)';
            }

            // Show/hide notes for "Other" reason
            if (adjustReason && adjustNotesGroup) {
                adjustReason.addEventListener('change', () => {
                    adjustNotesGroup.style.display = adjustReason.value === 'Other' ? 'block' : 'none';
                });
            }

            // Handle Form Submission
            adjustmentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    name: adjustItemInput.value.trim(),
                    type: adjustType.value,
                    quantity: parseInt(adjustQuantity.value),
                    reason: adjustReason.value,
                    notes: document.getElementById('adjustNotes').value
                };

                if (!data.name || isNaN(data.quantity) || data.quantity <= 0 || !data.reason) {
                    showNotification('Please fill all required fields correctly', 'error');
                    return;
                }

                try {
                    const response = await fetch('/api/adjust-stock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        showNotification(result.message, 'success');
                        adjustmentForm.reset();
                        adjustCurrentStockEl.textContent = '-';
                        adjustNewStockEl.textContent = '-';
                        adjustNewStockEl.style.color = '';
                        adjustNotesGroup.style.display = 'none';
                        currentAdjustItemData = null;
                        if (typeof refreshCurrentPageData === 'function') refreshCurrentPageData();
                    } else {
                        showNotification(result.error || 'Adjustment failed', 'error');
                    }
                } catch (err) {
                    showNotification('Connection error', 'error');
                }
            });
        }

        const filterSalesRecordsBtn = document.getElementById('filterSalesRecordsBtn');
        if (filterSalesRecordsBtn) {
            filterSalesRecordsBtn.addEventListener('click', () => loadSalesRecords());
        }

        const searchSalesBtn = document.getElementById('searchSalesBtn');
        if (searchSalesBtn) {
            searchSalesBtn.addEventListener('click', () => {
                const customer = document.getElementById('searchCustomer').value.trim();
                const date = document.getElementById('salesHistoryDate').value;
                loadSalesHistory(date, customer);
            });
        }

        const customerForm = document.getElementById('customerForm');
        if (customerForm) customerForm.addEventListener('submit', handleCustomerSubmit);

        // Close modals when clicking on overlay
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) e.target.classList.remove('show');
        });

        // Ctrl + F Shortcut
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                const activePage = document.querySelector('.page.active');
                const searchBox = activePage?.querySelector('.search-box');
                if (searchBox) {
                    e.preventDefault();
                    searchBox.focus();
                    searchBox.select();
                    searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });

        // Fetch initial data
        fetch('/api/inventory').then(r => r.json()).then(data => {
            const products = data.products || [];
            if (Array.isArray(products)) {
                window.inventoryItemNames = products.map(p => p.name);
                const itemNameInput = document.getElementById('itemName');
                const reorderItemInput = document.getElementById('reorderItem');
                if (itemNameInput) new Autocomplete(itemNameInput, async () => window.inventoryItemNames || []);
                if (reorderItemInput) new Autocomplete(reorderItemInput, async () => window.inventoryItemNames || []);
            }
        });

        // Search Inventory Listener
        const searchInventoryInput = document.getElementById('searchInventory');
        const debouncedLoadInventory = debounce(() => loadInventory(), 100);
        if (searchInventoryInput) {
            searchInventoryInput.addEventListener('input', (e) => {
                inventoryFilter.search = e.target.value;
                inventoryFilter.page = 1;
                debouncedLoadInventory();
            });
        }

        // --- ADMIN LISTENERS ---
        const debouncedUserSearch = debounce(() => {
            const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
            document.querySelectorAll('#usersTable tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        }, 300);

        document.getElementById('searchUsers')?.addEventListener('keyup', debouncedUserSearch);

        document.getElementById('addUserForm')?.addEventListener('submit', handleAddUserSubmit);
        document.getElementById('editUserForm')?.addEventListener('submit', handleEditUserSubmit);
        document.getElementById('adminResetPasswordForm')?.addEventListener('submit', handleAdminResetPasswordSubmit);

        // --- CASHIER LISTENERS ---
        document.getElementById('openShiftForm')?.addEventListener('submit', handleOpenShiftSubmit);
        document.getElementById('closeShiftForm')?.addEventListener('submit', handleCloseShiftSubmit);
        document.getElementById('matchPaymentForm')?.addEventListener('submit', handleMatchPaymentSubmit);



    } catch (err) {
        console.error('Error during forms initialization:', err);
    }
}

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

// Reorder level update (Inventory Page)
async function handleReorderSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('reorderItem').value.trim();
    const level = parseInt(document.getElementById('reorderLevel').value);

    if (!name || isNaN(level)) {
        showNotification('Please fill in all fields', 'error');
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
            event.target.reset();
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Error updating reorder level', 'error');
    }
}

async function handleEntrySubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    const data = {
        name: document.getElementById('itemName').value.trim(),
        brand: document.getElementById('itemBrand').value.trim(),
        quantity: parseInt(document.getElementById('quantity').value),
        cost_price: parseFloat(document.getElementById('costPrice').value) || 0,
        selling_price: parseFloat(document.getElementById('sellingPrice').value) || 0,
        type: document.getElementById('entryType').value
    };

    if (!data.name || isNaN(data.quantity)) {
        showNotification('Item name and quantity are required', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const response = await fetch('/api/add-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
            showNotification('Entry recorded successfully', 'success');
            e.target.reset();
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error || 'Failed to record entry', 'error');
        }
    } catch (error) {
        showNotification('Connection error', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
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

    document.getElementById('dashboardDateFilter')?.addEventListener('change', () => {
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
    if (pageName === 'cashier') {
        loadCashierPage();
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
    if (pageName === 'invoice') {
        loadInvoices();
    }
}
// ============================================================
// CORE UTILITIES
// ============================================================

function formatCurrency(amount) {
    if (amount === undefined || amount === null) return '0.00';
    return parseFloat(amount).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showNotification(message, type = 'info') {
    const container = document.body;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    notification.innerHTML = `
        <i class="fas ${icon}"></i>
        <div class="notification-content">${message}</div>
    `;
    
    container.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-remove
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

function showAlertModal(message, type = 'info', title = 'Notification') {
    const modal = document.getElementById('alertModal');
    if (!modal) return;
    
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    
    // Update icon/style based on type
    const header = modal.querySelector('.modal-header');
    header.style.borderBottomColor = type === 'error' ? 'var(--danger)' : 'var(--primary)';
    
    modal.classList.add('show');
}

function closeAlertModal() {
    document.getElementById('alertModal').classList.remove('show');
}

// ============================================================
// DASHBOARD & INVENTORY DATA LOADING
// ============================================================

async function loadDashboard() {
    const dateFilter = document.getElementById('dashboardDateFilter')?.value || '';
    try {
        const response = await fetch(`/api/dashboard-combined?date=${dateFilter}`);
        const data = await response.json();

        if (data.success) {
            // Update stats cards
            const stats = data.sales_summary || {};
            if (document.getElementById('todaysSales')) document.getElementById('todaysSales').textContent = stats.total_sales || 0;
            if (document.getElementById('totalRevenue')) document.getElementById('totalRevenue').textContent = '₦' + formatCurrency(stats.total_revenue);
            if (document.getElementById('totalExpenses')) document.getElementById('totalExpenses').textContent = '₦' + formatCurrency(data.metrics?.total_expenses || 0);
            if (document.getElementById('totalCredit')) document.getElementById('totalCredit').textContent = '₦' + formatCurrency(stats.credit_amount);
            if (document.getElementById('totalPending')) document.getElementById('totalPending').textContent = '₦' + formatCurrency(stats.pending_amount);
            if (document.getElementById('realizedPayment')) document.getElementById('realizedPayment').textContent = '₦' + formatCurrency(stats.paid_amount);

            // Update inventory counts
            const invStats = data.inventory_stats || {};
            if (document.getElementById('totalItems')) document.getElementById('totalItems').textContent = invStats.total_items || 0;
            if (document.getElementById('lowStock')) document.getElementById('lowStock').textContent = invStats.low_stock_count || 0;
            if (document.getElementById('healthyStock')) document.getElementById('healthyStock').textContent = (invStats.total_items || 0) - (invStats.low_stock_count || 0);
            if (document.getElementById('totalUnits')) document.getElementById('totalUnits').textContent = invStats.total_units || 0;

            // Populate Tables
            renderLowStockTable(data.low_stock_products || []);
            renderRecentTransactions(data.transactions || []);
            
            // Also load sales history for the dashboard recent sales table if it exists
            if (typeof loadSalesHistory === 'function') loadSalesHistory();
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function renderLowStockTable(products) {
    const table = document.getElementById('lowStockTable');
    if (!table) return;
    
    table.innerHTML = products.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${p.name}</td>
            <td>${p.quantity}</td>
            <td>${p.reorder_level}</td>
            <td><span class="status-badge critical">Low Stock</span></td>
        </tr>
    `).join('');
    
    if (products.length === 0) {
        table.innerHTML = '<tr><td colspan="5" style="text-align:center;">No low stock items</td></tr>';
    }
}

function renderRecentTransactions(transactions) {
    const table = document.getElementById('recentTransactions');
    if (!table) return;
    
    table.innerHTML = transactions.map((t, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${t.item_name}</td>
            <td>${t.quantity}</td>
            <td><span class="status-badge ${t.type === 'Addition' ? 'healthy' : 'warning'}">${t.type}</span></td>
            <td>${t.time}</td>
            <td>${t.user_id}</td>
        </tr>
    `).join('');
    
    if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="6" style="text-align:center;">No recent transactions</td></tr>';
    }
}

let currentSalesPage = 1;

// Global Filter States
let inventoryFilter = {
    page: 1,
    lowStockOnly: false,
    search: ''
};
let inventoryAbortController = null;

async function loadInventory(page = inventoryFilter.page) {
    if (inventoryAbortController) inventoryAbortController.abort();
    inventoryAbortController = new AbortController();
    const signal = inventoryAbortController.signal;
    inventoryFilter.page = page;
    const { lowStockOnly, search } = inventoryFilter;
    
    try {
        const url = `/api/inventory?page=${page}&per_page=50&low_stock=${lowStockOnly}&search=${encodeURIComponent(search)}`;
        const response = await fetch(url, { signal });
        const data = await response.json();
        
        const products = data.products || [];
        const table = document.getElementById('inventoryTable');
        if (!table) return;

        table.innerHTML = products.map((p, i) => {
            const isLow = p.quantity <= p.reorder_level;
            return `
                <tr class="${isLow ? 'low-stock-row' : ''}">
                    <td>${(inventoryFilter.page - 1) * 50 + i + 1}</td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.brand || '-'}</td>
                    <td>${p.quantity}</td>
                    <td>₦${formatCurrency(p.cost_price)}</td>
                    <td>₦${formatCurrency(p.selling_price)}</td>
                    <td>${p.reorder_level}</td>
                    <td><span class="status-badge ${isLow ? 'critical' : 'healthy'}">${isLow ? 'Low Stock' : 'Healthy'}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="openEditModal('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.brand?.replace(/'/g, "\\'") || ""}', ${p.cost_price}, ${p.selling_price}, ${p.reorder_level})">Edit</button>
                            <button class="action-btn delete" onclick="confirmDelete(${p.id}, 'product', '${p.name.replace(/'/g, "\\'")}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (products.length === 0) {
            table.innerHTML = '<tr><td colspan="9" style="text-align:center;">No items matching filters</td></tr>';
        }

        renderPagination('inventoryPagination', data.page, data.total_pages, 'loadInventory');
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error loading inventory:', error);
    }
}

function toggleLowStockFilter() {
    // Synchronize search state immediately to avoid conflicts
    const searchInput = document.getElementById('searchInventory');
    if (searchInput) inventoryFilter.search = searchInput.value;

    inventoryFilter.lowStockOnly = !inventoryFilter.lowStockOnly;
    inventoryFilter.page = 1;
    
    const btn = document.querySelector('button[onclick="toggleLowStockFilter()"]');
    const text = document.getElementById('lowStockFilterText');
    
    if (inventoryFilter.lowStockOnly) {
        btn.classList.add('active-filter');
        if (text) text.textContent = 'Showing Low Stock';
    } else {
        btn.classList.remove('active-filter');
        if (text) text.textContent = 'Show Only Low Stock';
    }
    
    loadInventory();
}

async function loadTransactions() {
    const table = document.getElementById('stockLogTable');
    if (!table) return;

    try {
        const response = await fetch('/api/transactions');
        const transactions = await response.json();

        table.innerHTML = transactions.map((t, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${t.date}</td>
                <td>${t.time}</td>
                <td><strong>${t.item_name}</strong></td>
                <td>${t.quantity}</td>
                <td><span class="status-badge ${t.type === 'Intake' || t.type === 'Addition' ? 'healthy' : 'warning'}">${t.type}</span></td>
                <td>${t.performed_by || '-'}</td>
                <td>
                    <button class="action-btn delete" onclick="confirmDelete(${t.id}, 'transaction', '${t.item_name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        if (transactions.length === 0) {
            table.innerHTML = '<tr><td colspan="8" style="text-align:center;">No transactions logged</td></tr>';
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function openEditModal(id, name, brand, cost, selling, reorder) {
    document.getElementById('editProductId').value = id;
    document.getElementById('editItemName').value = name;
    document.getElementById('editItemBrand').value = brand;
    document.getElementById('editCostPrice').value = cost;
    document.getElementById('editSellingPrice').value = selling;
    document.getElementById('editReorderLevel').value = reorder;
    document.getElementById('editInventoryModal').classList.add('show');
}

async function loadLowStockItems() {
    const table = document.getElementById('fullLowStockTable');
    if (!table) return;

    try {
        // Fetch all inventory items (we might want a specific low-stock endpoint later for performance)
        const response = await fetch('/api/inventory?per_page=1000');
        const data = await response.json();
        const products = data.products || [];
        const lowStock = products.filter(p => p.quantity <= p.reorder_level);

        table.innerHTML = lowStock.map((p, i) => {
            const deficit = Math.max(0, p.reorder_level - p.quantity);
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.brand || '-'}</td>
                    <td><span style="color: var(--danger); font-weight: 700;">${p.quantity}</span></td>
                    <td>₦${formatCurrency(p.cost_price)}</td>
                    <td>₦${formatCurrency(p.selling_price)}</td>
                    <td>${p.reorder_level}</td>
                    <td><span class="status-badge critical">${deficit}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="openEditModal('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.brand?.replace(/'/g, "\\'") || ""}', ${p.cost_price}, ${p.selling_price}, ${p.reorder_level})">Manage</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (lowStock.length === 0) {
            table.innerHTML = '<tr><td colspan="9" style="text-align:center;">All items are at healthy stock levels</td></tr>';
        }
    } catch (error) {
        console.error('Error loading low stock items:', error);
    }
}




// ============================================================
// INVOICE MANAGEMENT
// ============================================================
let allInvoicesData = [];

async function loadInvoices() {
    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await fetch('/api/sales');
        const sales = await res.json();
        allInvoicesData = Array.isArray(sales) ? sales : [];

        renderInvoiceTable(allInvoicesData);
        updateInvoiceSummary(allInvoicesData);

        // Wire up filters
        const statusFilter = document.getElementById('invoiceStatusFilter');
        const searchInput = document.getElementById('invoiceSearch');

        if (statusFilter) {
            statusFilter.onchange = filterInvoices;
        }
        if (searchInput) {
            searchInput.oninput = debounce(filterInvoices, 300);
        }
    } catch (err) {
        console.error('Error loading invoices:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error loading invoices</td></tr>';
    }
}

function filterInvoices() {
    const status = document.getElementById('invoiceStatusFilter').value;
    const query = (document.getElementById('invoiceSearch').value || '').toLowerCase();

    const filtered = allInvoicesData.filter(sale => {
        const matchStatus = status === 'All' || (sale.payment_status || '').toLowerCase() === status.toLowerCase();
        const matchSearch = !query ||
            (sale.sale_num || '').toLowerCase().includes(query) ||
            (sale.customer || '').toLowerCase().includes(query);
        return matchStatus && matchSearch;
    });

    renderInvoiceTable(filtered);
}

function renderInvoiceTable(sales) {
    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) return;

    if (!sales.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No invoices found</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(sale => {
        const status = sale.payment_status || 'Paid';
        const statusClass = 'status-' + status.toLowerCase();
        return `
            <tr>
                <td>${sale.date || '-'}</td>
                <td><strong style="color: var(--primary);">${sale.sale_num || '-'}</strong></td>
                <td>${sale.customer || 'Walk-in'}</td>
                <td><span class="payment-status-badge ${statusClass}" style="border-radius: 999px; padding: 4px 12px; font-size: 0.75rem; font-weight: 600;">${status}</span></td>
                <td><strong>₦${formatCurrency(sale.total_amount || 0)}</strong></td>
                <td>${sale.performed_by || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="printInvoice('${sale.sale_num}')">
                            <i class="fas fa-print"></i> Print
                        </button>
                        <button class="action-btn" onclick="viewSaleDetails('${sale.sale_num}')" style="background: rgba(79,70,229,0.1); color: var(--primary);">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateInvoiceSummary(sales) {
    const today = new Date().toISOString().split('T')[0];
    let totalReceivables = 0;
    let pendingTotal = 0;
    let paidToday = 0;

    sales.forEach(sale => {
        const amount = sale.total_amount || 0;
        const status = (sale.payment_status || '').toLowerCase();

        if (status !== 'paid') {
            totalReceivables += amount;
        }
        if (status === 'pending' || status === 'credit') {
            pendingTotal += amount;
        }
        if (status === 'paid' && sale.date === today) {
            paidToday += amount;
        }
    });

    const totalEl = document.getElementById('totalReceivables');
    const pendingEl = document.getElementById('pendingInvoicesTotal');
    const paidEl = document.getElementById('paidTodayTotal');

    if (totalEl) totalEl.textContent = '₦' + formatCurrency(totalReceivables);
    if (pendingEl) pendingEl.textContent = '₦' + formatCurrency(pendingTotal);
    if (paidEl) paidEl.textContent = '₦' + formatCurrency(paidToday);
}

async function printInvoice(saleNum) {
    try {
        const res = await fetch(`/api/sale-details/${saleNum}`);
        const data = await res.json();

        if (!data.success) {
            showNotification('Could not load invoice details', 'error');
            return;
        }

        const sale = data.sale;
        const items = data.items || [];
        const today = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

        const itemRows = items.map(item => `
            <tr>
                <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0;">${item.item_name}</td>
                <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: right;">₦${formatCurrency(item.price)}</td>
                <td style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 600;">₦${formatCurrency(item.total)}</td>
            </tr>
        `).join('');

        const statusColor = {
            'Paid': '#065f46', 'Credit': '#1e40af', 'Pending': '#92400e', 'Partial': '#991b1b'
        }[sale.payment_status] || '#374151';

        const statusBg = {
            'Paid': '#d1fae5', 'Credit': '#dbeafe', 'Pending': '#fef3c7', 'Partial': '#fee2e2'
        }[sale.payment_status] || '#f3f4f6';

        const invoiceHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice ${saleNum}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #f9fafb; }
        .invoice-wrapper { max-width: 800px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
        .invoice-header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 40px 48px; display: flex; justify-content: space-between; align-items: flex-start; }
        .company-name { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.03em; }
        .company-sub { font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-top: 4px; }
        .invoice-title { text-align: right; }
        .invoice-title h1 { font-size: 2rem; font-weight: 300; letter-spacing: 0.1em; color: rgba(255,255,255,0.9); }
        .invoice-num { font-size: 0.9rem; color: #818cf8; margin-top: 6px; font-weight: 600; }
        .invoice-body { padding: 40px 48px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem; }
        .meta-label { font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
        .meta-value { font-size: 1rem; font-weight: 600; color: #111827; }
        .meta-value.large { font-size: 1.2rem; }
        .status-badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; background: ${statusBg}; color: ${statusColor}; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
        thead th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
        thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; } 
        thead th:nth-child(2) { text-align: center; }
        .totals { display: flex; justify-content: flex-end; }
        .totals-box { width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 0.9rem; color: #4b5563; }
        .total-row.grand { font-size: 1.2rem; font-weight: 800; color: #111827; border-bottom: none; border-top: 2px solid #111827; padding-top: 12px; margin-top: 4px; }
        .footer { background: #f8fafc; padding: 24px 48px; text-align: center; font-size: 0.85rem; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        @media print { body { background: white; } .invoice-wrapper { box-shadow: none; margin: 0; border-radius: 0; } }
    </style>
</head>
<body>
<div class="invoice-wrapper">
    <div class="invoice-header">
        <div>
            <div class="company-name">Inventory Pro</div>
            <div class="company-sub">Official Invoice</div>
        </div>
        <div class="invoice-title">
            <h1>INVOICE</h1>
            <div class="invoice-num">${sale.sale_num}</div>
        </div>
    </div>
    <div class="invoice-body">
        <div class="meta-grid">
            <div>
                <div class="meta-label">Bill To</div>
                <div class="meta-value large">${sale.customer || 'Walk-in Customer'}</div>
            </div>
            <div style="text-align: right;">
                <div class="meta-label">Invoice Date</div>
                <div class="meta-value">${sale.date} ${sale.time || ''}</div>
            </div>
            <div>
                <div class="meta-label">Payment Status</div>
                <div class="meta-value"><span class="status-badge">${sale.payment_status || 'Paid'}</span></div>
            </div>
            <div style="text-align: right;">
                <div class="meta-label">Served By</div>
                <div class="meta-value">${sale.performed_by || '-'}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemRows}
            </tbody>
        </table>

        <div class="totals">
            <div class="totals-box">
                <div class="total-row grand">
                    <span>TOTAL</span>
                    <span>₦${formatCurrency(sale.total_amount || 0)}</span>
                </div>
            </div>
        </div>
    </div>
    <div class="footer">
        Thank you for your business! &mdash; Generated on ${today}
    </div>
</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank');
        win.document.write(invoiceHTML);
        win.document.close();
    } catch (err) {
        showNotification('Failed to generate invoice', 'error');
        console.error('printInvoice error:', err);
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            const currentUserId = data.current_user_id;
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
                tbody.innerHTML = data.logs.map((log, index) => `
                    <tr onclick="showActivityDetails('${log.username}', '${log.action}', '${log.details.replace(/'/g, "\\'")}', '${log.timestamp}')" style="cursor: pointer;">
                        <td>${index + 1}</td>
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


// Add User Modal
const addUserModal = document.getElementById('addUserModal');
function openAddUserModal() {
    addUserModal.classList.add('show');
}
function closeAddUserModal() {
    addUserModal.classList.remove('show');
    document.getElementById('addUserForm').reset();
}

async function handleAddUserSubmit(e) {
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
}

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

async function handleEditUserSubmit(e) {
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
}

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

async function handleAdminResetPasswordSubmit(e) {
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
}

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
function confirmAction(message, callback, confirmLabel = 'Yes, Delete', cancelLabel = 'No, Keep it') {
    confirmCallback = callback;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmBtn').textContent = confirmLabel;
    document.getElementById('cancelBtn').textContent = cancelLabel;
    document.getElementById('confirmModal').classList.add('show');
}

// Handle global confirmation
document.getElementById('confirmBtn').addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
        document.getElementById('confirmModal').classList.remove('show');
        // Reset button labels to defaults
        document.getElementById('confirmBtn').textContent = 'Yes, Delete';
        document.getElementById('cancelBtn').textContent = 'No, Keep it';
    }
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    const confirmModalEl = document.getElementById('confirmModal');
    if (confirmModalEl) confirmModalEl.classList.remove('show');
    confirmCallback = null;
    // Reset button labels to defaults
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    if (confirmBtn) confirmBtn.textContent = 'Yes, Delete';
    if (cancelBtn) cancelBtn.textContent = 'No, Keep it';
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
    const paymentMethodEl = document.getElementById('paymentMethod');
    const paymentMethod = (paymentStatus === 'Credit') ? 'N/A' : (paymentMethodEl ? paymentMethodEl.value : 'Cash');

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
            body: JSON.stringify({ customer, items, payment_status: paymentStatus, payment_method: paymentMethod })
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
            await addToSyncQueue('POST', '/api/create-sale', { customer, items, payment_status: paymentStatus, payment_method: paymentMethod });
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


currentSalesPage = 1;
async function loadSalesHistory(dateFilter = '', customerFilter = '', page = 1) {
    currentSalesPage = page;
    try {
        let url = `/api/sales?date=${dateFilter || ''}&customer=${customerFilter || ''}&page=${page}&per_page=50`;

        const response = await fetch(url);
        const data = await response.json();
        const sales = data.sales || [];

        // Cache sales data
        await saveToIndexedDB('sales', sales);

        const table = document.getElementById('salesTable');
        const recentTable = document.getElementById('recentSalesTable');

        const rowsHTML = sales.map((sale, index) => {
            const status = sale.payment_status || 'Paid';
            const statusColor = status.toLowerCase();
            return `
                <tr>
                    <td>${(currentSalesPage - 1) * 50 + index + 1}</td>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer || 'Unknown'}</td>
                    <td>${sale.date}</td>
                    <td>₦${formatCurrency(sale.total_amount || 0)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${status}
                        </span>
                    </td>
                    <td>${sale.performed_by || '-'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                            ${status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            ${status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (table) {
            table.innerHTML = rowsHTML || '<tr><td colspan="8" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
        }

        if (recentTable) {
            // Show last 8 sales in condensed view
            const recentSales = sales.slice(0, 8);
            recentTable.innerHTML = recentSales.map((sale, index) => {
                const status = sale.payment_status || 'Paid';
                const statusColor = status.toLowerCase();
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${sale.sale_num}</strong></td>
                        <td>${sale.customer || 'Unknown'}</td>
                        <td>${sale.date}</td>
                        <td>₦${formatCurrency(sale.total_amount || 0)}</td>
                        <td><span class="payment-status-badge ${statusColor}">${status}</span></td>
                        <td>${sale.performed_by || '-'}</td>
                    </tr>
                `;
            }).join('') || '<tr><td colspan="7" style="text-align:center;">No recent sales</td></tr>';
        }

        renderPagination('salesPagination', data.page, data.total_pages, 'loadSalesHistoryWrapper');
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

/**
 * Pagination Wrapper for Sales History
 */
function loadSalesHistoryWrapper(page) {
    const date = document.getElementById('salesHistoryDate')?.value || '';
    const customer = document.getElementById('searchCustomer')?.value.trim() || '';
    loadSalesHistory(date, customer, page);
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
        const salesData = await response.json();
        const sales = Array.isArray(salesData) ? salesData : [];

        const table = document.getElementById('salesRecordsTable');
        if (!table) return;

        table.innerHTML = sales.map((sale, index) => {
            const status = sale.payment_status || 'Paid';
            const statusColor = status.toLowerCase();
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${sale.sale_num}</strong></td>
                    <td>${sale.customer || 'Unknown'}</td>
                    <td>${sale.date}</td>
                    <td>₦${formatCurrency(sale.total_amount || 0)}</td>
                    <td>
                        <span class="payment-status-badge ${statusColor}">
                            ${status}
                        </span>
                    </td>
                    <td>${sale.performed_by || '-'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="viewSaleDetails('${sale.sale_num}')">View</button>
                            ${status === 'Credit' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            ${status === 'Pending' ? `<button class="action-btn success" onclick="quickUpdateStatus('${sale.sale_num}', 'Paid')">Mark Paid</button>` : ''}
                            <button class="action-btn delete" onclick="confirmDeleteSale('${sale.sale_num}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (sales.length === 0) {
            table.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-secondary);">No sales recorded</td></tr>';
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



// Redundant listener removed - already handled in initializeEventListeners

// --- MODAL & FORM HANDLERS ---
// All handlers consolidated at the top of the file to prevent duplicates

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
        searchInput.onkeyup = debounce(() => {
            const searchTerm = searchInput.value.toLowerCase();
            document.querySelectorAll('#customersTable tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        }, 300);
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

// --- CASHIER & FINANCE MODULE ---
async function loadCashierPage() {
    await loadCashierStatus();
    await loadPaymentsLedger();
}

function openShiftModal() {
    document.getElementById('openShiftModal').classList.add('show');
}

function closeShiftModal() {
    document.getElementById('closeShiftModal').classList.add('show');
}

async function loadCashierStatus() {
    try {
        const response = await fetch('/api/cashier/status');
        const data = await response.json();
        
        const openBtn = document.getElementById('openShiftBtn');
        const closeBtn = document.getElementById('closeShiftBtn');
        const stateEl = document.getElementById('shiftState');
        const cashierEl = document.getElementById('shiftCashier');
        const openingEl = document.getElementById('shiftOpening');
        const expectedEl = document.getElementById('expectedClosingBalance');
        
        if (data.has_open_shift && data.shift) {
            openBtn.style.display = 'none';
            closeBtn.style.display = 'inline-block';
            stateEl.textContent = 'Open';
            stateEl.style.color = 'var(--success-color)';
            cashierEl.textContent = data.shift.username;
            openingEl.textContent = `₦${formatNumber(data.shift.opening_balance)}`;
            
            if (expectedEl) expectedEl.value = data.shift.opening_balance;
        } else {
            openBtn.style.display = 'inline-block';
            closeBtn.style.display = 'none';
            stateEl.textContent = 'Closed';
            stateEl.style.color = 'var(--danger-color)';
            cashierEl.textContent = '-';
            openingEl.textContent = '₦0.00';
            if (expectedEl) expectedEl.value = '0.00';
        }
    } catch (error) {
        console.error("Error loading cashier status:", error);
    }
}

async function loadPaymentsLedger() {
    try {
        const response = await fetch('/api/payments');
        const payments = await response.json();
        
        const tbody = document.getElementById('paymentLedgerTable');
        if (!tbody) return;
        
        if (payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No payment records found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = payments.map(p => {
            const isPending = p.customer === 'Pending Match';
            const actionBtn = isPending ? 
                `<button class="btn btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="openMatchPaymentModal(${p.id})">Match</button>` : 
                `<span style="color: var(--success-color);"><i class="fas fa-check"></i> Matched</span>`;
                
            return `
            <tr>
                <td><strong>${p.sale_num || 'N/A'}</strong><br><small style="color: #64748b;">Ref: ${p.reference || 'N/A'}</small></td>
                <td>${p.customer || 'Walk-in'}</td>
                <td style="font-weight: 600; color: var(--success-color);">₦${formatNumber(p.amount)}</td>
                <td><span class="status-badge" style="background: ${getPaymentMethodColor(p.payment_method)}">${p.payment_method}</span></td>
                <td>${p.date} <small style="color:#64748b">${p.time}</small></td>
                <td>${p.performed_by || '-'}</td>
                <td>${actionBtn}</td>
            </tr>
            `;
        }).join('');
    } catch (error) {
        console.error("Error loading payments:", error);
    }
}

function getPaymentMethodColor(method) {
    if (method === 'Cash') return '#dcfce7; color: #166534';
    if (method === 'Transfer' || method === 'Moniepoint Transfer') return '#dbeafe; color: #1e40af';
    if (method === 'POS' || method === 'Moniepoint POS') return '#fef3c7; color: #92400e';
    return '#f1f5f9; color: #475569';
}

async function handleOpenShiftSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening...';
    
    const opening_balance = document.getElementById('openingBalance').value;
    
    try {
        const response = await fetch('/api/cashier/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opening_balance })
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('Shift opened successfully', 'success');
            document.getElementById('openShiftModal').classList.remove('show');
            loadCashierStatus();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to open shift', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function handleCloseShiftSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Closing...';
    
    const actual_closing_balance = document.getElementById('actualClosingBalance').value;
    
    try {
        const response = await fetch('/api/cashier/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actual_closing_balance })
        });
        const result = await response.json();
        
        if (result.success) {
            const difference = result.actual - result.expected;
            if (difference === 0) {
                showNotification('Shift closed perfectly balanced!', 'success');
            } else if (difference > 0) {
                showNotification(`Shift closed. Overage: ₦${formatNumber(difference)}`, 'warning');
            } else {
                showNotification(`Shift closed. Shortage: ₦${formatNumber(Math.abs(difference))}`, 'error');
            }
            document.getElementById('closeShiftModal').classList.remove('show');
            loadCashierStatus();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to close shift', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

function openMatchPaymentModal(paymentId) {
    document.getElementById('matchPaymentId').value = paymentId;
    document.getElementById('matchSaleCustomer').value = '';
    document.getElementById('matchPaymentModal').classList.add('show');
}

async function handleMatchPaymentSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';
    
    const paymentId = document.getElementById('matchPaymentId').value;
    const matchTarget = document.getElementById('matchSaleCustomer').value.trim();
    
    try {
        const response = await fetch('/api/cashier/match-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_id: paymentId, match_target: matchTarget })
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('Payment successfully matched!', 'success');
            document.getElementById('matchPaymentModal').classList.remove('show');
            loadPaymentsLedger();
            loadSalesRecords();
        } else {
            showNotification(result.error || 'Failed to match payment', 'error');
        }
    } catch (error) {
        showNotification('Error linking payment', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}


// --- LIVE UPDATES ENGINE ---
function refreshCurrentPageData() {
    if (document.hidden) return;
    
    const activePage = localStorage.getItem('activePage') || 'dashboard';
    const isModalOpen = document.querySelector('.modal.show') !== null;
    
    switch(activePage) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'inventory':
            if (!isModalOpen) loadInventory();
            break;
        case 'sales':
            loadSalesRecords();
            break;
        case 'cashier':
            if (!isModalOpen) {
                loadCashierStatus();
                loadPaymentsLedger();
            }
            break;
        case 'sales_history':
            if (!isModalOpen) loadSalesHistory();
            break;
        case 'expenses':
            if (!isModalOpen) {
                loadExpenses();
                loadExpensesSummary();
            }
            break;
        case 'customers':
            if (!isModalOpen) loadCustomers();
            break;
        case 'lowStockItems':
            loadLowStockItems();
            break;
    }
}

setInterval(refreshCurrentPageData, 10000);

async function handleQuickReorderSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('quickReorderItem').value;
    const level = parseInt(document.getElementById('quickReorderLevel').value);
    const cost = parseFloat(document.getElementById('quickCostPrice').value);
    const selling = parseFloat(document.getElementById('quickSellingPrice').value);

    if (!name || isNaN(level)) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/update-reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level, cost_price: cost, selling_price: selling })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Item details updated', 'success');
            document.getElementById('reorderModal').classList.remove('show');
            loadInventory();
            loadDashboard();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Error updating item', 'error');
    }
}

async function handleAdjustmentSubmit(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('adjustItemName').value.trim(),
        type: document.getElementById('adjustType').value,
        quantity: parseInt(document.getElementById('adjustQuantity').value),
        reason: document.getElementById('adjustReason').value,
        notes: document.getElementById('adjustNotes').value
    };

    if (!data.name || isNaN(data.quantity)) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/adjust-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Stock adjusted successfully', 'success');
            e.target.reset();
            document.getElementById('adjustCurrentStock').textContent = '-';
            document.getElementById('adjustNewStock').textContent = '-';
            loadInventory();
            loadDashboard();
            loadTransactions();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Error adjusting stock', 'error');
    }
}

function openReorderModal(name, level, cost, selling) {
    document.getElementById('quickReorderItem').value = name;
    document.getElementById('quickUpdateItemDisplay').textContent = name;
    document.getElementById('quickReorderLevel').value = level;
    document.getElementById('quickCostPrice').value = cost;
    document.getElementById('quickSellingPrice').value = selling;
    document.getElementById('reorderModal').classList.add('show');
}

function closeReorderModal() {
    document.getElementById('reorderModal').classList.remove('show');
}

// Safer initialization check
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}


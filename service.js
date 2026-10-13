
        // ============================================================
        //  TECH_BY_PRINCE SYSTEMS - COMPLETE INTEGRATED SYSTEM
        // ============================================================

        // ---------- GLOBALS ----------
        let cart = [];
        let currentCategory = 'All';
        let selectedPayment = 'Cash';
        let dashTrendChart = null;
        let dashTopChart = null;
        let lockedNavs = [];
        let securityLocked = false;
        let lockTimer = null;
        let lastActivity = Date.now();
        let pendingLockOverlay = null;   // page waiting for PIN after a lock notification
        let currentUser = null;
        let auditLog = [];
        let systemConfig = {};
        let lockedNavItems = new Set();

        // ---------- CONSTANTS ----------
        const STORAGE_KEYS = {
            PRODUCTS: 'tb_products',
            SALES: 'tb_sales',
            CUSTOMERS: 'tb_customers',
            EXPENSES: 'tb_expenses',
            REVOKED: 'tb_revoked',
            AUDIT: 'tb_audit',
            USERS: 'tb_users',
            CONFIG: 'tb_config',
            LOCKED_NAVS: 'tb_locked_navs',
            SECURITY: 'tb_security',
            CATEGORIES: 'tb_categories'
        };
/*
        // ---------- LOCAL STORAGE HELPERS ----------
        function getData(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }

        function setData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

        function getObject(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }

        function setObject(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

        function getProducts() { return getData(STORAGE_KEYS.PRODUCTS); }

        function saveProducts(p) { setData(STORAGE_KEYS.PRODUCTS, p); }

        function getSales() { return getData(STORAGE_KEYS.SALES); }

        function saveSales(s) { setData(STORAGE_KEYS.SALES, s); }

        function getCustomers() { return getData(STORAGE_KEYS.CUSTOMERS); }

        function saveCustomers(c) { setData(STORAGE_KEYS.CUSTOMERS, c); }

        function getExpenses() { return getData(STORAGE_KEYS.EXPENSES); }

        function saveExpenses(e) { setData(STORAGE_KEYS.EXPENSES, e); }

        function getRevoked() { return getData(STORAGE_KEYS.REVOKED); }

        function saveRevoked(r) { setData(STORAGE_KEYS.REVOKED, r); }

        function getAudit() { return getData(STORAGE_KEYS.AUDIT); }

        function saveAudit(a) { setData(STORAGE_KEYS.AUDIT, a); }

        function getUsers() { return getData(STORAGE_KEYS.USERS); }

        function saveUsers(u) { setData(STORAGE_KEYS.USERS, u); }

        function getConfig() { return getObject(STORAGE_KEYS.CONFIG); }

        function setConfig(c) { setObject(STORAGE_KEYS.CONFIG, c); }

        function getLockedNavs() { return getData(STORAGE_KEYS.LOCKED_NAVS); }

        function setLockedNavs(l) { setData(STORAGE_KEYS.LOCKED_NAVS, l); }

        function getSecurity() { return getObject(STORAGE_KEYS.SECURITY); }

        function setSecurity(patch) {
    const current = getObject(STORAGE_KEYS.SECURITY) || {};
    const merged = { ...current, ...patch };
    setObject(STORAGE_KEYS.SECURITY, merged);
    return merged;
}

        function getCategories() { return getData(STORAGE_KEYS.CATEGORIES); }

        function saveCategories(c) { setData(STORAGE_KEYS.CATEGORIES, c); }
*/
// ---------- IN-MEMORY CACHE (backed by IndexedDB) ----------
let _cache = {
  products: [],
  sales: [],
  customers: [],
  expenses: [],
  revoked: [],
  audit: [],
  users: [],
  categories: [],
  config: {},
  security: {},
  lockedNavs: [],
  expenseTypes: []
};

let _ready = false;

// Load everything from IndexedDB into memory at startup
async function loadCacheFromDB() {
  await migrateFromLocalStorage();  // first-run only

  const safe = async (fn, fallback) => {
    try { return await fn(); } catch (e) { console.warn(e); return fallback; }
  };

  _cache.products    = await safe(() => db.products.toArray(), []);
  _cache.sales       = await safe(() => db.sales.toArray(), []);
  _cache.customers   = await safe(() => db.customers.toArray(), []);
  _cache.expenses    = await safe(() => db.expenses.toArray(), []);
  _cache.revoked     = await safe(() => db.revoked.toArray(), []);
  _cache.audit       = await safe(() => db.audit.toArray(), []);
  _cache.users       = await safe(() => db.users.toArray(), []);
  /*
  _cache.categories  = await safe(() => db.categories.toArray(), []);
*/
const catRows = await safe(() => db.categories.toArray(), []);
_cache.categories = catRows.map(r => r.name || r);
  const cfgRow = await safe(() => db.config.get('singleton'), null);
  _cache.config = cfgRow ? cfgRow.value : {};

  const secRow = await safe(() => db.security.get('singleton'), null);
  _cache.security = secRow ? secRow.value : {};

  const lockRow = await safe(() => db.lockedNavs.get('singleton'), null);
  _cache.lockedNavs = lockRow ? lockRow.value : [];

  const expRow = await safe(() => db.config.get('ls_expense_types'), null);
  _cache.expenseTypes = expRow ? expRow.value : [];

  _ready = true;
}

// ---------- SYNC READS (from cache) ----------
function getProducts()   { return _cache.products; }
function getSales()      { return _cache.sales; }
function getCustomers()  { return _cache.customers; }
function getExpenses()   { return _cache.expenses; }
function getRevoked()    { return _cache.revoked; }
function getAudit()      { return _cache.audit; }
function getUsers()      { return _cache.users; }
/*
function getCategories() { return _cache.categories; }
*/
function getCategories() {
  return _cache.categories.map(c => typeof c === 'string' ? c : c.name);
}
function getConfig()     { return _cache.config; }
function getSecurity()   { return _cache.security; }
function getLockedNavs() { return _cache.lockedNavs; }
// ---------- SYNC WRITES (update cache + async persist) ----------
function _ensureIds(arr) {
  if (!Array.isArray(arr)) return [];
  const now = Date.now();
  return arr.map((item, i) => {
    if (item && item.id != null) return item;
    return { ...item, id: now + i };
  });
}

function saveProducts(p)   { const d = _ensureIds(p);  _cache.products = d;  _persist('products', d); }
function saveSales(s)      { const d = _ensureIds(s);  _cache.sales = d;     _persist('sales', d); }
function saveCustomers(c)  { const d = _ensureIds(c);  _cache.customers = d; _persist('customers', d); }
function saveExpenses(e)   { const d = _ensureIds(e);  _cache.expenses = d;  _persist('expenses', d); }
function saveRevoked(r)    { const d = _ensureIds(r);  _cache.revoked = d;   _persist('revoked', d); }
function saveAudit(a)      { const d = _ensureIds(a);  _cache.audit = d;     _persist('audit', d); }
function saveUsers(u)      { const d = _ensureIds(u);  _cache.users = d;     _persist('users', d); }

function saveCategories(c) {
  if (!Array.isArray(c)) c = [];
  _cache.categories = c;
  const rows = c
    .map(item => {
      if (typeof item === 'string') {
        const t = item.trim();
        return t ? { name: t } : null;
      }
      if (item && typeof item === 'object' && item.name) {
        return { name: String(item.name).trim() };
      }
      return null;
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = rows.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });

  db.transaction('rw', db.categories, async () => {
    await db.categories.clear();
    if (unique.length) await db.categories.bulkPut(unique);
  }).catch(err => console.warn('Categories persist failed:', err));
}

function setConfig(c) {
  _cache.config = c;
  db.config.put({ key: 'singleton', value: c }).catch(console.warn);
  return c;
}

function setSecurity(patch) {
  const merged = { ..._cache.security, ...patch };
  _cache.security = merged;
  db.security.put({ key: 'singleton', value: merged }).catch(console.warn);
  return merged;
}

function setLockedNavs(l) {
  _cache.lockedNavs = l;
  db.lockedNavs.put({ key: 'singleton', value: l }).catch(console.warn);
  return l;
}

// Legacy getData/setData used by expense_types
function getData(key) { return key === 'expense_types' ? _cache.expenseTypes : []; }
function setData(key, data) {
  if (key === 'expense_types') {
    _cache.expenseTypes = data;
    db.config.put({ key: 'ls_' + key, value: data }).catch(console.warn);
  }
}

// ---------- BACKGROUND PERSIST ----------
function _persist(table, arr) {
  return db.transaction('rw', db[table], async () => {
    try {
      await db[table].clear();
      if (arr && arr.length) {
        await db[table].bulkPut(arr);
      }
    } catch (err) {
      console.error(`❌ Persist failed for table "${table}":`, err.message);
      console.error('Sample row:', arr && arr[0]);
      throw err;
    }
  }).catch(() => {});
}
        // ---------- AUDIT LOG ----------
        function logAudit(action, details = '') {
            const log = getAudit();
            log.push({
                timestamp: Date.now(),
                date: new Date().toLocaleString(),
                action: action,
                details: details,
                user: currentUser ? currentUser.name : 'System'
            });
            // Keep last 1000 entries
            while (log.length > 1000) log.shift();
            saveAudit(log);
        }

        // ---------- NOTIFICATION ----------
        function notify(msg, title = 'Alert') {
            document.getElementById('notifyTitle').innerText = title;
            document.getElementById('notifyMessage').innerText = msg;
            document.getElementById('notifyModal').classList.add('show');
        }

     function closeNotify() {
    document.getElementById('notifyModal').classList.remove('show');
    if (pendingLockOverlay) {
        const p = pendingLockOverlay;
        pendingLockOverlay = null;
        showLockOverlay(p);
    }
}
        // ---------- NAVIGATION ----------
     function navigateTo(page) {
    // --- If we're leaving a lockable page, re-lock it ---
    const leaving = getCurrentPage();
    if (leaving && leaving == page && isLockable(leaving) && !getLockedNavs().includes(leaving)) {
        const locked = getLockedNavs();
        locked.push(leaving);
        setLockedNavs(locked);
        updateLockedNavUI();
        logAudit('Auto Lock', `Locked ${leaving} on navigate away`);
    }

    // Check if target page is locked
    if (isPageLocked(page)) {
        showLockOverlay(page);
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const navLink = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    const titles = {
        'dashboard': 'Dashboard <small>Overview</small>',
        'pos': 'Point of Sale <small>New Sale</small>',
        'products': 'Products <small>Inventory</small>',
        'customers': 'Customers <small>Directory</small>',
        'invoices': 'Invoices <small>History</small>',
        'expenses': 'Expenses <small>Review All Your Expenses</small>',
        'reports': 'Reports <small>Sales Analysis</small>',
        'settings': 'Settings <small>System Configuration</small>'
    };
    document.getElementById('pageTitle').innerHTML = titles[page] || page;
    document.getElementById('sidebar').classList.remove('open');

    resetLockTimer();

    if (page === 'dashboard') refreshDashboard();
    if (page === 'pos') { renderProducts();
        renderCategories(); }
    if (page === 'products') loadStock();
    if (page === 'customers') loadCustomers();
    if (page === 'invoices') loadInvoices();
    if (page === 'expenses') loadExpenses();
    if (page === 'reports') refreshReport();
    if (page === 'settings') loadSettings();

    logAudit('Navigation', `Navigated to ${page}`);
}
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        document.addEventListener('click', function(e) {
            const sidebar = document.getElementById('sidebar');
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && !e.target.closest('.mobile-toggle')) {
                    sidebar.classList.remove('open');
                }
            }
        });

        // ---------- DATE DISPLAY ----------
        document.getElementById('currentDate').innerHTML = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // ---------- THEME ----------
        function setTheme(theme) {
            const config = getConfig();
            config.theme = theme;
            setConfig(config);
            applyTheme(theme);
            logAudit('Theme Change', `Changed theme to ${theme}`);
        }

        function applyTheme(theme) {
            const body = document.body;
            body.classList.remove('dark');
            if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                body.classList.add('dark');
            }
        }

        function loadTheme() {
            const config = getConfig();
            applyTheme(config.theme || 'system');
        }
// ---------- SECURITY FUNCTIONS ----------
// ---------- SECURITY FUNCTIONS ----------
function isPageLocked(page) {
    const locked = getLockedNavs();
    return locked.includes(page) && page !== 'dashboard' && page !== 'pos' && page !== 'settings';
}

function isLockable(page) {
    if (!page) return false;
    if (page === 'dashboard' || page === 'pos' || page === 'settings') return false;
    return getLockableNavItems().includes(page);
}

function getCurrentPage() {
    const active = document.querySelector('.page.active');
    return active ? active.id.replace('page-', '') : null;
}
/*
function showLockOverlay(page) {
    
    document.getElementById('lockMessage').innerText = `Enter PIN to access ${page}`;
    document.getElementById('lockOverlay').classList.add('show');
    document.getElementById('lockPin').value = '';
    document.getElementById('lockError').innerText = '';
    document.getElementById('lockPin').focus();
    document.getElementById('lockOverlay').dataset.targetPage = page;
}
*/
function showLockOverlay(page) {
    // Reset rows
    document.getElementById('lockPinRow').style.display = '';
    document.getElementById('lockRecoveryRow').style.display = 'none';
    document.getElementById('lockNewPinRow').style.display = 'none';

    document.getElementById('lockMessage').innerText = `Enter PIN to access ${page}`;
    document.getElementById('lockOverlay').classList.add('show');
    document.getElementById('lockPin').value = '';
    document.getElementById('lockError').innerText = '';
    document.getElementById('lockOverlay').dataset.targetPage = page;

    // If they've already burned through 10 attempts, go straight to recovery
    const attempts = getSecurity().failedAttempts || 0;
    if (attempts >= 10) {
        switchLockOverlayToRecoveryMode();
    } else {
        document.getElementById('lockPin').focus();
    }
}
function unlockNavigation() {
    const pin = document.getElementById('lockPin').value;
    const security = getSecurity();
    const targetPage = document.getElementById('lockOverlay').dataset.targetPage;

    if (!security.enabled) {
        document.getElementById('lockError').innerText = 'Security is not enabled';
        return;
    }

    if (pin === security.pin) {
        document.getElementById('lockOverlay').classList.remove('show');
        document.getElementById('lockError').innerText = '';

        // Unlock ONLY this page
        const locked = getLockedNavs();
        setLockedNavs(locked.filter(l => l !== targetPage));

        // Reset failed attempts WITHOUT wiping the security object
        setSecurity({ failedAttempts: 0 });

        navigateTo(targetPage);
        resetLockTimer();

        logAudit('Security Unlock', `Unlocked ${targetPage}`);
    } 
    else {
    const current = getSecurity();
    const attempts = (current.failedAttempts || 0) + 1;
    setSecurity({ failedAttempts: attempts });

    if (attempts >= 10) {
        switchLockOverlayToRecoveryMode();
    } else {
        document.getElementById('lockError').innerText =
            `Invalid PIN (${attempts}/10)`;
    }
    document.getElementById('lockPin').value = '';
    document.getElementById('lockPin').focus();
}
}
function switchLockOverlayToRecoveryMode() {
    document.getElementById('lockPinRow').style.display = 'none';
    document.getElementById('lockRecoveryRow').style.display = '';
    document.getElementById('lockNewPinRow').style.display = 'none';
    document.getElementById('lockRecoveryError').innerText = '';
    document.getElementById('lockRecoveryKey').value = '';
    document.getElementById('lockRecoveryKey').focus();
    logAudit('Security', 'Too many failed attempts — recovery key required');
}

function submitRecoveryKey() {
    const entered = document.getElementById('lockRecoveryKey').value.trim().toUpperCase();
    const config = getConfig();
    const expected = (config.recoveryKey || '').toUpperCase();

    if (!expected) {
        document.getElementById('lockRecoveryError').innerText =
            'No recovery key on file. Contact support.';
        return;
    }

    if (entered !== expected) {
        document.getElementById('lockRecoveryError').innerText = 'Invalid recovery key.';
        document.getElementById('lockRecoveryKey').value = '';
        document.getElementById('lockRecoveryKey').focus();
        logAudit('Security', 'Invalid recovery key attempt');
        return;
    }

    // Key is correct → move to new PIN step
    document.getElementById('lockRecoveryRow').style.display = 'none';
    document.getElementById('lockNewPinRow').style.display = '';
    document.getElementById('lockNewPinError').innerText = '';
    document.getElementById('lockNewPin').value = '';
    document.getElementById('lockNewPinConfirm').value = '';
    document.getElementById('lockNewPin').focus();
    logAudit('Security', 'Recovery key accepted — awaiting new PIN');
}

function saveRecoveredPin() {
    const pin = document.getElementById('lockNewPin').value.trim();
    const confirm = document.getElementById('lockNewPinConfirm').value.trim();
    const err = document.getElementById('lockNewPinError');

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        err.innerText = 'PIN must be 4–6 digits.';
        return;
    }
    if (pin !== confirm) {
        err.innerText = 'PINs do not match.';
        return;
    }

    // Save new PIN, clear failed attempts
    setSecurity({ pin: pin, failedAttempts: 0 });

    // Reset the overlay back to PIN mode for next time
    document.getElementById('lockNewPinRow').style.display = 'none';
    document.getElementById('lockPinRow').style.display = '';
    document.getElementById('lockError').innerText = '';
    document.getElementById('lockPin').value = '';

    // Log it
    logAudit('PIN Change', 'PIN reset via recovery key');

    // Auto-unlock the page they were trying to access
    const targetPage = document.getElementById('lockOverlay').dataset.targetPage;
    if (targetPage) {
        const locked = getLockedNavs();
        setLockedNavs(locked.filter(l => l !== targetPage));
        document.getElementById('lockOverlay').classList.remove('show');
        navigateTo(targetPage);
        resetLockTimer();
    } else {
        document.getElementById('lockOverlay').classList.remove('show');
    }

    notify('PIN reset successfully. You can continue.', 'Success');
}

// ---------- PER-PAGE INACTIVITY LOCK ----------
function resetLockTimer() {
    lastActivity = Date.now();

    if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
    }

    const security = getSecurity();
    if (!security.enabled) return;

    const currentPage = getCurrentPage();
    if (!currentPage) return;

    if (currentPage === 'dashboard' || currentPage === 'pos' || currentPage === 'settings') return;
    if (!isLockable(currentPage)) return;
    if (getLockedNavs().includes(currentPage)) return;

    lockTimer = setTimeout(() => {
        const sec = getSecurity();
        if (!sec.enabled) return;
        if (getCurrentPage() !== currentPage) return;

        const locked = getLockedNavs();
        if (!locked.includes(currentPage)) {
            locked.push(currentPage);
            setLockedNavs(locked);
            updateLockedNavUI();
            logAudit('Auto Lock', `Locked ${currentPage} after inactivity`);
        }

        pendingLockOverlay = currentPage;
        notify(`"${currentPage}" has been locked due to inactivity.`, 'Page Locked');
    }, (security.timeout || 0.2) * 60 * 1000);
}

// ---------- USER ACTIVITY TRACKING ----------
let _lastActivityReset = 0;
function _onUserActivity() {
    if (document.getElementById('lockOverlay').classList.contains('show')) return;
    const now = Date.now();
    if (now - _lastActivityReset < 1000) return;
    _lastActivityReset = now;
    resetLockTimer();
}

document.addEventListener('click', _onUserActivity);
document.addEventListener('keydown', _onUserActivity);
document.addEventListener('mousemove', _onUserActivity);




        // ---------- CHANGE PIN ----------
        function openChangePin() {
            document.getElementById('pinModal').classList.add('show');
            document.getElementById('oldPin').value = '';
            document.getElementById('newPin').value = '';
            document.getElementById('confirmPin').value = '';
        }

        function closePinModal() {
            document.getElementById('pinModal').classList.remove('show');
        }

        function changePin() {
            const oldPin = document.getElementById('oldPin').value;
            const newPin = document.getElementById('newPin').value;
            const confirmPin = document.getElementById('confirmPin').value;

            const security = getSecurity();

            if (!security.pin || security.pin === '') {
                // First time setting PIN
                if (newPin !== confirmPin) {
                    notify('PINs do not match', 'Error');
                    return;
                }
                if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
                    notify('PIN must be 4-6 digits', 'Error');
                    return;
                }
                security.pin = newPin;
                setSecurity(security);
                notify('PIN set successfully!', 'Success');
                logAudit('PIN Change', 'New PIN set');
                closePinModal();
                return;
            }

            // Changing existing PIN
            if (oldPin !== security.pin) {
                notify('Current PIN is incorrect', 'Error');
                return;
            }
            if (newPin !== confirmPin) {
                notify('New PINs do not match', 'Error');
                return;
            }
            if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
                notify('PIN must be 4-6 digits', 'Error');
                return;
            }
            security.pin = newPin;
            setSecurity(security);
            notify('PIN changed successfully!', 'Success');
            logAudit('PIN Change', 'PIN was changed');
            closePinModal();
        }

        // ---------- SECURITY SETTINGS ----------
        function openSecuritySettings() {
            const security = getSecurity();
            document.getElementById('securityEnabled').checked = security.enabled || false;
            document.getElementById('securityPin').value = security.pin || '';
            document.getElementById('securityLockType').value = security.lockType || 'admin';
            document.getElementById('securityTimeout').value = security.timeout || 5;
            document.getElementById('securityModal').classList.add('show');
        }

        function closeSecurityModal() {
            document.getElementById('securityModal').classList.remove('show');
        }

        function toggleSecurityFields() {
            const enabled = document.getElementById('securityEnabled').checked;
            document.getElementById('securityPin').disabled = !enabled;
            document.getElementById('securityLockType').disabled = !enabled;
            document.getElementById('securityTimeout').disabled = !enabled;
        }

        function saveSecuritySettings() {
            const security = {
                enabled: document.getElementById('securityEnabled').checked,
                pin: document.getElementById('securityPin').value,
                lockType: document.getElementById('securityLockType').value,
                timeout: parseInt(document.getElementById('securityTimeout').value) || 5,
                failedAttempts: 0
            };

            if (security.enabled && (!security.pin || security.pin.length < 4)) {
                notify('Please set a PIN (4-6 digits)', 'Error');
                return;
            }

            if (security.enabled && !/^\d+$/.test(security.pin)) {
                notify('PIN must be digits only', 'Error');
                return;
            }

            setSecurity(security);
            updateSecurityStatus();
            notify('Security settings saved!', 'Success');
            logAudit('Security Settings', 'Security settings updated');
            closeSecurityModal();

            // If security is enabled and there are lockable items, lock them
            if (security.enabled) {
                const lockableItems = getLockableNavItems();
                setLockedNavs(lockableItems);
                updateLockedNavUI();
            } else {
                setLockedNavs([]);
                updateLockedNavUI();
            }
        }

        function updateSecurityStatus() {
            const security = getSecurity();
            document.getElementById('securityEnabledStatus').innerText = security.enabled ? 'Enabled' : 'Disabled';
            document.getElementById('securityEnabledStatus').style.color = security.enabled ? '#16a34a' : '#dc2626';
            document.getElementById('securityPinStatus').innerText = security.pin ? 'PIN Set' : 'PIN Not Set';
            document.getElementById('securityPinStatus').style.color = security.pin ? '#16a34a' : '#f59e0b';
        }

        // ---------- LOCKED NAVIGATION ----------
        function getLockableNavItems() {
            const items = [];
            document.querySelectorAll('.sidebar-nav a[data-lockable="true"]').forEach(el => {
                const page = el.dataset.page;
                if (page) items.push(page);
            });
            return items;
        }

        function updateLockedNavUI() {
            const locked = getLockedNavs();
            const security = getSecurity();

            document.querySelectorAll('.sidebar-nav a[data-lockable="true"]').forEach(el => {
                const page = el.dataset.page;
                if (locked.includes(page) && security.enabled) {
                    el.classList.add('locked');
                } else {
                    el.classList.remove('locked');
                }
            });

            // Update settings UI
            const container = document.getElementById('lockableNavList');
            if (container) {
                const items = getLockableNavItems();
                const lockedItems = getLockedNavs();
                container.innerHTML = items.map(item => `
                    <div class="checkbox-group">
                        <input type="checkbox" id="lock_${item}" ${lockedItems.includes(item) ? 'checked' : ''} 
                               ${!security.enabled ? 'disabled' : ''}>
                        <label for="lock_${item}" style="font-weight:400;">${item.charAt(0).toUpperCase() + item.slice(1)}</label>
                    </div>
                `).join('');
            }
        }

        function saveLockedNavs() {
            const security = getSecurity();
            if (!security.enabled) {
                notify('Security must be enabled first', 'Error');
                return;
            }

            const items = getLockableNavItems();
            const locked = [];
            items.forEach(item => {
                const checkbox = document.getElementById(`lock_${item}`);
                if (checkbox && checkbox.checked) {
                    locked.push(item);
                }
            });
            setLockedNavs(locked);
            updateLockedNavUI();
            notify('Lock settings saved!', 'Success');
            logAudit('Lock Settings', `Locked navigation: ${locked.join(', ')}`);
        }

        // ---------- CREATE ACCOUNT ----------
       function openCreateAccount() {
    const setVal = (id, val = '') => {
        const el = document.getElementById(id);
        if (el) el.value = val;
        else console.warn('⚠️ Missing element:', id);
    };

    const modal = document.getElementById('accountModal');
    if (modal) modal.classList.add('show');
    else console.warn('⚠️ Missing element: accountModal');

    setVal('accShopName');
    setVal('accLocation');
    setVal('accAdminName');
    setVal('accCashierName');
    setVal('accPhone');
    setVal('accPassword');
}
       /*
        function openCreateAccount() {
            document.getElementById('accountModal').classList.add('show');
            document.getElementById('accShopName').value = '';
            document.getElementById('accLocation').value ='';
            document.getElementById('accAdminName').value = '';
            document.getElementById('accCashierName').value = '';
            document.getElementById('accPhone').value = '';
            document.getElementById('accPassword').value = '';
        }
*/
        function closeAccountModal() {
            document.getElementById('accountModal').classList.remove('show');
        }

        function generateSystemId() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = '';
            for (let i = 0; i < 8; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        function generateRecoveryKey() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let key = '';
            for (let i = 0; i < 12; i++) {
                if (i > 0 && i % 4 === 0) key += '-';
                key += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return key;
        }

        function createAccount() {
            const shopName = document.getElementById('accShopName').value.trim();
            const location = document.getElementById('accLocation').value.trim();
            const adminName = document.getElementById('accAdminName').value.trim();
            const cashierName = document.getElementById('accCashierName').value.trim();
            const phone = document.getElementById('accPhone').value.trim();
            const password = document.getElementById('accPassword').value.trim();

            if (!shopName || !adminName || !phone || !password) {
                notify('Please fill all required fields', 'Error');
                return;
            }

            if (password.length < 4 || password.length > 6 || !/^\d+$/.test(password)) {
                notify('PIN must be 4-6 digits', 'Error');
                return;
            }

            // Check if account exists
            const users = getUsers();
            if (users.find(u => u.phone === phone)) {
                notify('Phone number already registered', 'Error');
                return;
            }

            const systemId = generateSystemId();
            const recoveryKey = generateRecoveryKey();

            const newUser = {
                id: Date.now(),
                shopName: shopName,
                location: location,
                adminName: adminName,
                cashierName: cashierName || '',
                phone: phone,
                password: password,
                role: cashierName ? 'cashier' : 'admin',
                systemId: systemId,
                recoveryKey: recoveryKey,
                createdAt: Date.now()
            };

            users.push(newUser);
            saveUsers(users);

            // Save shop info in config
            const config = getConfig();
            config.shopName = shopName;
            config.location=location;
            config.adminName = adminName;
            config.phone = phone;
            config.systemId = systemId;
            config.recoveryKey = recoveryKey;
            setConfig(config);

            // Set as current user
            currentUser = newUser;
            updateUserUI();

            // Update shop name in sidebar
            document.getElementById('shopNameDisplay').innerText = shopName;

            // Generate JSON file for system keys
            generateSystemKeysFile(systemId, recoveryKey);

            closeAccountModal();
            notify('Account created successfully!', 'Success');
            logAudit('Account Creation', `Account created for ${adminName} (${phone})`);

            // Update settings page
            loadSettings();
        }

        function generateSystemKeysFile(systemId, recoveryKey) {
            const data = {
                systemId: systemId,
                recoveryKey: recoveryKey,
                generatedAt: new Date().toISOString(),
                shopName: document.getElementById('accShopName').value.trim() || getConfig().shopName || 'Unknown'
            };

            // For Electron, we'd save to file system
            // For browser, we trigger download
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `system_keys_${data.shopName.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function exportSystemKeys() {
            const config = getConfig();
            if (!config.systemId || !config.recoveryKey) {
                notify('No system keys found. Create an account first.', 'Error');
                return;
            }
            generateSystemKeysFile(config.systemId, config.recoveryKey);
            logAudit('Export Keys', 'System keys exported');
        }

        // ---------- UPDATE USER UI ----------
        function updateUserUI() {
            if (currentUser) {
                document.getElementById('userDisplayName').innerText = currentUser.adminName || currentUser.name || 'User';
                document.getElementById('userAvatar').innerText = (currentUser.adminName || 'U')[0].toUpperCase();
            }
        }

        function toggleUserMenu() {
            // Simple user menu - could be expanded
            // For now, just show a message
        }

        // ---------- SETTINGS PAGE ----------
       function loadSettings() {
    const config = getConfig();

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
        else console.warn('⚠️ Missing element:', id);
    };

    setText('settingsShopName', config.shopName || 'Not Set');
    setText('settingsAdminName', config.adminName || 'Not Set');
    setText('settingsPhone', config.phone || 'Not Set');
    setText('settingsSystemId', config.systemId || 'Not Generated');
    setText('settingsRecoveryKey', config.recoveryKey || 'Not Generated');

    updateSecurityStatus();
    updateLockedNavUI();

    const themeSelect = document.querySelector(`[onclick*="setTheme('${config.theme || 'system'}')"]`);
    // Just show current theme
}
        // ---------- AUDIT LOG ----------
        function openAuditLog() {
            const logs = getAudit();
            const container = document.getElementById('auditLogList');
            if (logs.length === 0) {
                container.innerHTML = '<div class="audit-entry"><span class="text-muted">No audit logs yet</span></div>';
            } else {
                container.innerHTML = logs.slice(-100).reverse().map(log => `
                    <div class="audit-entry">
                        <span>${log.date} - <strong>${log.action}</strong> ${log.details ? '· ' + log.details : ''}</span>
                        <span class="time">${log.user || 'System'}</span>
                    </div>
                `).join('');
            }
            document.getElementById('auditModal').classList.add('show');
            logAudit('Audit Log', 'Viewed audit log');
        }

        function closeAuditModal() {
            document.getElementById('auditModal').classList.remove('show');
        }

        // ---------- DASHBOARD ----------
        function refreshDashboard() {
            const sales = getSales();
            const expenses = getExpenses();
            const revoked = getRevoked();
            const today = new Date().toDateString();

            // Today's sales
            const todaySales = sales.filter(s => {
                const d = new Date(s.timestamp || s.id || Date.now());
                return d.toDateString() === today;
            });

            let total = 0,
                items = 0,
                customers = new Set();
            todaySales.forEach(s => {
                total += Number(s.total) || 0;
                if (s.items) s.items.forEach(i => { items += Number(i.qty) || 0; });
                if (s.customer) customers.add(s.customer);
            });

            // Today's expenses
            const todayExpenses = expenses.filter(e => {
                const d = new Date(e.timestamp || Date.now());
                return d.toDateString() === today;
            });
            const expenseTotal = todayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

            // Today's revoked sales
            const todayRevoked = revoked.filter(r => {
                const d = new Date(r.timestamp || Date.now());
                return d.toDateString() === today;
            });
            const revokedTotal = todayRevoked.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

            document.getElementById('dashTodaySales').innerText = `KES ${(total - revokedTotal).toFixed(2)}`;
            document.getElementById('dashCustomers').innerText = customers.size || 0;
            document.getElementById('dashItems').innerText = items;
            document.getElementById('dashInvoices').innerText = sales.length;
            document.getElementById('dashRevoked').innerText = todayRevoked.length;
            document.getElementById('dashExpenses').innerText = `KES ${expenseTotal.toFixed(2)}`;

            // Recent transactions
            const recent = document.getElementById('recentTransactions');
            const recentSales = todaySales.slice(-5).reverse();
            if (recentSales.length === 0) {
                recent.innerHTML = '<div class="item"><span class="text-muted">No transactions yet today</span></div>';
            } else {
                recent.innerHTML = recentSales.map(s => `
                    <div class="item">
                        <div class="info">
                            <div class="name">${s.customer || 'Guest'}</div>
                            <div class="meta">${s.items ? s.items.length : 0} items · ${new Date(s.timestamp || s.id).toLocaleTimeString()}</div>
                        </div>
                        <div class="amount">KES ${(Number(s.total) || 0).toFixed(2)}</div>
                    </div>
                `).join('');
            }

            // Best sellers
            const best = document.getElementById('bestSellers');
            const productCount = {};
            sales.forEach(s => {
                if (s.items) s.items.forEach(i => {
                    const name = i.name || 'Unknown';
                    productCount[name] = (productCount[name] || 0) + (Number(i.qty) || 0);
                });
            });
            const sorted = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
            if (sorted.length === 0) {
                best.innerHTML = '<div class="item"><span class="text-muted">No sales data yet</span></div>';
            } else {
                best.innerHTML = sorted.map(([name, qty]) => `
                    <div class="item"><span>${name}</span> <span class="text-muted">${qty} units</span></div>
                `).join('');
            }

            // Expense summary
            document.getElementById('expenseTotalToday').innerText = `KES ${expenseTotal.toFixed(2)}`;
            const netProfit = total - expenseTotal - revokedTotal;
            document.getElementById('expenseNetProfit').innerText = `KES ${netProfit.toFixed(2)}`;

            const breakdown = document.getElementById('expenseBreakdown');
            if (todayExpenses.length > 0) {
                const byType = {};
                todayExpenses.forEach(e => {
                    const type = e.type || 'Other';
                    byType[type] = (byType[type] || 0) + (Number(e.amount) || 0);
                });
                breakdown.innerHTML = Object.entries(byType).map(([type, amount]) =>
                    `<span style="margin-right:12px;"><strong>${type}:</strong> KES ${amount.toFixed(2)}</span>`
                ).join('');
            } else {
                breakdown.innerHTML = 'No expenses today';
            }

            renderDashCharts(sales);
        }

        function renderDashCharts(sales) {
            const ctx1 = document.getElementById('dashTrendChart').getContext('2d');
            const ctx2 = document.getElementById('dashTopChart').getContext('2d');

            const sevenDays = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                sevenDays.push(d.toDateString());
            }
            const dailySales = sevenDays.map(date => {
                const daySales = sales.filter(s => {
                    const d = new Date(s.timestamp || s.id || Date.now());
                    return d.toDateString() === date;
                });
                return daySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            });

            if (dashTrendChart) dashTrendChart.destroy();
            dashTrendChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: sevenDays.map(d => new Date(d).toLocaleDateString('en', { weekday: 'short' })),
                    datasets: [{ label: 'Daily Sales (KES)', data: dailySales, borderColor: '#1a5bbf',
                        fill: true, backgroundColor: 'rgba(26,91,191,0.1)', tension: 0.4 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });

            const productCount = {};
            sales.forEach(s => {
                if (s.items) s.items.forEach(i => {
                    const name = i.name || 'Unknown';
                    productCount[name] = (productCount[name] || 0) + (Number(i.qty) || 0);
                });
            });
            const top = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

            if (dashTopChart) dashTopChart.destroy();
            dashTopChart = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: top.map(t => t[0].length > 10 ? t[0].substring(0, 10) + '...' : t[0]),
                    datasets: [{ label: 'Units Sold', data: top.map(t => t[1]),
                        backgroundColor: ['#1a5bbf', '#3b82f6', '#16a34a', '#f59e0b', '#8b5cf6'] }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }

        // ---------- POS - PRODUCTS & CART ----------
        function renderCategories() {
            const products = getProducts();
            const categories = new Set();
            products.forEach(p => {
                if (p.category) categories.add(p.category);
            });

            const container = document.getElementById('categoryTabs');
            // Keep "All" button
            let html = '<button class="category-tab active" onclick="filterByCategory(\'All\')">All</button>';
            categories.forEach(cat => {
                html += `<button class="category-tab" onclick="filterByCategory('${cat}')">${cat}</button>`;
            });
            container.innerHTML = html;
        }

        function renderProductGrid(products) {
            const grid = document.getElementById('productGrid');
            if (products.length === 0) {
                grid.innerHTML = `
                    <div class="empty-products">
                        <i class="fa fa-box-open"></i>
                        <h3>No products found</h3>
                    </div>
                `;
                return;
            }
            grid.innerHTML = products.map(p => `
                <div class="product-card" onclick="addToCart('${p.code}')">
                    <div class="product-image"><i class="fa fa-box"></i></div>
                    <div class="product-name">${p.name}</div>
                    <div class="product-code">${p.code}</div>
                    <div class="product-price">KES ${Number(p.price).toFixed(2)}</div>
                    <div class="product-vat">VAT ${p.vat || '16%'}</div>
                    <div class="product-stock">${p.stock}</div>
                </div>
            `).join('');
        }

        function renderProducts(category = 'All') {
            currentCategory = category;
            filterByCategory(category);
        }

        function filterProducts() {
            const search = document.getElementById('productSearch').value.trim().toLowerCase();
            const products = getProducts();
            const filtered = products.filter(product => {
                const matchesCategory = currentCategory === 'All' || (product.category && product.category
                .toLowerCase() === currentCategory.toLowerCase());
                const matchesSearch = product.name.toLowerCase().includes(search) || product.code.toLowerCase()
                    .includes(search) || (product.category && product.category.toLowerCase().includes(search));
                return matchesCategory && matchesSearch;
            });
            renderProductGrid(filtered);
        }

        function filterByCategory(category) {
            currentCategory = category;
            document.querySelectorAll('.category-tab').forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent.trim() === category) btn.classList.add('active');
            });
            const products = getProducts();
            const filtered = category === 'All' ? products : products.filter(p => p.category && p.category
                .trim().toLowerCase() === category.trim().toLowerCase());
            renderProductGrid(filtered);
        }

        // ---------- CART ----------
        function addToCart(productCode) {
            const products = getProducts();
            const product = products.find(p => p.code === productCode);
            if (!product) return;
            if (product.stock <= 0) { notify('Product out of stock!', 'Warning'); return; }

            const existing = cart.find(item => item.code === productCode);
            if (existing) {
                if (existing.qty >= product.stock) { notify('Not enough stock', 'Warning'); return; }
                existing.qty += 1;
            } else {
                cart.push({ ...product, qty: 1 });
            }
            updateCart();
        }

        function updateCart() {
            const container = document.getElementById('cartItems');
            const empty = container.querySelector('.empty-cart');
            if (empty) empty.remove();

            if (cart.length === 0) {
                container.innerHTML = `
                    <div class="empty-cart">
                        <i class="fa fa-shopping-cart"></i>
                        <p>Cart is empty</p>
                        <small>Click a product to add it</small>
                    </div>
                `;
            } else {
                container.innerHTML = cart.map((item, index) => `
                    <div class="cart-item">
                        <div class="item-info">
                            <div class="item-name">${item.name}</div>
                            <div class="item-code">${item.code}</div>
                            <span class="item-vat">VAT ${item.vat || '16%'}</span>
                        </div>
                        <div class="item-qty">
                            <button onclick="updateQty(${index}, -1)">−</button>
                            <span>${item.qty}</span>
                            <button onclick="updateQty(${index}, 1)">+</button>
                        </div>
                        <div class="item-price">KES ${(item.price * item.qty).toFixed(2)}</div>
                        <button class="item-remove" onclick="removeFromCart(${index})"><i class="fa fa-times"></i></button>
                    </div>
                `).join('');
            }

            const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            document.getElementById('cartTotal').innerText = `KES ${total.toFixed(2)}`;
            document.getElementById('saleAmount').innerText = `KES ${total.toFixed(2)}`;
            document.getElementById('cartCount').innerText = cart.reduce((sum, item) => sum + item.qty, 0);
        }

        function updateQty(index, delta) {
            const products = getProducts();
            const product = products.find(p => p.code === cart[index].code);
            cart[index].qty += delta;
            if (cart[index].qty < 1) cart[index].qty = 1;
            if (product && cart[index].qty > product.stock) {
                cart[index].qty = product.stock;
                notify('Not enough stock', 'Warning');
            }
            updateCart();
        }

        function removeFromCart(index) {
            cart.splice(index, 1);
            updateCart();
        }

        function changeCustomer() {
            const name = prompt('Enter customer name:', '');
            if (name) {
                document.getElementById('customerName').innerText = name;
                let customers = getCustomers();
                if (!customers.find(c => c.name === name)) {
                    customers.push({ name, sales: 0, lastPurchase: new Date().toLocaleDateString() });
                    saveCustomers(customers);
                }
                logAudit('Customer', `Changed customer to ${name}`);
            }
        }

        function selectPayment(method) {
            selectedPayment = method;
            document.querySelectorAll('.payment-btn').forEach(b => b.style.borderColor = '#dce4ee');
            document.querySelector(`.payment-btn.${method.toLowerCase()}`).style.borderColor = '#1a5bbf';
        }

        // ---------- COMPLETE SALE ----------
        function completeSale() {
            if (cart.length === 0) { notify('Cart is empty!', 'Warning'); return; }

            const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const customer = document.getElementById('customerName').innerText;

            let products = getProducts();
            let errors = [];
            cart.forEach(item => {
                const product = products.find(p => p.code === item.code);
                if (!product) { errors.push(`${item.name} not found`); return; }
                if (product.stock < item.qty) errors.push(`Not enough stock for ${item.name}`);
                else product.stock -= item.qty;
            });
            if (errors.length) { notify(errors.join(' | '), 'Stock Error'); return; }
            saveProducts(products);

            const sale = {
                id: Date.now(),
                timestamp: Date.now(),
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                customer: customer,
                items: cart.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
                total: total,
                discount: 0,
                paid: total,
                payment: selectedPayment,
                revoked: false
            };
            let sales = getSales();
            sales.push(sale);
            saveSales(sales);

            let customers = getCustomers();
            const cust = customers.find(c => c.name === customer);
            if (cust) {
                cust.sales = (cust.sales || 0) + total;
                cust.lastPurchase = new Date().toLocaleDateString();
            } else {
                customers.push({ name: customer, sales: total, lastPurchase: new Date().toLocaleDateString() });
            }
            saveCustomers(customers);

            // Print receipt
            const receiptHTML = `
                <div class="receipt" style="text-align:center;font-family:monospace;padding:10px;width:80mm;">
                    <h2 style="margin:0; font-size:1rem; text-transform:uppercase;">${getConfig().shopName || 'DAX SUPERMARKET'}</h2>
                    <div>${getConfig().location || 'Juja'}</div>
                    <p>P.O. Box: 436 -00100 NRB</p>
                    <div>${getConfig().phone || 'Tel: +254 724 766 164'}</div>
                    <hr>
                    <table style="width:70%;font-size:12px;margin:0 auto;">
                        <tr><td><strong>Date</strong></td><td style="text-align:right;">${sale.date}</td></tr>
                        <tr><td><strong>Time</strong></td><td style="text-align:right;">${sale.time}</td></tr>
                        <tr><td><strong>Customer</strong></td><td style="text-align:right;">${customer}</td></tr>
                    </table>
                    <hr>
                    <table style="width:100%;font-size:12px;">
                        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Total</th></tr></thead>
                        <tbody>
                            ${cart.map(item => `
                                <tr><td>${item.name}</td><td style="text-align:center;">${item.qty}</td>
                                <td style="text-align:right;">${(item.qty*item.price).toFixed(2)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <hr>
                    <table style="width:100%;font-size:12px;margin:0 auto;">
                        <tr><td>Items</td><td style="text-align:right;">${cart.reduce((t,i)=>t+i.qty,0)}</td></tr>
                        <tr><td>Subtotal</td><td style="text-align:right;">${total.toFixed(2)}</td></tr>
                        <tr><td><strong>TOTAL</strong></td><td style="text-align:right;font-size:15px;">KES ${total.toFixed(2)}</td></tr>
                    </table>
                    <hr>
                    <table style="width:100%;font-size:12px;margin:0 auto;">
                        <tr><td>Payment</td><td style="text-align:right;">${selectedPayment}</td></tr>
                        <tr><td>Paid</td><td style="text-align:right;">KES ${total.toFixed(2)}</td></tr>
                    </table>
                    <hr>
                    <div>Thank You For Shopping With us <br> Hoping You Visit Again!!</div>
                    <div>Served by :${getConfig().adminName}</div>
                    <hr>
                    <p>System Developed by:<strong>TechByPrinceSoftwares Ltd</strong> <br>
                    For Software Queries : whatsapp:0724766164</p>
                </div>
            `;

            printReceipt(receiptHTML);

            logAudit('Sale', `Sale completed: ${customer} - KES ${total.toFixed(2)}`);

            cart = [];
            updateCart();
            renderProducts(currentCategory);
            refreshDashboard();
        }

        function printReceipt(receiptHTML) {
            if (window.electronAPI?.printReceipt) {
                window.electronAPI.printReceipt(receiptHTML);
                return;
            }
            const receipt = document.getElementById('receiptContainer');
            receipt.innerHTML = receiptHTML;
            window.print();
            setTimeout(() => { receipt.innerHTML = ''; }, 500);
        }

        // ---------- REVOKE SALE ----------
        function openRevokeModal() {
            document.getElementById('revokeModal').classList.add('show');
            document.getElementById('revokeInvoice').value = '';
        }

        function closeRevokeModal() {
            document.getElementById('revokeModal').classList.remove('show');
        }

        function revokeSale() {
            const invoice = document.getElementById('revokeInvoice').value.trim();
            if (!invoice) { notify('Please enter an invoice number', 'Error'); return; }

            // Extract number from #INV-123456
            const invNum = invoice.replace(/#INV-/, '');
            const sales = getSales();

            // Find the sale
            const saleIndex = sales.findIndex(s => {
                const invId = String(s.id || Date.now()).slice(-6);
                return invId === invNum;
            });

            if (saleIndex === -1) {
                notify('Invoice not found', 'Error');
                return;
            }

            const sale = sales[saleIndex];

            // Check if within 2 hours
            const saleTime = sale.timestamp || sale.id || 0;
            const now = Date.now();
            const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

            if (hoursDiff > 2) {
                notify('Sale can only be revoked within 2 hours', 'Error');
                return;
            }

            // Check if already revoked
            const revoked = getRevoked();
            if (revoked.find(r => r.saleId === sale.id)) {
                notify('This sale has already been revoked', 'Error');
                return;
            }

            // Restore stock
            let products = getProducts();
            if (sale.items) {
                sale.items.forEach(item => {
                    const product = products.find(p => p.name === item.name);
                    if (product) {
                        product.stock = (product.stock || 0) + (item.qty || 0);
                    }
                });
                saveProducts(products);
            }

            // Mark as revoked
            revoked.push({
                saleId: sale.id,
                amount: sale.total || 0,
                timestamp: Date.now(),
                date: new Date().toLocaleString(),
                invoice: invoice
            });
            saveRevoked(revoked);

            // Remove from sales (or mark as revoked)
            sale.revoked = true;
            sales[saleIndex] = sale;
            saveSales(sales);

            closeRevokeModal();
            notify('Sale revoked successfully! Stock restored.', 'Success');
            logAudit('Revoke Sale', `Revoked sale ${invoice} - KES ${(sale.total || 0).toFixed(2)}`);
            refreshDashboard();
            loadInvoices();
        }

        // ---------- PRODUCTS PAGE ----------
        function loadStock() {
            const products = getProducts();
            const tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = '';
            let totalVal = 0,
                low = 0,
                out = 0;
            products.forEach((p, i) => {
                const stock = Number(p.stock) || 0;
                const price = Number(p.price) || 0;
                totalVal += stock * price;
                if (stock <= 0) out++;
                else if (stock < 5) low++;
                const status = stock <= 0 ? 'out' : (stock < 5 ? 'low' : 'normal');
                tbody.innerHTML += `
                    <tr>
                        <td style="padding:8px 12px;">${i+1}</td>
                        <td>${p.code}</td>
                        <td>${p.name}</td>
                        <td>${p.category || '-'}</td>
                        <td>KES ${price.toFixed(2)}</td>
                        <td>${stock}</td>
                        <td><span class="status-badge ${status}">${status.toUpperCase()}</span></td>
                        <td>
                            <button class="btn btn-primary btn-sm" onclick="editProduct('${p.code}')"><i class="fa fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.code}')"><i class="fa fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            document.getElementById('stockTotal').innerText = products.length;
            document.getElementById('stockLow').innerText = low;
            document.getElementById('stockOut').innerText = out;
            document.getElementById('stockValue').innerText = `KES ${totalVal.toFixed(2)}`;
        }

        function filterStock() {
            const q = document.getElementById('stockSearch').value.toLowerCase();
            document.querySelectorAll('#stockTableBody tr').forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
            });
        }

        function openAddProduct() {
            document.getElementById('editCode').value = '';
            document.getElementById('pCode').value = '';
            document.getElementById('pName').value = '';
            document.getElementById('pCategory').value = '';
            document.getElementById('pPrice').value = '';
            document.getElementById('pStock').value = '';
            document.getElementById('productModalTitle').innerText = 'Add Product';
            document.getElementById('productModal').classList.add('show');

            // Update category datalist
            const categories = getCategories();
            const datalist = document.getElementById('categoryList');
            datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
        }

        function closeProduct() {
            document.getElementById('productModal').classList.remove('show');
        }
        function closelockOverlay() {
            document.getElementById('lockOverlay').classList.remove('show');
        }

        function saveProduct() {
            const code = document.getElementById('pCode').value.trim();
            const name = document.getElementById('pName').value.trim();
            const category = document.getElementById('pCategory').value.trim();
            const price = parseFloat(document.getElementById('pPrice').value);
            const stock = parseInt(document.getElementById('pStock').value) || 0;
            const editCode = document.getElementById('editCode').value;

            if (!code || !name || isNaN(price)) { notify('Fill all fields', 'Warning'); return; }

            let products = getProducts();
            if (editCode) products = products.filter(p => p.code !== editCode);
            else if (products.find(p => p.code === code)) { notify('Code exists', 'Warning'); return; }

            products.push({ code, name, category, price, stock, vat: '16%' });
            saveProducts(products);

            // Add category if new
            if (category) {
                let categories = getCategories();
                if (!categories.includes(category)) {
                    categories.push(category);
                    saveCategories(categories);
                }
            }

            closeProduct();
            loadStock();
            renderProducts(currentCategory);
            renderCategories();
            notify('Product saved', 'Success');
            logAudit('Product', `Added/Updated product: ${name} (${code})`);
        }

        function editProduct(code) {
            const products = getProducts();
            const p = products.find(x => x.code === code);
            if (!p) return;
            document.getElementById('editCode').value = code;
            document.getElementById('pCode').value = p.code;
            document.getElementById('pName').value = p.name;
            document.getElementById('pCategory').value = p.category || '';
            document.getElementById('pPrice').value = p.price;
            document.getElementById('pStock').value = p.stock;
            document.getElementById('productModalTitle').innerText = 'Edit Product';
            document.getElementById('productModal').classList.add('show');

            const categories = getCategories();
            const datalist = document.getElementById('categoryList');
            datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
        }

        function deleteProduct(code) {
            if (confirm('Delete this product?')) {
                let products = getProducts().filter(p => p.code !== code);
                saveProducts(products);
                loadStock();
                renderProducts(currentCategory);
                notify('Product deleted', 'Deleted');
                logAudit('Product', `Deleted product: ${code}`);
            }
        }

        // ---------- CUSTOMERS PAGE ----------
        function loadCustomers() {
            const customers = getCustomers();
            const sales = getSales();
            const tbody = document.getElementById('customersTableBody');
            tbody.innerHTML = '';
            if (customers.length === 0) {
                tbody.innerHTML =
                '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6a8aaa;">No customers yet</td></tr>';
                return;
            }
            const today = new Date().toDateString();
            let todayCount = 0;
            customers.forEach((c, i) => {
                const cSales = sales.filter(s => s.customer === c.name);
                const lastSale = cSales.length > 0 ? cSales[cSales.length - 1] : null;
                if (cSales.some(s => new Date(s.timestamp || s.id).toDateString() === today)) todayCount++;
                tbody.innerHTML += `
                    <tr>
                        <td style="padding:8px 12px;">${i+1}</td>
                        <td>${c.name}</td>
                        <td>KES ${(c.sales || 0).toFixed(2)}</td>
                        <td>${lastSale ? new Date(lastSale.timestamp || lastSale.id).toLocaleDateString() : 'Never'}</td>
                    </tr>
                `;
            });
            document.getElementById('totalCustomers').innerText = customers.length;
            document.getElementById('todayCustomers').innerText = todayCount;
        }

        // ---------- INVOICES PAGE ----------
        function loadInvoices() {
            const sales = getSales();
            const revoked = getRevoked();
            const tbody = document.getElementById('invoicesTableBody');
            tbody.innerHTML = '';
            if (sales.length === 0) {
                tbody.innerHTML =
                '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6a8aaa;">No invoices yet</td></tr>';
                return;
            }
            sales.slice().reverse().forEach((s, i) => {
                const isRevoked = revoked.find(r => r.saleId === s.id) || s.revoked;
                const invId = `#INV-${String(s.id || Date.now()).slice(-6)}`;
                tbody.innerHTML += `
                    <tr style="${isRevoked ? 'opacity:0.5;' : ''}">
                        <td style="padding:8px 12px;">${i+1}</td>
                        <td>${invId}</td>
                        <td>${s.customer || 'Guest'}</td>
                        <td>${s.date || ''}</td>
                        <td>KES ${(Number(s.total) || 0).toFixed(2)}</td>
                        <td><span class="status-badge ${isRevoked ? 'danger' : 'normal'}">${isRevoked ? 'REVOKED' : 'PAID'}</span></td>
                        <td>
                            ${!isRevoked ? `<button class="btn btn-danger btn-sm" onclick="quickRevoke('${invId}')"><i class="fa fa-undo"></i></button>` : ''}
                        </td>
                    </tr>
                `;
            });
        }

        function quickRevoke(invoice) {
            document.getElementById('revokeInvoice').value = invoice;
            document.getElementById('revokeModal').classList.add('show');
        }

        // ---------- EXPENSES PAGE ----------
        function openAddExpense() {
            document.getElementById('expenseModal').classList.add('show');
            document.getElementById('expTitle').value = '';
            document.getElementById('expDesc').value = '';
            document.getElementById('expType').value = '';
            document.getElementById('expAmount').value = '';
        }

        function closeExpenseModal() {
            document.getElementById('expenseModal').classList.remove('show');
        }

        function saveExpense() {
            const title = document.getElementById('expTitle').value.trim();
            const desc = document.getElementById('expDesc').value.trim();
            const type = document.getElementById('expType').value.trim() || 'Other';
            const amount = parseFloat(document.getElementById('expAmount').value);

            if (!title || isNaN(amount) || amount <= 0) {
                notify('Please fill all fields with valid values', 'Error');
                return;
            }

            const expense = {
                id: Date.now(),
                title: title,
                description: desc,
                type: type,
                amount: amount,
                timestamp: Date.now(),
                date: new Date().toLocaleString()
            };

            let expenses = getExpenses();
            expenses.push(expense);
            saveExpenses(expenses);

            // Add expense type if new
            let types = getData('expense_types');
            if (!types.includes(type)) {
                types.push(type);
                setData('expense_types', types);
            }

            closeExpenseModal();
            loadExpenses();
            refreshDashboard();
            notify('Expense added successfully', 'Success');
            logAudit('Expense', `Added expense: ${title} - KES ${amount.toFixed(2)}`);
        }

        function loadExpenses() {
            const expenses = getExpenses();
            const tbody = document.getElementById('expensesTableBody');
            tbody.innerHTML = '';
            if (expenses.length === 0) {
                tbody.innerHTML =
                    '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6a8aaa;">No expenses recorded</td></tr>';
                return;
            }

            const today = new Date().toDateString();
            const thisMonth = new Date().getMonth();
            let totalAll = 0,
                totalToday = 0,
                totalMonth = 0;

            expenses.slice().reverse().forEach((e, i) => {
                const date = new Date(e.timestamp || Date.now());
                const amount = Number(e.amount) || 0;
                totalAll += amount;
                if (date.toDateString() === today) totalToday += amount;
                if (date.getMonth() === thisMonth) totalMonth += amount;

                tbody.innerHTML += `
                    <tr>
                        <td style="padding:8px 12px;">${i+1}</td>
                        <td>${e.title}</td>
                        <td>${e.description || '-'}</td>
                        <td>${e.type || 'Other'}</td>
                        <td>KES ${amount.toFixed(2)}</td>
                        <td>${e.date || new Date(e.timestamp).toLocaleString()}</td>
                        <td>
                            <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})"><i class="fa fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });

            document.getElementById('expenseTotal').innerText = `KES ${totalAll.toFixed(2)}`;
            document.getElementById('expenseToday').innerText = `KES ${totalToday.toFixed(2)}`;
            document.getElementById('expenseMonth').innerText = `KES ${totalMonth.toFixed(2)}`;
        }

        function deleteExpense(id) {
            if (confirm('Delete this expense?')) {
                let expenses = getExpenses().filter(e => e.id !== id);
                saveExpenses(expenses);
                loadExpenses();
                refreshDashboard();
                notify('Expense deleted', 'Deleted');
                logAudit('Expense', `Deleted expense ID: ${id}`);
            }
        }

        // ---------- REPORTS PAGE ----------
        function getSaleTimestamp(sale) {
            if (sale.timestamp) return typeof sale.timestamp === 'number' ? sale.timestamp : parseInt(sale.timestamp);
            if (sale.id && typeof sale.id === 'number' && sale.id > 1000000000000) return sale.id;
            if (sale.date && sale.time) {
                try {
                    let parsed = Date.parse(`${sale.date} ${sale.time}`);
                    if (!isNaN(parsed)) return parsed;
                } catch (e) {}
            }
            return Date.now() - 1000;
        }

        function filterSalesByRange(sales, hours) {
            if (hours === 0) return sales;
            const now = Date.now();
            const cutoff = now - (hours * 60 * 60 * 1000);
            return sales.filter(s => (s._timestamp || getSaleTimestamp(s)) >= cutoff);
        }

        function estimateProfitLoss(sale) {
            const costFactor = 0.60;
            let totalCost = 0,
                totalRevenue = 0;
            (sale.items || []).forEach(item => {
                const price = Number(item.price) || 0;
                const qty = Number(item.qty) || 0;
                totalRevenue += price * qty;
                totalCost += (price * costFactor) * qty;
            });
            const discount = Number(sale.discount) || 0;
            const revenueAfterDisc = totalRevenue - discount;
            const profit = revenueAfterDisc - totalCost;
            return { profit: Math.max(0, profit), loss: profit < 0 ? Math.abs(profit) : 0, revenueAfterDisc };
        }

        function refreshReport() {
            const hours = parseInt(document.getElementById('reportTimeRange').value);
            let allSales = getSales();

            // Filter out revoked sales
            const revoked = getRevoked();
            allSales = allSales.filter(s => {
                const isRevoked = revoked.find(r => r.saleId === s.id) || s.revoked;
                return !isRevoked;
            });

            // Normalize timestamps
            allSales = allSales.map(s => {
                if (!s._timestamp) s._timestamp = getSaleTimestamp(s);
                return s;
            });

            const sorted = [...allSales].sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
            const filtered = hours === 0 ? sorted : filterSalesByRange(sorted, hours);

            // Calculate stats
            let tx = filtered.length,
                gross = 0,
                discount = 0,
                net = 0,
                profit = 0,
                loss = 0;
            filtered.forEach(s => {
                const g = Number(s.total) || 0;
                const d = Number(s.discount) || 0;
                gross += g;
                discount += d;
                net += (g - d);
                const est = estimateProfitLoss(s);
                profit += est.profit;
                loss += est.loss;
            });

            document.getElementById('reportTx').innerText = tx;
            document.getElementById('reportNet').innerText = `KES ${net.toFixed(2)}`;
            document.getElementById('reportGross').innerText = `KES ${gross.toFixed(2)}`;
            document.getElementById('reportDisc').innerText = `KES ${discount.toFixed(2)}`;
            document.getElementById('reportProfit').innerText = `KES ${profit.toFixed(2)}`;
            document.getElementById('reportLoss').innerText = `KES ${loss.toFixed(2)}`;

            // Render table
            const tbody = document.getElementById('reportBody');
            if (filtered.length === 0) {
                tbody.innerHTML =
                `<tr><td colspan="8" style="text-align:center;padding:40px;color:#6a8aaa;">No sales in this period</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            filtered.forEach((sale, idx) => {
                const est = estimateProfitLoss(sale);
                const netVal = (Number(sale.total) || 0) - (Number(sale.discount) || 0);
                const statusClass = est.profit > 0 ? 'success' : (est.profit === 0 ? 'warning' : 'danger');
                const statusText = est.profit > 0 ? 'Profit' : (est.profit === 0 ? 'Neutral' : 'Loss');

                let displayDate = sale.date || new Date(sale._timestamp).toLocaleDateString();
                let displayTime = sale.time || new Date(sale._timestamp).toLocaleTimeString();

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${idx + 1}</td>
                    <td><strong>${displayDate}</strong> ${displayTime}</td>
                    <td>${sale.customer || 'Guest'}</td>
                    <td>${(sale.items || []).length}</td>
                    <td>${(Number(sale.total) || 0).toFixed(2)}</td>
                    <td>${(Number(sale.discount) || 0).toFixed(2)}</td>
                    <td>${netVal.toFixed(2)}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                `;
                tbody.appendChild(row);
            });
        }

        function downloadPDFReport() {
            const element = document.querySelector('#page-reports');
            const opt = {
                margin: 0.5,
                filename: `Sales_Report_${new Date().toISOString().slice(0,10)}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'a3', orientation: 'landscape' }
            };
            html2pdf().set(opt).from(element).save();
            logAudit('Report', 'Downloaded PDF report');
        }

        function downloadExcelReport() {
            const hours = parseInt(document.getElementById('reportTimeRange').value);
            let allSales = getSales();
            const revoked = getRevoked();
            allSales = allSales.filter(s => !(revoked.find(r => r.saleId === s.id) || s.revoked));
            allSales = allSales.map(s => { if (!s._timestamp) s._timestamp = getSaleTimestamp(s); return s; });
            const sorted = [...allSales].sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
            const filtered = hours === 0 ? sorted : filterSalesByRange(sorted, hours);

            if (filtered.length === 0) { alert('No data to export'); return; }

            const data = filtered.map((s, idx) => {
                const est = estimateProfitLoss(s);
                return {
                    '#': idx + 1,
                    'Date': s.date || new Date(s._timestamp).toLocaleDateString(),
                    'Time': s.time || new Date(s._timestamp).toLocaleTimeString(),
                    'Customer': s.customer || 'Guest',
                    'Items': (s.items || []).length,
                    'Gross': Number(s.total) || 0,
                    'Discount': Number(s.discount) || 0,
                    'Net': (Number(s.total) - Number(s.discount)) || 0,
                    'Profit': est.profit,
                    'Loss': est.loss,
                    'Status': est.profit > 0 ? 'Profit' : (est.profit === 0 ? 'Neutral' : 'Loss')
                };
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Sales');
            XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
            logAudit('Report', 'Downloaded Excel report');
        }

        // ---------- GLOBAL SEARCH ----------
        function globalSearch() {
            const q = document.getElementById('globalSearch').value.toLowerCase();
            if (q.length > 2) {
                const products = getProducts();
                const found = products.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
                if (found.length > 0) {
                    navigateTo('pos');
                    document.getElementById('productSearch').value = q;
                    filterProducts();
                }
            }
        }

        // ---------- BARCODE SCANNER ----------
   
addToCart// ---------- BARCODE SCANNER ----------
const barcodeInput = document.getElementById('productSearch');

if (barcodeInput) {
    setInterval(() => {
        // Only focus if no input/textarea/select is currently focused
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && 
            (activeElement.tagName === 'INPUT' || 
             activeElement.tagName === 'TEXTAREA' || 
             activeElement.tagName === 'SELECT');
        
        if (!isInputFocused && document.activeElement !== barcodeInput) {
            barcodeInput.focus();
        }
    }, 300);

    barcodeInput.addEventListener('keydown', async function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const code = this.value.trim();
        if (!code) return;
        const products = await getProducts();
        const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
        if (product) {
            addToCart(product.code);
            this.value = '';
        } else {
            notify('Product not found', 'Barcode');
            this.select();
        }
    });
}

        // ---------- INITIALIZATION ----------
        async function initSystem() {
              // Load all data from IndexedDB into memory FIRST
    await loadCacheFromDB();
            // Load theme
            loadTheme();

            // Check for existing accounts
            const users = getUsers();
            if (users.length === 0) {
                // No users, show create account modal
                setTimeout(() => {
                    notify('No account found. Please create one.', 'Setup Required');
                    openCreateAccount();
                }, 500);
            } else {
                // Auto-login as first user (for demo)
                currentUser = users[0];
                updateUserUI();
                const config = getConfig();
                if (config.shopName) {
                    document.getElementById('shopNameDisplay').innerText = config.shopName;
                }
            }

            // Load categories
            const categories = getCategories();
            if (categories.length === 0) {
                // Seed default categories
                const defaultCats = ['Confectionery', 'Groceries', 'Personal Care', 'Beverages', 'Household', 'Dairy',
                    'Stationary', 'Electronics', 'Furnitures'
                ];
                saveCategories(defaultCats);
            }

            // Seed products if empty
       if (getProducts().length === 0) {
                const products = [
                    { code: 'CAD-DM-090', name: 'Cadbury Dairy Milk 90g', category: 'Confectionery', price: 195,
                        stock: 50, vat: '16%' },
                    { code: 'IND-NC-070', name: 'Indomie Noodles Chicken 70g', category: 'Groceries', price: 35,
                        stock: 100, vat: '16%' },
                    { code: 'DET-AS-125', name: 'Dettol Antibacterial Soap', category: 'Personal Care', price: 165,
                        stock: 30, vat: '16%' },
                    { code: 'SAF-AIR-100', name: 'Safaricom Airtime KES 100', category: 'Beverages', price: 100,
                        stock: 200, vat: '16%' },
                    { code: 'OMO-WP-1KG', name: 'Omo Washing Powder 1kg', category: 'Household', price: 420, stock: 25,
                        vat: '16%' },
                    { code: 'TUS-ML-500', name: 'Tusker Malt Lager 500ml', category: 'Beverages', price: 250, stock: 60,
                        vat: '16%' },
                    { code: 'KET-TB-050', name: 'Ketepa Pride Tea Bags 50s', category: 'Groceries', price: 195,
                        stock: 40, vat: '16%' },
                    { code: 'MIL-1L-F', name: 'Fresh Milk 1L', category: 'Dairy', price: 120, stock: 80, vat: '16%' },
                    { code: 'YOG-500', name: 'Yogurt 500ml', category: 'Dairy', price: 90, stock: 45, vat: '16%' }
                ];
                saveProducts(products);
            }

            // Initial render
            refreshDashboard();
            renderProducts();
            renderCategories();
            loadStock();
            loadCustomers();
            loadInvoices();
            loadExpenses();
            refreshReport();
            loadSettings();
            updateLockedNavUI();

            // Auto-refresh
            setInterval(() => {
                refreshDashboard();
                refreshReport();
            }, 60000);

            logAudit('System', 'System initialized');

            console.log('🚀 Tech_By_Prince Systems loaded successfully!');
        }
// ============================================================
//  CASH CALCULATOR
// ============================================================

let calcMode = 'auto';       // 'auto' | 'manual'
let calcExpr = '';           // expression buffer (manual mode)
let calcCartTotal = 0;       // snapshot of cart total when opened

// ---------- Open / Close ----------
async function openCalculator() {
    // Compute cart total
    calcCartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Reset state
    calcMode = 'auto';
    calcExpr = '';

    document.getElementById('calcModal').classList.add('show');

    // Auto mode UI
    setCalcMode('auto');
    document.getElementById('calcDisplay').innerText = formatMoney(calcCartTotal);
    document.getElementById('calcSubDisplay').innerText = 'Cart Total';
    document.getElementById('calcCashInput').value = '';
    updateChangeDue();

    // Load history
    await loadCalcHistory();

    // Focus cash input after a tick
    setTimeout(() => document.getElementById('calcCashInput').focus(), 100);
}

function closeCalculator() {
    document.getElementById('calcModal').classList.remove('show');
    calcExpr = '';
    calcMode = 'auto';
}

// ---------- Mode switching ----------
function setCalcMode(mode) {
    calcMode = mode;
    const label = document.getElementById('calcModeLabel');
    const cashSection = document.getElementById('calcCashSection');

    if (mode === 'auto') {
        label.innerText = 'AUTO — Cart Total';
        label.classList.remove('manual');
        label.classList.add('auto');
        cashSection.classList.remove('hidden');
    } else {
        label.innerText = 'MANUAL — Free Calculate';
        label.classList.remove('auto');
        label.classList.add('manual');
        cashSection.classList.add('hidden');
    }
}

// ---------- Cash input & change calculation ----------
function updateChangeDue() {
    const cash = parseFloat(document.getElementById('calcCashInput').value) || 0;
    const box = document.getElementById('calcChangeDue');
    const label = document.getElementById('calcChangeLabel');
    const value = document.getElementById('calcChangeValue');

    if (cash <= 0) {
        box.classList.remove('good', 'bad');
        label.innerText = 'Change Due:';
        value.innerText = 'KES 0.00';
        return;
    }

    const diff = cash - calcCartTotal;
    if (diff >= 0) {
        box.classList.remove('bad');
        box.classList.add('good');
        label.innerText = 'Change:';
        value.innerText = 'KES ' + formatMoney(diff);
    } else {
        box.classList.remove('good');
        box.classList.add('bad');
        label.innerText = 'Remaining:';
        value.innerText = 'KES ' + formatMoney(Math.abs(diff));
    }
}

// Wire up the cash input event
document.addEventListener('DOMContentLoaded', () => {
    const cashInput = document.getElementById('calcCashInput');
    if (cashInput) cashInput.addEventListener('input', updateChangeDue);
});

// ---------- Manual mode reset ----------
function calcReset() {
    // Back to auto mode
    setCalcMode('auto');
    calcExpr = '';
    calcCartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    document.getElementById('calcDisplay').innerText = formatMoney(calcCartTotal);
    document.getElementById('calcSubDisplay').innerText = 'Cart Total';
    document.getElementById('calcCashInput').value = '';
    document.getElementById('calcCashInput').focus();
    updateChangeDue();
}

// ---------- Manual clear ----------
function calcClear() {
    calcExpr = '';
    document.getElementById('calcDisplay').innerText = '0';
    document.getElementById('calcSubDisplay').innerText = '';
}

// ---------- Key press ----------
function calcPress(key) {
    // When key pressed in AUTO mode, switch to manual (except enter/backspace/cash field)
    if (calcMode === 'auto') {
        if (key === 'C') { calcClear(); setCalcMode('manual'); return; }
        if (key === '⌫') {
            const inp = document.getElementById('calcCashInput');
            inp.value = inp.value.slice(0, -1);
            updateChangeDue();
            return;
        }
        // Any other key → enter manual mode and seed with that key
        setCalcMode('manual');
        calcExpr = '';
    }

    // MANUAL MODE logic
    if (key === 'C') { calcClear(); return; }

    if (key === '⌫') {
        calcExpr = calcExpr.slice(0, -1);
        document.getElementById('calcDisplay').innerText = calcExpr || '0';
        return;
    }

    if (key === '=') {
        if (!calcExpr.trim()) return;
        try {
            const result = safeEval(calcExpr);
            document.getElementById('calcSubDisplay').innerText = calcExpr + ' =';
            document.getElementById('calcDisplay').innerText = formatMoney(result);
            calcExpr = String(result);
        } catch (e) {
            document.getElementById('calcSubDisplay').innerText = 'Error';
        }
        return;
    }

    // Numbers, operators, dot
    // Prevent double operators like "++"
    const operators = ['+', '-', '*', '/'];
    const last = calcExpr.slice(-1);
    if (operators.includes(key) && operators.includes(last)) {
        calcExpr = calcExpr.slice(0, -1) + key;
    } else {
        calcExpr += key;
    }

    document.getElementById('calcDisplay').innerText = calcExpr || '0';
}

// ---------- Safe expression evaluator (no eval) ----------
function safeEval(expr) {
    // Tokenize
    const tokens = expr.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens) throw new Error('Invalid');

    // First pass: * and /
    const pass1 = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (t === '*' || t === '/') {
            const prev = parseFloat(pass1.pop());
            const next = parseFloat(tokens[i + 1]);
            if (isNaN(prev) || isNaN(next)) throw new Error('Invalid');
            pass1.push(t === '*' ? prev * next : prev / next);
            i += 2;
        } else {
            pass1.push(t);
            i++;
        }
    }

    // Second pass: + and -
    let result = parseFloat(pass1[0]);
    for (let j = 1; j < pass1.length; j += 2) {
        const op = pass1[j];
        const val = parseFloat(pass1[j + 1]);
        if (op === '+') result += val;
        else if (op === '-') result -= val;
    }

    if (isNaN(result) || !isFinite(result)) throw new Error('Invalid');
    return Math.round(result * 100) / 100;
}

// ---------- Complete sale from calculator ----------
async function calcCompleteSale() {
    if (calcMode !== 'auto') return;

    const cash = parseFloat(document.getElementById('calcCashInput').value) || 0;

    if (cash < calcCartTotal) {
        notify('Cash received is less than total', 'Insufficient Cash');
        return;
    }

    if (cart.length === 0) {
        notify('Cart is empty', 'Warning');
        return;
    }

    // Fire the normal sale process
    await completeSale();

    // Close calculator after sale
    closeCalculator();
}

// ---------- Keyboard handler ----------
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('calcModal');
    if (!modal.classList.contains('show')) return;

    const active = document.activeElement;
    const isCashInputFocused = active && active.id === 'calcCashInput';

    // Esc closes
    if (e.key === 'Escape') { closeCalculator(); return; }

    // Enter
    if (e.key === 'Enter') {
        e.preventDefault();
        if (calcMode === 'auto') {
            calcCompleteSale();
        } else {
            calcPress('=');
        }
        return;
    }

    // Delete = clear
    if (e.key === 'Delete') {
        e.preventDefault();
        calcClear();
        if (calcMode === 'auto') setCalcMode('manual');
        return;
    }

    // Backspace
    if (e.key === 'Backspace') {
        // In auto mode with cash field focused, let the field handle it
        if (calcMode === 'auto' && isCashInputFocused) return;
        e.preventDefault();
        calcPress('⌫');
        return;
    }

    // Numbers / operators / dot
    if (/^[0-9.+\-*/]$/.test(e.key)) {
        if (calcMode === 'auto' && isCashInputFocused) return; // let input handle it
        e.preventDefault();
        calcPress(e.key);
        return;
    }
});

// ---------- Click handlers on keypad buttons ----------
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            calcPress(key);
        });
    });

    // Click outside to close
    const modal = document.getElementById('calcModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'calcModal') closeCalculator();
        });
    }
});

// ---------- History loader ----------
async function loadCalcHistory() {
    const list = document.getElementById('calcHistoryList');
    if (!list) return;

    const sales = await getSales();
    const recent = sales.slice(-5).reverse();

    if (recent.length === 0) {
        list.innerHTML = '<div class="calc-history-empty">No sales yet</div>';
        return;
    }

    list.innerHTML = recent.map(s => {
        const inv = s.sale_id || `INV-${String(s.id || '').slice(-6)}`;
        const amt = formatMoney(Number(s.total) || 0);
        const time = s.sale_time
            ? String(s.sale_time).slice(0, 5)
            : new Date(s.timestamp || s.created_at || Date.now()).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="calc-history-row">
                <span class="inv">#${inv}</span>
                <span class="amt">KES ${amt}</span>
                <span class="time">${time}</span>
            </div>
        `;
    }).join('');
}

// ---------- Utility ----------
function formatMoney(n) {
    return Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// ============================================================
//  CART FOCUS MODE (expand / minimise toggle)
// ============================================================

const CART_FOCUS_KEY = 'tb_cart_focus';

function toggleCartExpand() {
    const container = document.querySelector('.pos-container');
    if (!container) return;

    const isFocused = container.classList.toggle('focus-cart');

    // Persist preference
    try { localStorage.setItem(CART_FOCUS_KEY, isFocused ? '1' : '0'); } catch {}

    updateCartExpandUI(isFocused);
}

function updateCartExpandUI(isFocused) {
    const btn = document.getElementById('cartExpandBtn');
    const icon = document.getElementById('cartExpandIcon');
    const label = document.getElementById('cartExpandLabel');
    if (!btn || !icon || !label) return;

    if (isFocused) {
        icon.className = 'fa fa-compress';
        label.textContent = 'Show Products';
        btn.classList.add('active');
        btn.title = 'Back to product view (F2)';
    } else {
        icon.className = 'fa fa-expand';
        label.textContent = 'Focus Cart';
        btn.classList.remove('active');
        btn.title = 'Expand cart full-width (F2)';
    }
}

// Restore on load
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(CART_FOCUS_KEY) === '1';
    if (saved) {
        const container = document.querySelector('.pos-container');
        if (container) container.classList.add('focus-cart');
        updateCartExpandUI(true);
    } else {
        updateCartExpandUI(false);
    }
});

// Keyboard shortcut: F2
document.addEventListener('keydown', (e) => {
    // Only trigger on POS page
    const posPage = document.getElementById('page-pos');
    if (!posPage || !posPage.classList.contains('active')) return;

    // Ignore if user is typing in an input
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    if (e.key === 'F2') {
        e.preventDefault();
        toggleCartExpand();
    }
});
        // ---------- START ----------
        document.addEventListener('DOMContentLoaded', initSystem);
        
        window.addEventListener('beforeunload', (e) => {
  // Best-effort flush — the browser will wait a moment
  if (!_ready) return;
  // Writes are already queued; this just gives them a tick
});

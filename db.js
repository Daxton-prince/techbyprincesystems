// db.js — IndexedDB layer for Tech_By_Prince POS
const db = new Dexie('tb_pos_db');

db.version(1).stores({
  products:   '++id, code, name, category',
  sales:      '++id, timestamp, customer, synced',
  customers:  '++id, name',
  expenses:   '++id, timestamp, type',
  revoked:    '++id, saleId, timestamp',
  audit:      '++id, timestamp',
  users:      '++id, phone',
  categories: '&name',
  config:     '&key',
  security:   '&key',
  lockedNavs: '&key'
});

// ---------- Migration from localStorage (one-time) ----------
async function migrateFromLocalStorage() {
  const flag = await db.config.get('singleton');
  if (flag && flag.value && flag.value.migrated) return;

  const readArr = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const readObj = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };

  const K = {
    PRODUCTS: 'tb_products', SALES: 'tb_sales', CUSTOMERS: 'tb_customers',
    EXPENSES: 'tb_expenses', REVOKED: 'tb_revoked', AUDIT: 'tb_audit',
    USERS: 'tb_users', CONFIG: 'tb_config', LOCKED_NAVS: 'tb_locked_navs',
    SECURITY: 'tb_security', CATEGORIES: 'tb_categories'
  };

  const products = readArr(K.PRODUCTS);
  if (products.length) await db.products.bulkPut(products);

  const sales = readArr(K.SALES);
  if (sales.length) await db.sales.bulkPut(sales);

  const customers = readArr(K.CUSTOMERS);
  if (customers.length) await db.customers.bulkPut(customers);

  const expenses = readArr(K.EXPENSES);
  if (expenses.length) await db.expenses.bulkPut(expenses);

  const revoked = readArr(K.REVOKED);
  if (revoked.length) await db.revoked.bulkPut(revoked);

  const audit = readArr(K.AUDIT);
  if (audit.length) await db.audit.bulkPut(audit);

  const users = readArr(K.USERS);
  if (users.length) await db.users.bulkPut(users);

  const categories = readArr(K.CATEGORIES);
  if (categories.length) {
    const rows = categories.map(c => typeof c === 'string' ? { name: c } : c).filter(c => c && c.name);
    if (rows.length) await db.categories.bulkPut(rows);
  }

  const config = readObj(K.CONFIG);
  const security = readObj(K.SECURITY);
  const locked = readArr(K.LOCKED_NAVS);

  await db.config.put({ key: 'singleton', value: { ...config, migrated: true } });
  await db.security.put({ key: 'singleton', value: security });
  await db.lockedNavs.put({ key: 'singleton', value: locked });

  console.log('✅ Migrated from localStorage → IndexedDB');
}
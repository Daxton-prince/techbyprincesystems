// ============================================================
//  backup.js — Data export/import for Tech_By_Prince POS
//  Uses the existing cache layer. No changes to other files.
// ============================================================

// ---------- EXPORT ----------
function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shopName: (getConfig().shopName) || 'Unknown',
    data: {
      products:   getProducts(),
      sales:      getSales(),
      customers:  getCustomers(),
      expenses:   getExpenses(),
      revoked:    getRevoked(),
      users:      getUsers(),
      categories: getCategories(),
      config:     getConfig(),
      security:   getSecurity(),
      lockedNavs: getLockedNavs(),
      audit:      getAudit(),
      expenseTypes: getData('expense_types')
    }
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `tb_pos_backup_${timestamp}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  logAudit('Backup', `Exported backup: ${filename}`);
  notify('Backup downloaded successfully', 'Success');
}

// ---------- IMPORT ----------
function importBackup() {
  // Create a hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';

  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        restoreBackup(data);
      } catch (err) {
        console.error('Backup parse error:', err);
        notify('Invalid backup file', 'Error');
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

// ---------- RESTORE ----------
function restoreBackup(backup) {
  // Validate shape
  if (!backup || typeof backup !== 'object') {
    notify('Invalid backup: not an object', 'Error');
    return;
  }
  if (!backup.data || typeof backup.data !== 'object') {
    notify('Invalid backup: missing data section', 'Error');
    return;
  }
  if (backup.version !== 1) {
    notify('Unsupported backup version', 'Error');
    return;
  }

  const d = backup.data;

  // Confirm before wiping
  const summary = [
    `Products: ${(d.products || []).length}`,
    `Sales: ${(d.sales || []).length}`,
    `Customers: ${(d.customers || []).length}`,
    `Expenses: ${(d.expenses || []).length}`,
    `Users: ${(d.users || []).length}`
  ].join('\n');

  const confirmed = confirm(
    `This will REPLACE all current data with the backup.\n\n` +
    `Backup contents:\n${summary}\n\n` +
    `Exported: ${backup.exportedAt}\n\n` +
    `Continue?`
  );
  if (!confirmed) return;

  // Restore via existing save functions (they handle cache + IndexedDB)
  if (Array.isArray(d.products))   saveProducts(d.products);
  if (Array.isArray(d.sales))      saveSales(d.sales);
  if (Array.isArray(d.customers))  saveCustomers(d.customers);
  if (Array.isArray(d.expenses))   saveExpenses(d.expenses);
  if (Array.isArray(d.revoked))    saveRevoked(d.revoked);
  if (Array.isArray(d.users))      saveUsers(d.users);
  if (Array.isArray(d.categories)) saveCategories(d.categories);
  if (Array.isArray(d.audit))      saveAudit(d.audit);
  if (d.config)                    setConfig(d.config);
  if (d.security)                  setSecurity(d.security);
  if (Array.isArray(d.lockedNavs)) setLockedNavs(d.lockedNavs);
  if (Array.isArray(d.expenseTypes)) setData('expense_types', d.expenseTypes);

  logAudit('Backup', `Restored backup from ${backup.exportedAt}`);
  notify('Backup restored successfully. Reloading...', 'Success');

  setTimeout(() => location.reload(), 1500);
}
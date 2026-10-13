// ---------- KEYBOARD SHORTCUTS ----------
document.addEventListener('keydown', function(e) {
    const activeElement = document.activeElement;
    const isFormField = activeElement && 
        (activeElement.tagName === 'INPUT' || 
         activeElement.tagName === 'TEXTAREA' || 
         activeElement.tagName === 'SELECT');
    
    if (isFormField) return;
    
    // ENTER key handler
    if (e.key === 'Enter') {
        e.preventDefault();
        
        // Define all Enter-triggered functions
        const enterActions = [
            'completeSale()',
            'saveProduct()',
            'saveSupplier()',
            'changePin()',
            'saveSecuritySettings()',
            'createAccount()',
            'saveExpense()',
            'revokeSale()',
            'unlockNavigation()'
        ];
        
        // Build selector from the list
        const selectors = enterActions.map(action => 
            `[onclick*="${action}"]`
        ).join(', ');
        
        const visibleBtn = findFirstVisible(selectors);
        if (visibleBtn) {
            visibleBtn.click();
            return;
        }
        
        // If no specific action found, try generic submit buttons
        const genericBtn = document.querySelector(
            '.btn-primary:not([style*="display: none"]), ' +
            '.btn-save:not([style*="display: none"]), ' +
            '.btn-submit:not([style*="display: none"])'
        );
        if (genericBtn) {
            genericBtn.click();
        }
    }
    
    // ESC key handler
    if (e.key === 'Escape') {
        e.preventDefault();
        
        // Define all ESC-triggered functions
        const escActions = [
            'closelockOverlay()',
            'closeRevokeModal()',
            'closeExpenseModal()',
            'closeAuditModal()',
            'closeAccountModal()',
            'closeSecurityModal()',
            'closePinModal()',
            'closeNotify()',
            'closeSupplierDetail()',
            'closeSupplierModal()',
            'closeProduct()'
        ];
        
        // Build selector from the list
        const selectors = escActions.map(action => 
            `[onclick*="${action}"]`
        ).join(', ');
        
        const visibleBtn = findFirstVisible(selectors);
        if (visibleBtn) {
            visibleBtn.click();
            return;
        }
        
        // If no specific close found, try generic close buttons
        const genericClose = document.querySelector(
            '.modal .close:not([style*="display: none"]), ' +
            '.btn-close:not([style*="display: none"]), ' +
            '.modal-overlay:not([style*="display: none"])'
        );
        if (genericClose) {
            genericClose.click();
        }
    }
});



// Helper function to find first visible element
function findFirstVisible(selectors) {
    const elements = document.querySelectorAll(selectors);
    for (const el of elements) {
        if (el.offsetParent !== null) { // Element is visible
            return el;
        }
    }
    return null;
}
// ---------- SHIFT+ENTER TO COMPLETE SALE ----------
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        completeSale();
    }
});
document.addEventListener('keydown', (e) => {
    const isCtrlC = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
    if (!isCtrlC) return;

    // If selection exists in a field, allow copy
    const active = document.activeElement;
    const inTextField = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
    );
    const hasSelection =
        inTextField && (
            (typeof active.selectionStart === 'number' &&
             active.selectionStart !== active.selectionEnd) ||
            window.getSelection().toString().length > 0
        );
    if (hasSelection) return;

    e.preventDefault();

    // Toggle behavior
    const modal = document.getElementById('calcModal');
    if (modal.classList.contains('show')) {
        closeCalculator();
    } else {
        openCalculator();
    }
});
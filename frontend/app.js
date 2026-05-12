// ============================================================================
// Phase 1 Frontend — Thin Bootstrap
// ============================================================================

// Global state — shared across modules
let products = [];
let stores = [];
let historyInitialized = false;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initializeDateField();
  loadProductsAndStores();
  setupDrawerNavigation();
  setupPurchaseForm();
  setupNewProductForm();
  setupPantryForm();
  setupStoresForm();
  setupDashboard();
  setupHistory();
  initializeDashboard();
  renderCart();
});

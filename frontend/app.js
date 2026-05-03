// ============================================================================
// Phase 1 Frontend — Thin Bootstrap
// ============================================================================

// Global state — shared across modules
let products = [];
let stores = [];

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
  initializeDashboard();
  renderCart();
});

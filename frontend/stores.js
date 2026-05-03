// ============================================================================
// Stores Section
// ============================================================================

function setupStoresForm() {
  const form = document.getElementById("add-store-form");
  form.addEventListener("submit", handleAddStore);
}

function renderStoresList(storeList) {
  const container = document.getElementById("stores-list");
  if (!storeList || storeList.length === 0) {
    container.innerHTML = '<div class="product-empty">No stores yet.</div>';
    return;
  }
  container.innerHTML = storeList.map(store => `
    <div class="store-card">
      <span class="store-name">${escapeHtml(store.name)}</span>
    </div>
  `).join("");
}

function populateProductDropdown() {
  const select = document.getElementById("purchase-product");
  // Clear existing (except default option)
  while (select.options.length > 1) {
    select.remove(1);
  }
  // Add products
  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = product.name;
    if (product.brand) {
      option.textContent += ` (${product.brand})`;
    }
    option.dataset.unit = product.unit || '';
    select.appendChild(option);
  });

  // Trigger change event to update quantity field visibility
  document.getElementById("purchase-product").dispatchEvent(new Event("change"));
}

function populateStoreDropdown() {
  const select = document.getElementById("purchase-store");
  // Clear (keep the "no store" option)
  while (select.options.length > 1) {
    select.remove(1);
  }
  // Add stores
  stores.forEach((store) => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    select.appendChild(option);
  });
}

// Phase 1 frontend: Log purchases and manage pantry inventory.

// State
let products = [];
let stores = [];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initializeDateField();
  loadProductsAndStores();
  setupTabNavigation();
  setupPurchaseForm();
  setupNewProductForm();
  setupPantryForm();
});

// ============================================================================
// Initialization
// ============================================================================

function initializeDateField() {
  const dateInput = document.getElementById("purchase-date");
  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;
}

async function loadProductsAndStores() {
  try {
    const [productsRes, storesRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/products`),
      fetch(`${BACKEND_URL}/api/stores`)
    ]);

    if (!productsRes.ok || !storesRes.ok) {
      throw new Error("Failed to load products or stores");
    }

    products = await productsRes.json();
    stores = await storesRes.json();

    populateProductDropdown();
    populateStoreDropdown();
  } catch (err) {
    showError("log-purchase-error", `Failed to load data: ${err.message}`);
  }
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

// ============================================================================
// Tab Navigation
// ============================================================================

function setupTabNavigation() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update button active states
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  // Update tab content visibility
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === tabName);
  });

  // Load pantry data when switching to pantry tab
  if (tabName === "pantry") {
    loadPantryProducts();
  }
}

// ============================================================================
// Purchase Form
// ============================================================================

function setupPurchaseForm() {
  const form = document.getElementById("purchase-form");
  form.addEventListener("submit", (e) => handlePurchaseSubmit(e));

  // Add change listener to product dropdown to show/hide quantity field
  document.getElementById("purchase-product").addEventListener("change", function() {
    const selectedOption = this.options[this.selectedIndex];
    const unit = selectedOption.dataset.unit;
    const quantityGroup = document.getElementById("purchase-quantity-group");
    const unitLabel = document.getElementById("purchase-quantity-unit");
    if (unit) {
      quantityGroup.style.display = '';
      unitLabel.textContent = unit;
    } else {
      quantityGroup.style.display = 'none';
      document.getElementById("purchase-quantity").value = '';
    }
  });
}

async function handlePurchaseSubmit(e) {
  e.preventDefault();

  const productSelect = document.getElementById("purchase-product");
  const storeSelect = document.getElementById("purchase-store");
  const dateInput = document.getElementById("purchase-date");
  const quantityInput = document.getElementById("purchase-quantity");
  const priceInput = document.getElementById("purchase-price");
  const notesInput = document.getElementById("purchase-notes");

  // Validate
  if (!productSelect.value) {
    showError("log-purchase-error", "Please select a product.");
    return;
  }

  // Validate quantity only if the quantity field is visible
  const quantityGroup = document.getElementById("purchase-quantity-group");
  const quantityVisible = quantityGroup.style.display !== 'none';
  if (quantityVisible) {
    const quantity = parseFloat(quantityInput.value);
    if (!quantity || quantity <= 0) {
      showError("log-purchase-error", "Quantity must be greater than 0.");
      return;
    }
  }

  const price = parseFloat(priceInput.value);

  if (!price || price <= 0) {
    showError("log-purchase-error", "Price must be greater than 0.");
    return;
  }

  clearError("log-purchase-error");

  const submitBtn = document.getElementById("purchase-submit");
  submitBtn.disabled = true;

  try {
    const payload = {
      product_id: parseInt(productSelect.value),
      store_id: storeSelect.value ? parseInt(storeSelect.value) : null,
      date: dateInput.value,
      quantity: quantityInput.value ? parseFloat(quantityInput.value) : null,
      price_total: price,
      notes: notesInput.value || null
    };

    const response = await fetch(`${BACKEND_URL}/api/purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || "Failed to log purchase";
      throw new Error(errorMsg);
    }

    // Success
    showSuccess("log-purchase-success", "Purchase logged ✓");
    // Clear quantity, price, notes; keep product, store, date for repeat entry
    quantityInput.value = "";
    priceInput.value = "";
    notesInput.value = "";
    quantityInput.focus();
  } catch (err) {
    showError("log-purchase-error", `Error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

// ============================================================================
// Inline New Product Form
// ============================================================================

function setupNewProductForm() {
  const toggleBtn = document.getElementById("new-product-toggle");
  const container = document.getElementById("new-product-form-container");
  const saveBtn = document.getElementById("save-new-product");
  const cancelBtn = document.getElementById("cancel-new-product");

  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    container.classList.toggle("hidden");
  });

  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleSaveNewProduct();
  });

  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    container.classList.add("hidden");
    clearNewProductForm();
  });
}

async function handleSaveNewProduct() {
  const nameInput = document.getElementById("new-product-name");
  const brandInput = document.getElementById("new-product-brand");
  const caloriesInput = document.getElementById("new-product-calories");
  const proteinInput = document.getElementById("new-product-protein");
  const carbsInput = document.getElementById("new-product-carbs");
  const fatInput = document.getElementById("new-product-fat");
  const notesInput = document.getElementById("new-product-notes");
  const categoryInput = document.getElementById("new-product-category");
  const unitInput = document.getElementById("new-product-unit");
  const errorEl = document.getElementById("new-product-error");

  const name = nameInput.value.trim();
  if (!name) {
    showError("new-product-error", "Product name is required.");
    return;
  }

  const category = categoryInput.value;
  const unit = unitInput.value;

  if (category === 'grocery' && !unit) {
    showError("new-product-error", "Tip: no unit set — nutrition won't be tracked for this product. You can edit this later.");
  } else {
    clearError("new-product-error");
  }

  const saveBtn = document.getElementById("save-new-product");
  saveBtn.disabled = true;

  try {
    const payload = {
      name,
      brand: brandInput.value.trim() || null,
      calories_per_100g: caloriesInput.value ? parseFloat(caloriesInput.value) : null,
      protein_per_100g: proteinInput.value ? parseFloat(proteinInput.value) : null,
      carbs_per_100g: carbsInput.value ? parseFloat(carbsInput.value) : null,
      fat_per_100g: fatInput.value ? parseFloat(fatInput.value) : null,
      notes: notesInput.value.trim() || null,
      category: category,
      unit: unit || null
    };

    const response = await fetch(`${BACKEND_URL}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || "Failed to create product";
      throw new Error(errorMsg);
    }

    const newProduct = await response.json();
    products.push(newProduct);
    populateProductDropdown();

    // Auto-select the new product
    document.getElementById("purchase-product").value = newProduct.id;

    // Hide form and clear
    document.getElementById("new-product-form-container").classList.add("hidden");
    clearNewProductForm();

    // Show success in the main purchase form area
    showSuccess("log-purchase-success", "Product added ✓");
  } catch (err) {
    showError("new-product-error", `Error: ${err.message}`);
  } finally {
    saveBtn.disabled = false;
  }
}

function clearNewProductForm() {
  document.getElementById("new-product-name").value = "";
  document.getElementById("new-product-brand").value = "";
  document.getElementById("new-product-calories").value = "";
  document.getElementById("new-product-protein").value = "";
  document.getElementById("new-product-carbs").value = "";
  document.getElementById("new-product-fat").value = "";
  document.getElementById("new-product-notes").value = "";
  document.getElementById("new-product-category").value = "grocery";
  document.getElementById("new-product-unit").value = "";
  clearError("new-product-error");
}

// ============================================================================
// Pantry Tab
// ============================================================================

function setupPantryForm() {
  const form = document.getElementById("pantry-product-form");
  form.addEventListener("submit", (e) => handlePantryProductSubmit(e));
}

async function handlePantryProductSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById("pantry-product-name");
  const brandInput = document.getElementById("pantry-product-brand");
  const caloriesInput = document.getElementById("pantry-product-calories");
  const proteinInput = document.getElementById("pantry-product-protein");
  const carbsInput = document.getElementById("pantry-product-carbs");
  const fatInput = document.getElementById("pantry-product-fat");
  const notesInput = document.getElementById("pantry-product-notes");
  const categoryInput = document.getElementById("pantry-product-category");
  const unitInput = document.getElementById("pantry-product-unit");

  const name = nameInput.value.trim();
  if (!name) {
    showError("pantry-error", "Product name is required.");
    return;
  }

  const category = categoryInput.value;
  const unit = unitInput.value;

  if (category === 'grocery' && !unit) {
    showError("pantry-error", "Tip: no unit set — nutrition won't be tracked for this product. You can edit this later.");
  } else {
    clearError("pantry-error");
  }

  const submitBtn = document.getElementById("pantry-submit");
  submitBtn.disabled = true;

  try {
    const payload = {
      name,
      brand: brandInput.value.trim() || null,
      calories_per_100g: caloriesInput.value ? parseFloat(caloriesInput.value) : null,
      protein_per_100g: proteinInput.value ? parseFloat(proteinInput.value) : null,
      carbs_per_100g: carbsInput.value ? parseFloat(carbsInput.value) : null,
      fat_per_100g: fatInput.value ? parseFloat(fatInput.value) : null,
      notes: notesInput.value.trim() || null,
      category: category,
      unit: unit || null
    };

    const response = await fetch(`${BACKEND_URL}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || "Failed to create product";
      throw new Error(errorMsg);
    }

    const newProduct = await response.json();
    products.push(newProduct);
    populateProductDropdown();

    // Clear form and refresh pantry list
    nameInput.value = "";
    brandInput.value = "";
    caloriesInput.value = "";
    proteinInput.value = "";
    carbsInput.value = "";
    fatInput.value = "";
    notesInput.value = "";
    categoryInput.value = "grocery";
    unitInput.value = "";

    showSuccess("pantry-success", "Product added ✓");
    loadPantryProducts();
  } catch (err) {
    showError("pantry-error", `Error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadPantryProducts() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/products`);
    if (!response.ok) {
      throw new Error("Failed to load products");
    }

    const productsData = await response.json();
    products = productsData;
    renderPantryProducts(productsData);
  } catch (err) {
    showError("pantry-error", `Error loading products: ${err.message}`);
  }
}

function renderPantryProducts(productList) {
  const container = document.getElementById("pantry-products");

  if (!productList || productList.length === 0) {
    container.innerHTML = '<div class="product-empty">No products yet. Add one via Log Purchase.</div>';
    return;
  }

  container.innerHTML = productList
    .map((product) => {
      let html = `<div class="product-card">
        <h3>${escapeHtml(product.name)}</h3>`;

      if (product.brand) {
        html += `<div class="product-brand">${escapeHtml(product.brand)}</div>`;
      }

      // Category badge
      if (product.category) {
        html += `<div class="product-category"><span class="badge">${escapeHtml(product.category)}</span></div>`;
      }

      // Unit info
      if (product.unit) {
        html += `<div class="product-unit">Unit: ${escapeHtml(product.unit)}</div>`;
      }

      // Nutrition data (skip nulls)
      const nutrition = [];
      if (product.calories_per_100g != null) {
        nutrition.push({ label: "Calories/100g", value: product.calories_per_100g });
      }
      if (product.protein_per_100g != null) {
        nutrition.push({ label: "Protein/100g", value: product.protein_per_100g });
      }
      if (product.carbs_per_100g != null) {
        nutrition.push({ label: "Carbs/100g", value: product.carbs_per_100g });
      }
      if (product.fat_per_100g != null) {
        nutrition.push({ label: "Fat/100g", value: product.fat_per_100g });
      }

      if (nutrition.length > 0) {
        html += '<div class="product-nutrition">';
        nutrition.forEach((item) => {
          html += `<div class="product-nutrition-item">
            <span>${item.label}</span>
            <span>${item.value}</span>
          </div>`;
        });
        html += "</div>";
      }

      html += "</div>";
      return html;
    })
    .join("");
}

// ============================================================================
// Utilities
// ============================================================================

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = "block";
}

function showSuccess(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
    el.textContent = "";
  }, 3000);
}

function clearError(elementId) {
  const el = document.getElementById(elementId);
  el.textContent = "";
  el.style.display = "none";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
!productList || productList.length === 0) {
    container.innerHTML = '<div class="product-empty">No products yet. Add one via Log Purchase.</div>';
    return;
  }

  container.innerHTML = productList
    .map((product) => {
      let html = `<div class="product-card">
        <h3>${escapeHtml(product.name)}</h3>`;

      if (product.brand) {
        html += `<div class="product-brand">${escapeHtml(product.brand)}</div>`;
      }

      // Category badge
      if (product.category) {
        html += `<div class="product-category"><span class="badge">${escapeHtml(product.category)}</span></div>`;
      }

      // Unit info
      if (product.unit) {
        html += `<div class="product-unit">Unit: ${escapeHtml(product.unit)}</div>`;
      }

      // Nutrition data (skip nulls)
      const nutrition = [];
      if (product.calories_per_100g != null) {
        nutrition.push({ label: "Calories/100g", value: product.calories_per_100g });
      }
      if (product.protein_per_100g != null) {
        nutrition.push({ label: "Protein/100g", value: product.protein_per_100g });
      }
      if (product.carbs_per_100g != null) {
        nutrition.push({ label: "Carbs/100g", value: product.carbs_per_100g });
      }
      if (product.fat_per_100g != null) {
        nutrition.push({ label: "Fat/100g", value: product.fat_per_100g });
      }

      if (nutrition.length > 0) {
        html += '<div class="product-nutrition">';
        nutrition.forEach((item) => {
          html += `<div class="product-nutrition-item">
            <span>${item.label}</span>
            <span>${item.value}</span>
          </div>`;
        });
        html += "</div>";
      }

      html += "</div>";
      return html;
    })
    .join("");
}

// ============================================================================
// Utilities
// ============================================================================

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = "block";
}

function showSuccess(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
    el.textContent = "";
  }, 3000);
}

function clearError(elementId) {
  const el = document.getElementById(elementId);
  el.textContent = "";
  el.style.display = "none";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

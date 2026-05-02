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
  setupDashboard();
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

  // Initialize dashboard when switching to dashboard tab
  if (tabName === "dashboard") {
    initializeDashboard();
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
  clearError("log-purchase-error");

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

  // Clear the grocery/unit warning immediately when the user picks a unit
  document.getElementById("new-product-unit").addEventListener("change", function() {
    if (this.value) {
      clearError("new-product-error");
    }
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

  clearError("new-product-error");

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

  // Clear the grocery/unit warning immediately when the user picks a unit
  document.getElementById("pantry-product-unit").addEventListener("change", function() {
    if (this.value) {
      clearError("pantry-error");
    }
  });
}

async function handlePantryProductSubmit(e) {
  e.preventDefault();
  clearError("pantry-error");

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

// ============================================================================
// Dashboard
// ============================================================================

let dashboardMonth = null;
let spendChart = null;
let categoryChart = null;
let dashboardCurrentSortBy = "date";
let dashboardCurrentSortDir = "asc";

function setupDashboard() {
  // Initialize month to current month
  const now = new Date();
  dashboardMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Month navigation
  document.getElementById("dashboard-prev-month").addEventListener("click", () => {
    previousMonth();
  });
  document.getElementById("dashboard-next-month").addEventListener("click", () => {
    nextMonth();
  });

  // Dashboard sub-tabs (mobile)
  document.querySelectorAll(".dashboard-tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.dashboardTab;
      switchDashboardTab(tabName);
    });
  });

  // Purchases filter
  document.getElementById("dashboard-filter-category").addEventListener("change", () => {
    loadDashboardPurchases();
  });
  document.getElementById("dashboard-filter-store").addEventListener("change", () => {
    loadDashboardPurchases();
  });
  document.getElementById("dashboard-clear-filters").addEventListener("click", () => {
    clearDashboardFilters();
  });

  // Purchases table sorting
  document.querySelectorAll(".dashboard-purchases-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const sortBy = th.dataset.sort;
      if (dashboardCurrentSortBy === sortBy) {
        dashboardCurrentSortDir = dashboardCurrentSortDir === "asc" ? "desc" : "asc";
      } else {
        dashboardCurrentSortBy = sortBy;
        dashboardCurrentSortDir = "asc";
      }
      loadDashboardPurchases();
    });
  });
}

function initializeDashboard() {
  updateDashboardMonthLabel();
  updateMonthNavigationButtons();
  loadDashboardData();
}

function previousMonth() {
  const date = new Date(dashboardMonth + "-01");
  date.setMonth(date.getMonth() - 1);
  dashboardMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  updateDashboardMonthLabel();
  updateMonthNavigationButtons();
  loadDashboardData();
}

function nextMonth() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const date = new Date(dashboardMonth + "-01");
  date.setMonth(date.getMonth() + 1);
  const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  // Don't allow navigating beyond the current month
  if (nextMonth > currentMonth) {
    return;
  }

  dashboardMonth = nextMonth;
  updateDashboardMonthLabel();
  updateMonthNavigationButtons();
  loadDashboardData();
}

function updateDashboardMonthLabel() {
  const [year, month] = dashboardMonth.split("-");
  const date = new Date(year, parseInt(month) - 1);
  const monthName = date.toLocaleString("en-US", { month: "long", year: "numeric" });
  document.getElementById("dashboard-current-month").textContent = monthName;

  // Update chart titles
  document.getElementById("dashboard-spend-title").textContent = `Spend — ${monthName}`;
  document.getElementById("dashboard-categories-title").textContent = `By Category — ${monthName}`;
}

function updateMonthNavigationButtons() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Disable next button if at current month
  const nextBtn = document.getElementById("dashboard-next-month");
  nextBtn.disabled = dashboardMonth >= currentMonth;

  // Disable prev button if too far back (optional: adjust as needed)
  const prevBtn = document.getElementById("dashboard-prev-month");
  prevBtn.disabled = false;
}

function switchDashboardTab(tabName) {
  document.querySelectorAll(".dashboard-tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.dashboardTab === tabName);
  });

  document.querySelectorAll(".dashboard-tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `dashboard-${tabName}`);
  });

  // Trigger chart redraw on tab switch if needed (to account for container size changes)
  if (tabName === "spend" && spendChart) {
    spendChart.resize();
  } else if (tabName === "categories" && categoryChart) {
    categoryChart.resize();
  }
}

async function loadDashboardData() {
  clearError("dashboard-error");
  try {
    await Promise.all([
      loadDashboardSpend(),
      loadDashboardCategories(),
      loadDashboardPurchases()
    ]);
  } catch (err) {
    showError("dashboard-error", `Error loading dashboard: ${err.message}`);
  }
}

async function loadDashboardSpend() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dashboard/spend?month=${dashboardMonth}`);
    if (!response.ok) {
      throw new Error("Failed to load spend data");
    }

    const data = await response.json();
    renderSpendChart(data);
  } catch (err) {
    showError("dashboard-error", `Error loading spend: ${err.message}`);
  }
}

function renderSpendChart(data) {
  const emptyDiv = document.getElementById("dashboard-spend-empty");
  const canvas = document.getElementById("dashboard-spend-canvas");
  const totalDiv = document.getElementById("dashboard-spend-total");

  if (!data || !data.days || data.days.length === 0) {
    emptyDiv.style.display = "block";
    canvas.style.display = "none";
    totalDiv.style.display = "none";
    if (spendChart) {
      spendChart.destroy();
      spendChart = null;
    }
    totalDiv.textContent = "Total: €0.00";
    return;
  }

  // Show chart and total, hide empty state
  emptyDiv.style.display = "none";
  canvas.style.display = "block";
  totalDiv.style.display = "block";

  // Calculate cumulative spend and prepare labels
  let cumulative = 0;
  const labels = [];
  const chartData = [];

  data.days.forEach((item) => {
    labels.push(item.date);
    cumulative += parseFloat(item.amount);
    chartData.push(cumulative);
  });

  // Calculate total
  const total = cumulative.toFixed(2);
  document.getElementById("dashboard-spend-total").textContent = `Total: €${total}`;

  // Destroy old chart if exists
  if (spendChart) {
    spendChart.destroy();
  }

  const ctx = document.getElementById("dashboard-spend-canvas").getContext("2d");
  spendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Cumulative Spend (€)",
          data: chartData,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: "#2563eb",
          pointBorderColor: "#fff",
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return "€" + value.toFixed(2);
            }
          }
        }
      }
    }
  });
}

async function loadDashboardCategories() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dashboard/categories?month=${dashboardMonth}`);
    if (!response.ok) {
      throw new Error("Failed to load categories data");
    }

    const data = await response.json();
    renderCategoriesChart(data);
  } catch (err) {
    showError("dashboard-error", `Error loading categories: ${err.message}`);
  }
}

function renderCategoriesChart(data) {
  const emptyDiv = document.getElementById("dashboard-categories-empty");
  const canvas = document.getElementById("dashboard-categories-canvas");

  if (!data || !data.categories || data.categories.length === 0) {
    emptyDiv.style.display = "block";
    canvas.style.display = "none";
    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }
    return;
  }

  // Show chart, hide empty state
  emptyDiv.style.display = "none";
  canvas.style.display = "block";

  // Prepare data
  const labels = data.categories.map((item) => escapeHtml(item.category));
  const chartData = data.categories.map((item) => parseFloat(item.amount));

  // Destroy old chart if exists
  if (categoryChart) {
    categoryChart.destroy();
  }

  const ctx = document.getElementById("dashboard-categories-canvas").getContext("2d");
  categoryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Spend (€)",
          data: chartData,
          backgroundColor: "rgba(37, 99, 235, 0.7)",
          borderColor: "#2563eb",
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return "€" + value.toFixed(2);
            }
          }
        }
      }
    }
  });
}

async function loadDashboardPurchases() {
  try {
    const categoryFilter = document.getElementById("dashboard-filter-category").value;
    const storeFilter = document.getElementById("dashboard-filter-store").value;

    let url = `${BACKEND_URL}/api/purchases?month=${dashboardMonth}&sort_by=${dashboardCurrentSortBy}&sort_dir=${dashboardCurrentSortDir}`;
    if (categoryFilter) {
      url += `&category=${encodeURIComponent(categoryFilter)}`;
    }
    if (storeFilter) {
      url += `&store_id=${encodeURIComponent(storeFilter)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to load purchases");
    }

    const data = await response.json();
    renderDashboardPurchases(data);
    updateDashboardSortIndicators();
    populateDashboardFilters(data);
  } catch (err) {
    showError("dashboard-error", `Error loading purchases: ${err.message}`);
  }
}

function renderDashboardPurchases(purchaseList) {
  const tbody = document.getElementById("dashboard-purchases-tbody");
  const emptyState = document.getElementById("dashboard-purchases-empty");

  if (!purchaseList || purchaseList.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  tbody.innerHTML = purchaseList
    .map((purchase) => {
      const date = new Date(purchase.date).toLocaleDateString("en-GB");
      const product = escapeHtml(purchase.product_name);
      const store = purchase.store_name ? escapeHtml(purchase.store_name) : "—";
      const category = escapeHtml(purchase.category);
      const qty = purchase.quantity ? parseFloat(purchase.quantity).toFixed(2) : "—";
      const price = parseFloat(purchase.price_total).toFixed(2);

      return `<tr>
        <td>${date}</td>
        <td>${product}</td>
        <td>${store}</td>
        <td>${category}</td>
        <td>${qty}</td>
        <td>€${price}</td>
      </tr>`;
    })
    .join("");
}

function populateDashboardFilters(purchaseList) {
  // Populate category filter
  const categorySet = new Set();
  purchaseList.forEach((p) => {
    categorySet.add(p.category);
  });

  const categorySelect = document.getElementById("dashboard-filter-category");
  const currentValue = categorySelect.value;
  categorySelect.innerHTML = '<option value="">All categories</option>';
  Array.from(categorySet)
    .sort()
    .forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });
  categorySelect.value = currentValue;

  // Populate store filter from the global stores array
  const storeSelect = document.getElementById("dashboard-filter-store");
  const currentStoreValue = storeSelect.value;
  storeSelect.innerHTML = '<option value="">All stores</option>';
  stores.forEach((store) => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    storeSelect.appendChild(option);
  });
  storeSelect.value = currentStoreValue;
}

function updateDashboardSortIndicators() {
  document.querySelectorAll(".dashboard-purchases-table th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === dashboardCurrentSortBy) {
      th.classList.add(`sort-${dashboardCurrentSortDir}`);
    }
  });
}

function clearDashboardFilters() {
  document.getElementById("dashboard-filter-category").value = "";
  document.getElementById("dashboard-filter-store").value = "";
  dashboardCurrentSortBy = "date";
  dashboardCurrentSortDir = "asc";
  loadDashboardPurchases();
}

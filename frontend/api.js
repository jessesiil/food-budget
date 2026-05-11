// ============================================================================
// API Calls and Fetch Wrappers
// ============================================================================

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

async function prefillPrice() {
  const productSelect = document.getElementById("purchase-product");
  const storeSelect = document.getElementById("purchase-store");
  const priceInput = document.getElementById("purchase-price");

  const productId = productSelect.value;
  const storeId = storeSelect.value;

  // Only attempt if both product and store are selected
  if (!productId || !storeId) return;

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/purchases/last-price?product_id=${productId}&store_id=${storeId}`
    );
    if (!response.ok) return; // Fail silently — pre-fill is best-effort

    const data = await response.json();
    if (data.price !== null && data.price !== undefined) {
      priceInput.value = data.price.toFixed(2);
    }
  } catch {
    // Fail silently — pre-fill is best-effort, never block the user
  }
}

async function handleSubmitCart() {
  clearError("log-purchase-error");

  const storeSelect = document.getElementById("purchase-store");
  const dateInput = document.getElementById("purchase-date");

  if (!dateInput.value) {
    showError("log-purchase-error", "Please set a date for this trip.");
    return;
  }

  if (cart.length === 0) {
    showError("log-purchase-error", "Cart is empty.");
    return;
  }

  const submitBtn = document.getElementById("submit-cart-btn");
  submitBtn.disabled = true;

  try {
    const payload = {
      store_id: storeSelect.value ? parseInt(storeSelect.value) : null,
      date: dateInput.value,
      items: cart.map(item => {
        if (item.type === 'oneoff') {
          return {
            description: item.description,
            category: item.category,
            price_total: item.price_total,
            notes: item.notes || null,
          };
        }
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          price_total: item.price_total,
          notes: item.notes,
        };
      }),
    };

    const response = await fetch(`${BACKEND_URL}/api/purchases/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || "Failed to submit cart");
    }

    // Success — clear cart, show confirmation
    const count = cart.length;
    cart = [];
    purchaseMode = 'product';
    renderCart();
    document.getElementById('purchase-preset-buttons').innerHTML = '';
    document.getElementById('mode-product-btn').classList.add('active');
    document.getElementById('mode-oneoff-btn').classList.remove('active');
    document.getElementById('product-fields').classList.remove('hidden');
    document.getElementById('oneoff-fields').classList.add('hidden');
    showSuccess("log-purchase-success", `${count} purchase${count !== 1 ? "s" : ""} logged ✓`);
    // Reset date to today for next trip
    document.getElementById("purchase-date").value = new Date().toISOString().split("T")[0];
  } catch (err) {
    showError("log-purchase-error", `Error: ${err.message}`);
  } finally {
    submitBtn.disabled = cart.length === 0;
  }
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
  const presetRowsContainer = document.getElementById("new-product-preset-rows");
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
    const presets = collectPresets(presetRowsContainer, unit);
    const payload = {
      name,
      brand: brandInput.value.trim() || null,
      calories_per_100g: caloriesInput.value ? parseFloat(caloriesInput.value) : null,
      protein_per_100g: proteinInput.value ? parseFloat(proteinInput.value) : null,
      carbs_per_100g: carbsInput.value ? parseFloat(carbsInput.value) : null,
      fat_per_100g: fatInput.value ? parseFloat(fatInput.value) : null,
      notes: notesInput.value.trim() || null,
      category: category,
      unit: unit || null,
      presets: presets
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

    // Auto-select the new product and trigger change handler
    const productSelect = document.getElementById("purchase-product");
    productSelect.value = newProduct.id;
    productSelect.dispatchEvent(new Event('change'));

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
  const presetRowsContainer = document.getElementById("pantry-preset-rows");

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
    const presets = collectPresets(presetRowsContainer, unit);
    const payload = {
      name,
      brand: brandInput.value.trim() || null,
      calories_per_100g: caloriesInput.value ? parseFloat(caloriesInput.value) : null,
      protein_per_100g: proteinInput.value ? parseFloat(proteinInput.value) : null,
      carbs_per_100g: carbsInput.value ? parseFloat(carbsInput.value) : null,
      fat_per_100g: fatInput.value ? parseFloat(fatInput.value) : null,
      notes: notesInput.value.trim() || null,
      category: category,
      unit: unit || null,
      presets: presets
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
    presetRowsContainer.innerHTML = "";
    document.getElementById("pantry-preset-section").classList.add("hidden");

    // Collapse form after successful submit
    const formContainer = document.getElementById("pantry-form-container");
    if (formContainer) {
      formContainer.classList.add("hidden");
      const toggleBtn = document.getElementById("pantry-form-toggle");
      if (toggleBtn) toggleBtn.textContent = "＋ Add a new product";
    }

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

async function handleAddStore(e) {
  e.preventDefault();
  clearError("stores-error");

  const nameInput = document.getElementById("store-name-input");
  const name = nameInput.value.trim();
  if (!name) {
    showError("stores-error", "Store name is required.");
    return;
  }

  const submitBtn = document.getElementById("add-store-submit");
  submitBtn.disabled = true;

  try {
    const response = await fetch(`${BACKEND_URL}/api/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || "Failed to add store");
    }

    const newStore = await response.json();
    stores.push(newStore);
    populateStoreDropdown();
    nameInput.value = "";
    showSuccess("stores-success", "Store added ✓");
    loadStores();
  } catch (err) {
    showError("stores-error", `Error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadStores() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/stores`);
    if (!response.ok) throw new Error("Failed to load stores");
    const data = await response.json();
    stores = data;
    renderStoresList(data);
    populateStoreDropdown();
  } catch (err) {
    showError("stores-error", `Error loading stores: ${err.message}`);
  }
}

async function handleDeleteProduct(productId, cardElement) {
  if (!confirm("Delete this product? This cannot be undone.")) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
      method: "DELETE"
    });

    if (response.status === 204) {
      // Success
      products = products.filter(p => p.id !== parseInt(productId));
      loadPantryProducts();
      loadProductsAndStores();
      showSuccess("pantry-success", "Product deleted ✓");
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || "Failed to delete product";

      if (response.status === 409) {
        // Product has purchase history
        showError("pantry-error", errorMsg);
      } else {
        showError("pantry-error", `Error: ${errorMsg}`);
      }
    }
  } catch (err) {
    showError("pantry-error", `Error: ${err.message}`);
  }
}

async function handleDeletePurchase(purchaseId) {
  if (!confirm("Delete this purchase?")) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/purchases/${purchaseId}`, {
      method: "DELETE"
    });

    if (response.status === 204) {
      // Success
      loadDashboardPurchases();
      showSuccess("dashboard-success", "Purchase deleted ✓");
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || "Failed to delete purchase";
      showError("dashboard-error", `Error: ${errorMsg}`);
    }
  } catch (err) {
    showError("dashboard-error", `Error: ${err.message}`);
  }
}

async function loadDashboardSpend() {
  try {
    // Fetch the 7-day rolling spend for the bar chart
    const sevenDayResponse = await fetch(`${BACKEND_URL}/api/dashboard/spend-7day`);
    if (!sevenDayResponse.ok) {
      throw new Error("Failed to load 7-day spend data");
    }
    const sevenDayData = await sevenDayResponse.json();
    renderSpendChart(sevenDayData);

    // Fetch monthly total — used only for the days count (avg/day in categories panel)
    const monthResponse = await fetch(`${BACKEND_URL}/api/dashboard/spend?month=${dashboardMonth}`);
    if (monthResponse.ok) {
      const monthData = await monthResponse.json();
      // Return days count so categories avg can use it
      return monthData.days ? monthData.days.length : 0;
    }
    return 0;
  } catch (err) {
    showError("dashboard-error", `Error loading spend: ${err.message}`);
    return 0;
  }
}

async function loadDashboardCategories(spendDaysCount) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dashboard/categories?month=${dashboardMonth}`);
    if (!response.ok) {
      throw new Error("Failed to load categories data");
    }

    const data = await response.json();
    renderCategoriesChart(data);

    // Update avg/day summary
    const avgEl = document.getElementById("dashboard-categories-avg");
    if (avgEl) {
      avgEl.textContent = computeCategoriesAvgSummary(data, spendDaysCount || 0);
    }
  } catch (err) {
    showError("dashboard-error", `Error loading categories: ${err.message}`);
  }
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

    // Update the monthly total to reflect current filter state
    const hasFilter = !!categoryFilter || !!storeFilter;
    const filteredTotal = data.reduce((sum, p) => sum + parseFloat(p.price_total), 0);
    const totalEl = document.getElementById("dashboard-spend-month-total");
    if (totalEl) {
      totalEl.textContent = hasFilter
        ? `Filtered spend: €${filteredTotal.toFixed(2)}`
        : `Spend this month: €${filteredTotal.toFixed(2)}`;
    }
  } catch (err) {
    showError("dashboard-error", `Error loading purchases: ${err.message}`);
  }
}

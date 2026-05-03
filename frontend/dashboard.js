// ============================================================================
// Dashboard
// ============================================================================

let dashboardMonth = null;
let spendChart = null;
let categoryChart = null;
let dashboardCurrentSortBy = "date";
let dashboardCurrentSortDir = "desc";
let currentPurchases = [];

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
  document.getElementById("dashboard-spend-title").textContent = `Spending — ${monthName}`;
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
  const labels = data.categories.map((item) => escapeHtml(capitalize(item.category)));
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

function groupPurchasesByTrip(purchases) {
  // Group by (date, store_id) — null store_id is its own group per date
  const groups = {};

  purchases.forEach(purchase => {
    const key = `${purchase.date}|${purchase.store_id || 'null'}`;
    if (!groups[key]) {
      groups[key] = {
        date: purchase.date,
        store_id: purchase.store_id || null,
        store_name: purchase.store_name || null,
        purchases: []
      };
    }
    groups[key].purchases.push(purchase);
  });

  // Convert to array and sort by date (newest first, based on current sort dir)
  const trips = Object.values(groups);

  // Sort by date based on dashboardCurrentSortDir
  trips.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dashboardCurrentSortDir === "desc" ? dateB - dateA : dateA - dateB;
  });

  return trips;
}

function combinePurchasesByProductId(purchases) {
  // Combine purchases with same product_id within a trip: sum qty and price
  const combined = {};

  purchases.forEach(purchase => {
    const key = purchase.product_id;
    if (!combined[key]) {
      combined[key] = {
        ...purchase,
        count: 1,
        quantity: purchase.quantity || 0,
        price_total: parseFloat(purchase.price_total)
      };
    } else {
      combined[key].count++;
      combined[key].quantity += (purchase.quantity || 0);
      combined[key].price_total += parseFloat(purchase.price_total);
    }
  });

  return Object.values(combined);
}

function renderDashboardPurchases(purchaseList) {
  const tbody = document.getElementById("dashboard-purchases-tbody");
  const cardsContainer = document.getElementById("dashboard-purchases-cards");
  const emptyState = document.getElementById("dashboard-purchases-empty");

  // Store purchases in global variable for modal lookups
  currentPurchases = purchaseList;

  if (!purchaseList || purchaseList.length === 0) {
    tbody.innerHTML = "";
    cardsContainer.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  // Render table rows (desktop) — unchanged
  tbody.innerHTML = purchaseList
    .map((purchase) => {
      const date = new Date(purchase.date).toLocaleDateString("en-GB");
      const product = escapeHtml(purchase.product_name);
      const store = purchase.store_name ? escapeHtml(purchase.store_name) : "—";
      const category = escapeHtml(capitalize(purchase.category));
      const qty = purchase.quantity ? parseFloat(purchase.quantity).toFixed(2) : "—";
      const price = parseFloat(purchase.price_total).toFixed(2);

      return `<tr>
        <td>${date}</td>
        <td>${product}</td>
        <td>${store}</td>
        <td>${category}</td>
        <td>${qty}</td>
        <td>€${price}</td>
        <td>
          <button class="btn-secondary btn-sm edit-purchase-btn" data-id="${purchase.id}">Edit</button>
          <button class="btn-danger btn-sm delete-purchase-btn" data-id="${purchase.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  // Render grouped trip cards (mobile)
  const trips = groupPurchasesByTrip(purchaseList);

  cardsContainer.innerHTML = trips
    .map((trip) => {
      const dateObj = new Date(trip.date);
      const shortDate = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const storeName = trip.store_name || "No store";
      const escapedStoreName = escapeHtml(storeName);

      // Combine purchases by product_id
      const combinedItems = combinePurchasesByProductId(trip.purchases);

      // Calculate trip total
      const tripTotal = combinedItems.reduce((sum, item) => sum + item.price_total, 0).toFixed(2);

      // Render expanded items (hidden by default)
      const itemsHtml = combinedItems
        .map((item) => {
          const prod = products.find(p => p.id === item.product_id);
          const unit = prod ? prod.unit : null;
          const qtyDisplay = (item.quantity && unit)
            ? `${parseFloat(item.quantity).toFixed(0)}${unit}`
            : '—';
          const multiplier = item.count > 1 ? ` × ${item.count}` : '';
          const productName = escapeHtml(item.product_name);
          const price = item.price_total.toFixed(2);

          return `
            <div class="trip-item-row">
              <div class="trip-item-product">
                <span>${productName}${multiplier}</span>
              </div>
              <div class="trip-item-qty">${qtyDisplay}</div>
              <div class="trip-item-price">€${price}</div>
              <div class="trip-item-actions">
                <button class="btn-secondary btn-sm edit-purchase-btn" data-id="${item.id}">Edit</button>
                <button class="btn-danger btn-sm delete-purchase-btn" data-id="${item.id}">Delete</button>
              </div>
            </div>
          `;
        })
        .join("");

      const itemCount = combinedItems.length;

      return `
        <div class="trip-card" data-trip-date="${trip.date}" data-trip-store="${trip.store_id || 'null'}">
          <div class="trip-card-header">
            <div class="trip-card-header-left">
              <span class="trip-store-name">${escapedStoreName}</span>
              <span class="trip-divider">·</span>
              <span class="trip-date">${shortDate}</span>
            </div>
            <div class="trip-card-header-right">
              <span class="trip-total">€${tripTotal}</span>
              <span class="trip-chevron">›</span>
            </div>
          </div>
          <div class="trip-card-summary">
            <span>${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="trip-card-items">
            ${itemsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  // Add event listeners for trip card toggle and action buttons
  cardsContainer.querySelectorAll(".trip-card").forEach(card => {
    const header = card.querySelector(".trip-card-header");
    header.addEventListener("click", () => {
      card.classList.toggle("expanded");
    });
  });

  // Add event listeners for edit/delete buttons
  cardsContainer.querySelectorAll(".edit-purchase-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent trip toggle
      openEditPurchaseModal(btn.dataset.id);
    });
  });
  cardsContainer.querySelectorAll(".delete-purchase-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent trip toggle
      handleDeletePurchase(btn.dataset.id);
    });
  });

  // Add event listeners for desktop table buttons
  tbody.querySelectorAll(".edit-purchase-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditPurchaseModal(btn.dataset.id));
  });
  tbody.querySelectorAll(".delete-purchase-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeletePurchase(btn.dataset.id));
  });
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
      option.textContent = capitalize(cat);
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

function openEditPurchaseModal(purchaseId) {
  const purchase = currentPurchases.find(p => p.id === parseInt(purchaseId));
  if (!purchase) {
    showError("dashboard-error", "Purchase not found");
    return;
  }

  // Build product options
  const productOptions = products
    .map(p => `<option value="${p.id}" ${p.id === purchase.product_id ? 'selected' : ''}>${escapeHtml(p.name)}${p.brand ? ' (' + escapeHtml(p.brand) + ')' : ''}</option>`)
    .join("");

  // Build store options
  const storeOptions = `<option value="" ${!purchase.store_id ? 'selected' : ''}>— no store —</option>` +
    stores.map(s => `<option value="${s.id}" ${s.id === purchase.store_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join("");

  const formHtml = `
    <h2>Edit Purchase</h2>
    <div id="modal-error" class="error-message"></div>
    <form id="edit-purchase-form">
      <div class="form-group">
        <label for="edit-purchase-product">Product *</label>
        <select id="edit-purchase-product" required>
          ${productOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="edit-purchase-store">Store</label>
        <select id="edit-purchase-store">
          ${storeOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="edit-purchase-date">Date *</label>
        <input type="date" id="edit-purchase-date" value="${purchase.date}" required />
      </div>
      <div class="form-group">
        <label for="edit-purchase-quantity">Quantity</label>
        <input type="number" id="edit-purchase-quantity" min="0.1" step="0.1" value="${purchase.quantity || ''}" />
      </div>
      <div class="form-group">
        <label for="edit-purchase-price">Total price (€) *</label>
        <input type="number" id="edit-purchase-price" min="0.01" step="0.01" value="${purchase.price_total}" required />
      </div>
      <div class="form-group">
        <label for="edit-purchase-notes">Notes</label>
        <textarea id="edit-purchase-notes">${escapeHtml(purchase.notes || '')}</textarea>
      </div>
      <div class="button-group">
        <button type="submit" class="btn-primary">Save</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal(formHtml);

  document.getElementById("edit-purchase-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("modal-error");

    const productSelect = document.getElementById("edit-purchase-product");
    const storeSelect = document.getElementById("edit-purchase-store");
    const dateInput = document.getElementById("edit-purchase-date");
    const quantityInput = document.getElementById("edit-purchase-quantity");
    const priceInput = document.getElementById("edit-purchase-price");
    const notesInput = document.getElementById("edit-purchase-notes");

    if (!productSelect.value) {
      showError("modal-error", "Please select a product.");
      return;
    }

    const price = parseFloat(priceInput.value);
    if (!price || price <= 0) {
      showError("modal-error", "Price must be greater than 0.");
      return;
    }

    const submitBtn = document.querySelector("#edit-purchase-form button[type='submit']");
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

      const response = await fetch(`${BACKEND_URL}/api/purchases/${purchaseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.detail || errorData.message || "Failed to update purchase";
        throw new Error(errorMsg);
      }

      closeModal();
      loadDashboardPurchases();
      showSuccess("dashboard-success", "Purchase updated ✓");
    } catch (err) {
      showError("modal-error", `Error: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================================================
// History Tab
// ============================================================================

let historyMonth = null;           // "YYYY-MM"
let historyCurrentSortBy = "date";
let historyCurrentSortDir = "desc";
let historySearchQuery = "";
let historyAllPurchases = [];      // full loaded dataset for client-side search

function setupHistory() {
  // Initialise historyMonth to current month
  const now = new Date();
  historyMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Month navigation
  document.getElementById("history-prev-month").addEventListener("click", () => {
    previousHistoryMonth();
  });
  document.getElementById("history-next-month").addEventListener("click", () => {
    nextHistoryMonth();
  });

  // Search input
  document.getElementById("history-search").addEventListener("input", (e) => {
    historySearchQuery = e.target.value;
    renderHistory();
  });

  // Category filter
  document.getElementById("history-filter-category").addEventListener("change", () => {
    loadHistoryPurchases();
  });

  // Store filter
  document.getElementById("history-filter-store").addEventListener("change", () => {
    loadHistoryPurchases();
  });

  // Clear filters button
  document.getElementById("history-clear-filters").addEventListener("click", () => {
    clearHistoryFilters();
  });

  // Sortable column headers
  document.querySelectorAll("th.history-sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const sortBy = th.dataset.sort;
      if (historyCurrentSortBy === sortBy) {
        historyCurrentSortDir = historyCurrentSortDir === "asc" ? "desc" : "asc";
      } else {
        historyCurrentSortBy = sortBy;
        historyCurrentSortDir = "asc";
      }
      loadHistoryPurchases();
    });
  });
}

function initializeHistory() {
  updateHistoryMonthLabel();
  loadHistoryPurchases();
}

function previousHistoryMonth() {
  const date = new Date(historyMonth + "-01");
  date.setMonth(date.getMonth() - 1);
  historyMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  updateHistoryMonthLabel();
  loadHistoryPurchases();
}

function nextHistoryMonth() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const date = new Date(historyMonth + "-01");
  date.setMonth(date.getMonth() + 1);
  const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  // Don't allow navigating beyond the current month
  if (next > currentMonth) {
    return;
  }

  historyMonth = next;
  updateHistoryMonthLabel();
  loadHistoryPurchases();
}

function updateHistoryMonthLabel() {
  const [year, month] = historyMonth.split("-");
  const date = new Date(year, parseInt(month) - 1);
  const monthName = date.toLocaleString("en-US", { month: "long", year: "numeric" });

  document.getElementById("history-current-month").textContent = monthName;
  document.getElementById("history-month-title").textContent = `Purchases — ${monthName}`;

  // Disable next button at current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("history-next-month").disabled = historyMonth >= currentMonth;
}

async function loadHistoryPurchases() {
  try {
    const categoryFilter = document.getElementById("history-filter-category").value;
    const storeFilter = document.getElementById("history-filter-store").value;

    let url = `${BACKEND_URL}/api/purchases?month=${historyMonth}&sort_by=${historyCurrentSortBy}&sort_dir=${historyCurrentSortDir}`;
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
    historyAllPurchases = data;
    populateHistoryFilters(data);
    renderHistory();
  } catch (err) {
    showError("history-error", `Error loading purchases: ${err.message}`);
  }
}

function populateHistoryFilters(purchaseList) {
  // Populate category filter
  const categorySet = new Set();
  purchaseList.forEach((p) => {
    categorySet.add(p.category);
  });

  const categorySelect = document.getElementById("history-filter-category");
  const currentCategoryValue = categorySelect.value;
  categorySelect.innerHTML = '<option value="">All categories</option>';
  Array.from(categorySet)
    .sort()
    .forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = capitalize(cat);
      categorySelect.appendChild(option);
    });
  categorySelect.value = currentCategoryValue;

  // Populate store filter from the global stores array
  const storeSelect = document.getElementById("history-filter-store");
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

function renderHistory() {
  // Update global currentPurchases so the edit modal can find purchases by ID
  currentPurchases = historyAllPurchases;

  // Apply client-side search filter
  const query = historySearchQuery.trim().toLowerCase();
  const filteredList = query
    ? historyAllPurchases.filter((p) => {
        const name = (p.product_name || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        return name.includes(query) || desc.includes(query);
      })
    : historyAllPurchases;

  updateHistorySpendTotal(filteredList);
  renderHistoryTable(filteredList);
  renderHistoryCards(filteredList);
  updateHistorySortIndicators();

  // Show/hide empty state
  const emptyState = document.getElementById("history-purchases-empty");
  if (emptyState) {
    emptyState.style.display = filteredList.length === 0 ? "block" : "none";
  }
}

function renderHistoryTable(filteredList) {
  const tbody = document.getElementById("history-purchases-tbody");

  if (!filteredList || filteredList.length === 0) {
    tbody.innerHTML = "";
    return;
  }

  tbody.innerHTML = filteredList
    .map((purchase) => {
      const date = new Date(purchase.date + "T00:00:00").toLocaleDateString("en-GB");
      const product = purchase.product_name
        ? escapeHtml(purchase.product_name)
        : `<em>${escapeHtml(purchase.description || "One-off")}</em>`;
      const store = purchase.store_name ? escapeHtml(purchase.store_name) : "—";
      const category = escapeHtml(capitalize(purchase.category));

      // Format qty: use unit if available
      const prod = purchase.product_id ? products.find((p) => p.id === purchase.product_id) : null;
      const unit = prod ? prod.unit : null;
      const qty = purchase.quantity
        ? unit
          ? `${parseFloat(purchase.quantity).toFixed(0)}${unit}`
          : `${parseFloat(purchase.quantity).toFixed(0)}`
        : "—";

      const price = parseFloat(purchase.price_total).toFixed(2);

      return `<tr>
        <td>${date}</td>
        <td>${product}</td>
        <td>${store}</td>
        <td>${category}</td>
        <td>${qty}</td>
        <td>€${price}</td>
        <td>
          <button class="btn-secondary btn-sm history-edit-btn" data-id="${purchase.id}">Edit</button>
          <button class="btn-danger btn-sm history-delete-btn" data-id="${purchase.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  // Wire up table action buttons
  tbody.querySelectorAll(".history-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditPurchaseModal(btn.dataset.id));
  });
  tbody.querySelectorAll(".history-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleDeletePurchase(btn.dataset.id);
    });
  });
}

function historyGroupByDay(purchaseList) {
  const groups = {};

  purchaseList.forEach((purchase) => {
    const day = purchase.date;
    if (!groups[day]) {
      groups[day] = [];
    }
    groups[day].push(purchase);
  });

  // Sort days
  const days = Object.keys(groups).sort((a, b) => {
    return historyCurrentSortDir === "desc"
      ? b.localeCompare(a)
      : a.localeCompare(b);
  });

  return days.map((day) => ({ date: day, purchases: groups[day] }));
}

function historyGroupByTrip(dayPurchases) {
  const groups = {};

  dayPurchases.forEach((purchase) => {
    const key = `${purchase.date}|${purchase.store_id || "null"}`;
    if (!groups[key]) {
      groups[key] = {
        date: purchase.date,
        store_id: purchase.store_id || null,
        store_name: purchase.store_name || null,
        purchases: [],
      };
    }
    groups[key].purchases.push(purchase);
  });

  return Object.values(groups);
}

function historyCombinePurchasesByProductId(purchases) {
  // Combine purchases with same product_id within a trip: sum qty and price
  const combined = {};

  purchases.forEach((purchase) => {
    const key = purchase.product_id != null ? `product_${purchase.product_id}` : `oneoff_${purchase.id}`;
    if (!combined[key]) {
      combined[key] = {
        ...purchase,
        count: 1,
        quantity: purchase.quantity || 0,
        price_total: parseFloat(purchase.price_total),
      };
    } else {
      combined[key].count++;
      combined[key].quantity += purchase.quantity || 0;
      combined[key].price_total += parseFloat(purchase.price_total);
    }
  });

  return Object.values(combined);
}

function renderHistoryCards(filteredList) {
  const cardsContainer = document.getElementById("history-purchases-cards");

  if (!filteredList || filteredList.length === 0) {
    cardsContainer.innerHTML = "";
    return;
  }

  const dayGroups = historyGroupByDay(filteredList);

  cardsContainer.innerHTML = dayGroups
    .map((dayGroup) => {
      const dateObj = new Date(dayGroup.date + "T00:00:00");
      const dayLabel = dateObj.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      // Group into trips within this day
      const trips = historyGroupByTrip(dayGroup.purchases);

      // Compute day total
      const dayTotal = dayGroup.purchases
        .reduce((sum, p) => sum + parseFloat(p.price_total), 0)
        .toFixed(2);

      // Render trips
      const tripsHtml = trips
        .map((trip) => {
          const storeName = trip.store_name || "No store";
          const escapedStoreName = escapeHtml(storeName);

          const combinedItems = historyCombinePurchasesByProductId(trip.purchases);

          const tripTotal = combinedItems
            .reduce((sum, item) => sum + item.price_total, 0)
            .toFixed(2);

          const itemsHtml = combinedItems
            .map((item) => {
              const isOneoff = !item.product_id;
              const prod = isOneoff ? null : products.find((p) => p.id === item.product_id);
              const unit = prod ? prod.unit : null;
              const qtyDisplay = isOneoff
                ? "—"
                : item.quantity && unit
                ? `${parseFloat(item.quantity).toFixed(0)}${unit}`
                : item.quantity
                ? `${parseFloat(item.quantity).toFixed(0)}`
                : "—";
              const multiplier = item.count > 1 ? ` × ${item.count}` : "";
              const productName = isOneoff
                ? `<em>${escapeHtml(item.description || "One-off")}</em>`
                : escapeHtml(item.product_name);
              const price = item.price_total.toFixed(2);

              return `
                <div class="trip-item-row">
                  <div class="trip-item-product">
                    <span>${productName}${multiplier}</span>
                  </div>
                  <div class="trip-item-qty">${qtyDisplay}</div>
                  <div class="trip-item-price">€${price}</div>
                  <div class="trip-item-actions">
                    <button class="btn-secondary btn-sm history-edit-btn" data-id="${item.id}">Edit</button>
                    <button class="btn-danger btn-sm history-delete-btn" data-id="${item.id}">Delete</button>
                  </div>
                </div>
              `;
            })
            .join("");

          const itemCount = combinedItems.length;

          return `
            <div class="trip-card" data-trip-date="${trip.date}" data-trip-store="${trip.store_id || "null"}">
              <div class="trip-card-header">
                <div class="trip-card-header-left">
                  <span class="trip-store-name">${escapedStoreName}</span>
                </div>
                <div class="trip-card-header-right">
                  <span class="trip-total">€${tripTotal}</span>
                  <span class="trip-chevron">›</span>
                </div>
              </div>
              <div class="trip-card-summary">
                <span>${itemCount} item${itemCount !== 1 ? "s" : ""}</span>
              </div>
              <div class="trip-card-items">
                ${itemsHtml}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="history-day-group">
          <div class="history-day-header">
            <div class="history-day-header-left">
              <span class="history-day-date">${dayLabel}</span>
            </div>
            <div class="history-day-header-right">
              <span class="history-day-total">€${dayTotal}</span>
              <span class="history-day-chevron">›</span>
            </div>
          </div>
          <div class="history-day-trips">
            ${tripsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  // Wire up day header toggles
  cardsContainer.querySelectorAll(".history-day-group").forEach((dayGroup) => {
    const header = dayGroup.querySelector(".history-day-header");
    header.addEventListener("click", () => {
      dayGroup.classList.toggle("expanded");
    });
  });

  // Wire up trip card header toggles
  cardsContainer.querySelectorAll(".trip-card").forEach((card) => {
    const header = card.querySelector(".trip-card-header");
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      card.classList.toggle("expanded");
    });
  });

  // Wire up edit/delete buttons (stop propagation to prevent toggling)
  cardsContainer.querySelectorAll(".history-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditPurchaseModal(btn.dataset.id);
    });
  });
  cardsContainer.querySelectorAll(".history-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeletePurchase(btn.dataset.id);
    });
  });
}

function updateHistorySpendTotal(filteredList) {
  const totalEl = document.getElementById("history-spend-total");
  if (!totalEl) return;

  const categoryFilter = document.getElementById("history-filter-category").value;
  const storeFilter = document.getElementById("history-filter-store").value;
  const hasFilter = !!categoryFilter || !!storeFilter || !!historySearchQuery.trim();

  const total = filteredList.reduce((sum, p) => sum + parseFloat(p.price_total), 0);

  totalEl.textContent = hasFilter
    ? `Filtered spend: €${total.toFixed(2)}`
    : `Spend this month: €${total.toFixed(2)}`;
}

function clearHistoryFilters() {
  document.getElementById("history-filter-category").value = "";
  document.getElementById("history-filter-store").value = "";
  document.getElementById("history-search").value = "";
  historySearchQuery = "";
  historyCurrentSortBy = "date";
  historyCurrentSortDir = "desc";
  loadHistoryPurchases();
}

function updateHistorySortIndicators() {
  document.querySelectorAll(".history-purchases-table th.history-sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === historyCurrentSortBy) {
      th.classList.add(`sort-${historyCurrentSortDir}`);
    }
  });
}

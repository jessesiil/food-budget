// ============================================================================
// Shared UI Helpers and Utilities
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
  return div.innerHTML.replace(/"/g, "&quot;");
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Modal Helpers
// ============================================================================

function openModal(htmlContent) {
  document.getElementById("edit-modal-content").innerHTML = htmlContent;
  document.getElementById("edit-modal-overlay").classList.remove("hidden");

  // Close on overlay click
  const overlay = document.getElementById("edit-modal-overlay");
  const handler = function(e) {
    if (e.target === this) {
      closeModal();
      this.removeEventListener("click", handler);
    }
  };
  overlay.addEventListener("click", handler);
}

function closeModal() {
  document.getElementById("edit-modal-overlay").classList.add("hidden");
  document.getElementById("edit-modal-content").innerHTML = "";
}

// ============================================================================
// Tab Navigation (Drawer)
// ============================================================================

function setupDrawerNavigation() {
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const drawerCloseBtn = document.getElementById("drawer-close-btn");

  hamburgerBtn.addEventListener("click", openDrawer);
  drawerCloseBtn.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  document.querySelectorAll(".drawer-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const tabName = item.dataset.tab;
      switchTab(tabName);
      closeDrawer();
    });
  });
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("visible");
  document.body.classList.add("drawer-open");
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("visible");
  document.body.classList.remove("drawer-open");
}

function switchTab(tabName) {
  // Update tab content visibility
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === tabName);
  });

  // Update drawer active state
  document.querySelectorAll(".drawer-nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tabName);
  });

  // Side effects per tab
  if (tabName === "pantry") {
    loadPantryProducts();
  }
  if (tabName === "dashboard") {
    initializeDashboard();
  }
  if (tabName === "stores") {
    loadStores();
  }
  if (tabName === "history") {
    if (!historyInitialized) {
      historyInitialized = true;
      initializeHistory();
    }
  }
}

// ============================================================================
// Preset Helpers (shared across multiple modules)
// ============================================================================

// Build preset rows HTML for add/edit forms. unit = 'g' | 'mL' | '' | null.
function buildPresetRowsHtml(presets, unit) {
  return (presets || []).map((p, i) => buildPresetRowHtml(p.quantity, unit, i)).join('');
}

function buildPresetRowHtml(qty, unit, index) {
  const label = qty && unit ? `${qty}${unit}` : (qty || '');
  return `<div class="preset-row" data-index="${index}">
    <input type="number" class="preset-qty-input" min="0.1" step="0.1" value="${qty || ''}" placeholder="e.g. 250" />
    <span class="preset-label-preview">${escapeHtml(label)}</span>
    <button type="button" class="preset-remove-btn btn-danger btn-sm">×</button>
  </div>`;
}

function attachPresetRowListeners(container, unit) {
  container.querySelectorAll('.preset-qty-input').forEach(input => {
    input.addEventListener('input', () => {
      const preview = input.closest('.preset-row').querySelector('.preset-label-preview');
      const val = parseFloat(input.value);
      preview.textContent = val && unit ? `${val}${unit}` : (input.value || '');
    });
  });
  container.querySelectorAll('.preset-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.preset-row').remove();
      updatePresetAddBtn(container);
    });
  });
}

function updatePresetAddBtn(rowsContainer) {
  // Disable add button when 4 presets exist
  const section = rowsContainer.closest('.preset-section') || rowsContainer.parentElement;
  const addBtn = section.querySelector('[id$="-add-preset-btn"], .add-preset-btn');
  if (addBtn) addBtn.disabled = rowsContainer.querySelectorAll('.preset-row').length >= 4;
}

function collectPresets(rowsContainer, unit) {
  const rows = rowsContainer.querySelectorAll('.preset-row');
  const presets = [];
  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.preset-qty-input').value);
    if (!isNaN(qty) && qty > 0) {
      presets.push({ quantity: qty, label: unit ? `${qty}${unit}` : `${qty}` });
    }
  });
  return presets;
}

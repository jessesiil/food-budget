// ============================================================================
// Log Purchase Tab
// ============================================================================

let cart = []; // { id, product_id, product_name, unit, quantity, price_total, notes }

function initializeDateField() {
  const dateInput = document.getElementById("purchase-date");
  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;
}

function setupPurchaseForm() {
  document.getElementById("add-to-cart-btn").addEventListener("click", handleAddToCart);

  document.getElementById("purchase-product").addEventListener("change", function() {
    const selectedOption = this.options[this.selectedIndex];
    const unit = selectedOption.dataset.unit;
    const quantityGroup = document.getElementById("purchase-quantity-group");
    const unitLabel = document.getElementById("purchase-quantity-unit");
    if (unit) {
      quantityGroup.style.display = "";
      unitLabel.textContent = unit;
    } else {
      quantityGroup.style.display = "none";
      document.getElementById("purchase-quantity").value = "";
    }
    prefillPrice();
    renderPresetButtons();
    // Auto-focus next relevant field
    if (unit) {
      document.getElementById("purchase-quantity").focus();
    } else {
      document.getElementById("purchase-price").focus();
    }
  });

  document.getElementById("purchase-store").addEventListener("change", prefillPrice);

  document.getElementById("submit-cart-btn").addEventListener("click", handleSubmitCart);
}

function handleAddToCart() {
  clearError("log-purchase-error");

  const productSelect = document.getElementById("purchase-product");
  const quantityInput = document.getElementById("purchase-quantity");
  const priceInput = document.getElementById("purchase-price");
  const notesInput = document.getElementById("purchase-notes");

  if (!productSelect.value) {
    showError("log-purchase-error", "Please select a product.");
    return;
  }

  const quantityGroup = document.getElementById("purchase-quantity-group");
  const quantityVisible = quantityGroup.style.display !== "none";
  if (quantityVisible) {
    const qty = parseFloat(quantityInput.value);
    if (!qty || qty <= 0) {
      showError("log-purchase-error", "Quantity must be greater than 0.");
      return;
    }
  }

  const price = parseFloat(priceInput.value);
  if (!price || price <= 0) {
    showError("log-purchase-error", "Price must be greater than 0.");
    return;
  }

  const selectedOption = productSelect.options[productSelect.selectedIndex];
  const unit = selectedOption.dataset.unit || null;

  cart.push({
    id: crypto.randomUUID(),
    product_id: parseInt(productSelect.value),
    product_name: selectedOption.text,
    unit,
    quantity: quantityVisible && quantityInput.value ? parseFloat(quantityInput.value) : null,
    price_total: price,
    notes: notesInput.value.trim() || null,
  });

  // Clear item fields, keep product selected for quick re-entry
  quantityInput.value = "";
  priceInput.value = "";
  notesInput.value = "";
  if (quantityVisible) quantityInput.focus();
  else priceInput.focus();

  renderCart();
}

function renderCart() {
  const cartItems = document.getElementById("cart-items");
  const cartCount = document.getElementById("cart-count");
  const cartTotal = document.getElementById("cart-total");
  const submitBtn = document.getElementById("submit-cart-btn");
  const cartSection = document.getElementById("cart-section");

  cartCount.textContent = cart.length > 0 ? `(${cart.length})` : "";
  submitBtn.disabled = cart.length === 0;
  cartSection.style.display = cart.length === 0 ? "none" : "block";

  if (cart.length === 0) {
    cartItems.innerHTML = "";
    cartTotal.textContent = "";
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.price_total, 0);
  cartTotal.textContent = `Total: €${total.toFixed(2)}`;

  cartItems.innerHTML = cart.map(item => {
    const qtyStr = item.quantity ? `${item.quantity}${item.unit || ""}` : null;
    const detail = [qtyStr, item.notes].filter(Boolean).join(" · ");
    return `<div class="cart-item" data-id="${item.id}">
      <div class="cart-item-info">
        <span class="cart-item-name">${escapeHtml(item.product_name)}</span>
        ${detail ? `<span class="cart-item-detail">${escapeHtml(detail)}</span>` : ""}
      </div>
      <div class="cart-item-right">
        <span class="cart-item-price">€${item.price_total.toFixed(2)}</span>
        <button class="cart-remove-btn" data-id="${item.id}" aria-label="Remove">×</button>
      </div>
    </div>`;
  }).join("");

  cartItems.querySelectorAll(".cart-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      cart = cart.filter(item => item.id !== btn.dataset.id);
      renderCart();
    });
  });
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

  // Handle unit change — show/hide preset section
  document.getElementById("new-product-unit").addEventListener("change", function() {
    const presetSection = document.getElementById("new-product-preset-section");
    const presetRowsContainer = document.getElementById("new-product-preset-rows");
    if (this.value) {
      presetSection.classList.remove("hidden");
      clearError("new-product-error");
    } else {
      presetSection.classList.add("hidden");
      presetRowsContainer.innerHTML = "";
    }
  });

  // Handle preset add button
  document.getElementById("new-product-add-preset-btn").addEventListener("click", (e) => {
    e.preventDefault();
    const presetRowsContainer = document.getElementById("new-product-preset-rows");
    const unit = document.getElementById("new-product-unit").value;
    if (presetRowsContainer.querySelectorAll(".preset-row").length < 4) {
      const newRow = document.createElement("div");
      newRow.innerHTML = buildPresetRowHtml("", unit, presetRowsContainer.querySelectorAll(".preset-row").length);
      presetRowsContainer.appendChild(newRow.firstElementChild);
      attachPresetRowListeners(presetRowsContainer, unit);
      updatePresetAddBtn(presetRowsContainer);
    }
  });
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
  document.getElementById("new-product-preset-rows").innerHTML = "";
  document.getElementById("new-product-preset-section").classList.add("hidden");
  clearError("new-product-error");
}

function renderPresetButtons() {
  const container = document.getElementById('purchase-preset-buttons');
  const productId = parseInt(document.getElementById('purchase-product').value);
  const product = products.find(p => p.id === productId);
  container.innerHTML = '';
  if (!product || !product.presets || product.presets.length === 0) return;
  product.presets.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-fill-btn btn-secondary btn-sm';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      document.getElementById('purchase-quantity').value = preset.quantity;
    });
    container.appendChild(btn);
  });
}

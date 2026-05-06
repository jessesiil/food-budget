// ============================================================================
// Pantry Tab
// ============================================================================

function setupPantryForm() {
  const form = document.getElementById("pantry-product-form");
  form.addEventListener("submit", (e) => handlePantryProductSubmit(e));

  // Handle unit change — show/hide preset section
  document.getElementById("pantry-product-unit").addEventListener("change", function() {
    const presetSection = document.getElementById("pantry-preset-section");
    const presetRowsContainer = document.getElementById("pantry-preset-rows");
    if (this.value) {
      presetSection.classList.remove("hidden");
      clearError("pantry-error");
    } else {
      presetSection.classList.add("hidden");
      presetRowsContainer.innerHTML = "";
    }
  });

  // Handle preset add button
  document.getElementById("pantry-add-preset-btn").addEventListener("click", (e) => {
    e.preventDefault();
    const presetRowsContainer = document.getElementById("pantry-preset-rows");
    const unit = document.getElementById("pantry-product-unit").value;
    if (presetRowsContainer.querySelectorAll(".preset-row").length < 4) {
      const newRow = document.createElement("div");
      newRow.innerHTML = buildPresetRowHtml("", unit, presetRowsContainer.querySelectorAll(".preset-row").length);
      presetRowsContainer.appendChild(newRow.firstElementChild);
      attachPresetRowListeners(presetRowsContainer, unit);
      updatePresetAddBtn(presetRowsContainer);
    }
  });
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
        html += `<div class="product-category"><span class="badge">${escapeHtml(capitalize(product.category))}</span></div>`;
      }

      // Unit info
      if (product.unit) {
        html += `<div class="product-unit">Unit: ${escapeHtml(product.unit)}</div>`;
      }

      // Nutrition data (skip nulls)
      const nutrition = [];
      const unitLabel = product.unit === 'mL' ? '100mL' : '100g';
      if (product.calories_per_100g != null) {
        nutrition.push({ label: `Calories/${unitLabel}`, value: product.calories_per_100g });
      }
      if (product.protein_per_100g != null) {
        nutrition.push({ label: `Protein/${unitLabel}`, value: product.protein_per_100g });
      }
      if (product.carbs_per_100g != null) {
        nutrition.push({ label: `Carbs/${unitLabel}`, value: product.carbs_per_100g });
      }
      if (product.fat_per_100g != null) {
        nutrition.push({ label: `Fat/${unitLabel}`, value: product.fat_per_100g });
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

      html += `<div class="product-card-actions">
        <button class="btn-secondary btn-sm edit-product-btn" data-id="${product.id}">Edit</button>
        <button class="btn-danger btn-sm delete-product-btn" data-id="${product.id}">Delete</button>
      </div>`;

      html += "</div>";
      return html;
    })
    .join("");

  // Add event listeners for edit and delete buttons
  container.querySelectorAll(".edit-product-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditProductModal(btn.dataset.id));
  });
  container.querySelectorAll(".delete-product-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteProduct(btn.dataset.id, btn.closest(".product-card")));
  });
}

function openEditProductModal(productId) {
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) {
    showError("pantry-error", "Product not found");
    return;
  }

  const formHtml = `
    <h2>Edit Product</h2>
    <div id="modal-error" class="error-message"></div>
    <form id="edit-product-form">
      <div class="form-group">
        <label for="edit-product-name">Name *</label>
        <input type="text" id="edit-product-name" value="${escapeHtml(product.name)}" required />
      </div>
      <div class="form-group">
        <label for="edit-product-brand">Brand</label>
        <input type="text" id="edit-product-brand" value="${escapeHtml(product.brand || '')}" />
      </div>
      <div class="form-group">
        <label for="edit-product-category">Category</label>
        <select id="edit-product-category" required>
          <option value="grocery" ${product.category === 'grocery' ? 'selected' : ''}>Grocery</option>
          <option value="alcohol" ${product.category === 'alcohol' ? 'selected' : ''}>Alcohol</option>
          <option value="nicotine" ${product.category === 'nicotine' ? 'selected' : ''}>Nicotine</option>
          <option value="restaurant" ${product.category === 'restaurant' ? 'selected' : ''}>Restaurant</option>
          <option value="event" ${product.category === 'event' ? 'selected' : ''}>Event</option>
          <option value="badminton" ${product.category === 'badminton' ? 'selected' : ''}>Badminton</option>
          <option value="travel" ${product.category === 'travel' ? 'selected' : ''}>Travel</option>
          <option value="other" ${product.category === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label for="edit-product-unit">Unit</label>
        <select id="edit-product-unit">
          <option value="" ${!product.unit ? 'selected' : ''}>— none —</option>
          <option value="g" ${product.unit === 'g' ? 'selected' : ''}>g (grams)</option>
          <option value="mL" ${product.unit === 'mL' ? 'selected' : ''}>mL (millilitres)</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-product-calories">Calories/100g</label>
          <input type="number" id="edit-product-calories" min="0" step="0.1" value="${product.calories_per_100g || ''}" />
        </div>
        <div class="form-group">
          <label for="edit-product-protein">Protein/100g</label>
          <input type="number" id="edit-product-protein" min="0" step="0.1" value="${product.protein_per_100g || ''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-product-carbs">Carbs/100g</label>
          <input type="number" id="edit-product-carbs" min="0" step="0.1" value="${product.carbs_per_100g || ''}" />
        </div>
        <div class="form-group">
          <label for="edit-product-fat">Fat/100g</label>
          <input type="number" id="edit-product-fat" min="0" step="0.1" value="${product.fat_per_100g || ''}" />
        </div>
      </div>
      <div class="form-group">
        <label for="edit-product-notes">Notes</label>
        <textarea id="edit-product-notes">${escapeHtml(product.notes || '')}</textarea>
      </div>
      <div class="form-group preset-section ${product.unit ? '' : 'hidden'}" id="modal-preset-section">
        <label>Quantity Presets</label>
        <div id="modal-preset-rows">${buildPresetRowsHtml(product.presets, product.unit)}</div>
        <button type="button" id="modal-add-preset-btn" class="link-button">＋ Add preset</button>
      </div>
      <div class="button-group">
        <button type="submit" class="btn-primary">Save</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal(formHtml);

  const modalPresetRows = document.getElementById("modal-preset-rows");
  const currentUnit = product.unit;
  attachPresetRowListeners(modalPresetRows, currentUnit);
  updatePresetAddBtn(modalPresetRows);

  document.getElementById("edit-product-unit").addEventListener("change", function() {
    const presetSection = document.getElementById("modal-preset-section");
    const newUnit = this.value;
    if (newUnit) {
      presetSection.classList.remove("hidden");
    } else {
      presetSection.classList.add("hidden");
      modalPresetRows.innerHTML = "";
    }
  });

  document.getElementById("modal-add-preset-btn").addEventListener("click", (e) => {
    e.preventDefault();
    const newUnit = document.getElementById("edit-product-unit").value;
    if (modalPresetRows.querySelectorAll(".preset-row").length < 4) {
      const newRow = document.createElement("div");
      newRow.innerHTML = buildPresetRowHtml("", newUnit, modalPresetRows.querySelectorAll(".preset-row").length);
      modalPresetRows.appendChild(newRow.firstElementChild);
      attachPresetRowListeners(modalPresetRows, newUnit);
      updatePresetAddBtn(modalPresetRows);
    }
  });

  document.getElementById("edit-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("modal-error");

    const name = document.getElementById("edit-product-name").value.trim();
    if (!name) {
      showError("modal-error", "Product name is required.");
      return;
    }

    const submitBtn = document.querySelector("#edit-product-form button[type='submit']");
    submitBtn.disabled = true;

    try {
      const currentUnit = document.getElementById("edit-product-unit").value || null;
      const presets = collectPresets(document.getElementById("modal-preset-rows"), currentUnit);
      const payload = {
        name,
        brand: document.getElementById("edit-product-brand").value.trim() || null,
        calories_per_100g: document.getElementById("edit-product-calories").value ? parseFloat(document.getElementById("edit-product-calories").value) : null,
        protein_per_100g: document.getElementById("edit-product-protein").value ? parseFloat(document.getElementById("edit-product-protein").value) : null,
        carbs_per_100g: document.getElementById("edit-product-carbs").value ? parseFloat(document.getElementById("edit-product-carbs").value) : null,
        fat_per_100g: document.getElementById("edit-product-fat").value ? parseFloat(document.getElementById("edit-product-fat").value) : null,
        notes: document.getElementById("edit-product-notes").value.trim() || null,
        category: document.getElementById("edit-product-category").value,
        unit: currentUnit,
        presets: presets
      };

      const response = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.detail || errorData.message || "Failed to update product";
        throw new Error(errorMsg);
      }

      const updatedProduct = await response.json();

      // Update products array
      const index = products.findIndex(p => p.id === updatedProduct.id);
      if (index !== -1) {
        products[index] = updatedProduct;
      }

      closeModal();
      loadPantryProducts();
      showSuccess("pantry-success", "Product updated ✓");
    } catch (err) {
      showError("modal-error", `Error: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

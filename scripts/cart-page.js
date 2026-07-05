(function () {
  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function holdText(item) {
    if (!item.holdExpiresAt) return "";
    const expiresAt = Date.parse(item.holdExpiresAt);
    if (!Number.isFinite(expiresAt)) return "";
    const minutes = Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000));
    return minutes ? `Reserved for ${minutes} more minute${minutes === 1 ? "" : "s"}.` : "Reservation expired.";
  }

  function inventoryText(item) {
    if (!Number.isFinite(Number(item.stockLevel))) return "";
    return `${Number(item.stockLevel)} in stock before cart holds.`;
  }

  async function renderCart(message = "") {
    const list = document.querySelector("#cartItems");
    const summary = document.querySelector("#cartSummary");
    if (!list || !summary) return;

    const items = window.BeyondPepsCart.readCart();
    if (!items.length) {
      list.innerHTML = `<div class="empty-state glass-panel"><h2>Your cart is empty.</h2><p>Add research supplies from the shop to begin an order.</p><a class="button primary" href="shop.html">Shop products</a></div>`;
      summary.innerHTML = "";
      return;
    }

    list.innerHTML = items.map((item) => `
      <article class="cart-item glass-panel" data-cart-item="${escapeHtml(item.id)}">
        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">` : ""}
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${money(item.price)} each</p>
          ${inventoryText(item) ? `<p class="cart-stock">${escapeHtml(inventoryText(item))}</p>` : ""}
          ${holdText(item) ? `<p class="cart-hold">${escapeHtml(holdText(item))}</p>` : ""}
        </div>
        <label>
          Qty
          <input class="cart-qty" type="number" min="0" step="1" value="${item.quantity}">
        </label>
        <strong>${money(item.price * item.quantity)}</strong>
      </article>
    `).join("");

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    summary.innerHTML = `
      <div class="glass-panel cart-summary-card">
        <div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <p>Items added to cart are reserved for ${window.BeyondPepsCart.holdMinutes} minutes, then released if checkout is not completed.</p>
        ${message ? `<p class="cart-message">${escapeHtml(message)}</p>` : ""}
        <button class="button primary" id="checkoutCheck" type="button">Check inventory & checkout</button>
        <button class="button ghost" id="clearCart" type="button">Clear cart</button>
      </div>
    `;

    document.querySelectorAll(".cart-item").forEach((row) => {
      row.querySelector(".cart-qty").addEventListener("change", async (event) => {
        window.BeyondPepsCart.updateItem(row.dataset.cartItem, Math.max(0, Number.parseInt(event.target.value, 10) || 0));
        await renderCart();
      });
    });

    document.querySelector("#checkoutCheck").addEventListener("click", async () => {
      const button = document.querySelector("#checkoutCheck");
      button.disabled = true;
      button.textContent = "Checking inventory...";
      const result = await window.BeyondPepsCart.validateCheckout();
      if (result.ok) {
        await renderCart("Inventory check passed. Payment connection is the next step.");
      } else {
        const unavailable = (result.unavailable || []).map((item) => `${item.id}: ${item.available ?? 0} available`).join("; ");
        await renderCart(result.message || `Some items are no longer available. ${unavailable}`);
      }
    });

    document.querySelector("#clearCart").addEventListener("click", async () => {
      window.BeyondPepsCart.clearCart();
      await renderCart();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.BeyondPepsCart.reserveCart().then(() => renderCart());
  });
})();

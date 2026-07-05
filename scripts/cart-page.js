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

  function renderCart() {
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
        <p>Payment options will connect here later. Your cart is saved locally in this browser for now.</p>
        <button class="button primary" type="button" disabled>Checkout coming soon</button>
        <button class="button ghost" id="clearCart" type="button">Clear cart</button>
      </div>
    `;

    document.querySelectorAll(".cart-item").forEach((row) => {
      row.querySelector(".cart-qty").addEventListener("input", (event) => {
        window.BeyondPepsCart.updateItem(row.dataset.cartItem, Math.max(0, Number.parseInt(event.target.value, 10) || 0));
        renderCart();
      });
    });

    document.querySelector("#clearCart").addEventListener("click", () => {
      window.BeyondPepsCart.clearCart();
      renderCart();
    });
  }

  document.addEventListener("DOMContentLoaded", renderCart);
})();

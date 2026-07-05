(function () {
  async function loadProductPage() {
    const root = document.querySelector("#productDetail");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");
    const content = await window.BeyondPepsSite.loadContent();
    const product = content.products.find((item) => item.id === productId);

    if (!product) {
      root.innerHTML = `
        <section class="page-hero">
          <p class="eyebrow">Product not found</p>
          <h1>We could not find that product.</h1>
          <p>Return to the shop to browse the current research catalog.</p>
          <a class="button primary" href="shop.html">Back to shop</a>
        </section>
      `;
      return;
    }

    document.title = `${product.name} | Beyond Peps`;
    root.innerHTML = `
      <section class="product-detail section">
        <div class="product-detail-media glass-panel">
          ${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}">` : ""}
        </div>
        <div class="product-detail-copy">
          <p class="eyebrow">${escapeHtml(product.category || "Research Supplies")}</p>
          <h1>${escapeHtml(product.name)}</h1>
          <p class="product-detail-summary">${escapeHtml(product.summary || "")}</p>
          <div class="price">${money(product.price)}</div>
          <p class="status">${escapeHtml(product.status || "Draft")}</p>
          <div class="product-description">
            ${(product.description || product.summary || "").split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          </div>
          <div class="cart-actions glass-panel">
            <label>
              Quantity
              <input id="productQuantity" type="number" min="1" step="1" value="1">
            </label>
            <button class="button primary" id="addToCart" type="button">Add to cart</button>
            <a class="button ghost" href="cart.html">View cart</a>
          </div>
        </div>
      </section>
    `;

    document.querySelector("#addToCart").addEventListener("click", () => {
      const quantity = Math.max(1, Number.parseInt(document.querySelector("#productQuantity").value, 10) || 1);
      window.BeyondPepsCart.addItem(product, quantity);
      document.querySelector("#addToCart").textContent = "Added";
      window.setTimeout(() => {
        document.querySelector("#addToCart").textContent = "Add to cart";
      }, 1200);
    });
  }

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

  loadProductPage();
})();

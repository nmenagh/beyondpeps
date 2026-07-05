(function () {
  const CART_KEY = "beyondPepsCart";

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartBadges();
  }

  function cartCount() {
    return readCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function addItem(product, quantity = 1) {
    const items = readCart();
    const id = product.id;
    const existing = items.find((item) => item.id === id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        id,
        name: product.name,
        price: Number(product.price || 0),
        imageUrl: product.imageUrl || "",
        quantity
      });
    }

    writeCart(items.filter((item) => item.quantity > 0));
  }

  function updateItem(id, quantity) {
    const items = readCart().map((item) => item.id === id ? { ...item, quantity } : item);
    writeCart(items.filter((item) => item.quantity > 0));
  }

  function clearCart() {
    writeCart([]);
  }

  function updateCartBadges() {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = cartCount();
    });
  }

  window.BeyondPepsCart = {
    addItem,
    clearCart,
    readCart,
    updateCartBadges,
    updateItem
  };

  document.addEventListener("DOMContentLoaded", updateCartBadges);
})();

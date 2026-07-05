(function () {
  const CART_KEY = "beyondPepsCart";
  const CART_ID_KEY = "beyondPepsCartId";
  const HOLD_MINUTES = 60;
  const HOLD_MS = HOLD_MINUTES * 60 * 1000;

  function readCart() {
    try {
      const items = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return pruneExpiredItems(Array.isArray(items) ? items : []);
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(pruneExpiredItems(items)));
    updateCartBadges();
  }

  function cartId() {
    let id = localStorage.getItem(CART_ID_KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() || `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(CART_ID_KEY, id);
    }
    return id;
  }

  function holdExpiresAt() {
    return new Date(Date.now() + HOLD_MS).toISOString();
  }

  function pruneExpiredItems(items = []) {
    const now = Date.now();
    const active = items.filter((item) => !item.holdExpiresAt || Date.parse(item.holdExpiresAt) > now);
    if (active.length !== items.length) {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(active));
      } catch {}
    }
    return active;
  }

  function normalizeStockLevel(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
  }

  function localAvailability(items, productId, stockLevel) {
    const stock = normalizeStockLevel(stockLevel);
    if (stock === null) return Infinity;
    const heldInCart = items
      .filter((item) => item.id === productId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return Math.max(0, stock - heldInCart);
  }

  async function reserveCart() {
    const items = readCart();

    try {
      const result = await window.BeyondPepsSupabase?.reserveCart?.(cartId(), items);
      if (result?.ok && items.length) {
        const expiresAt = result.expiresAt || holdExpiresAt();
        writeCart(items.map((item) => ({ ...item, holdExpiresAt: expiresAt })));
      }
      return result || { ok: true, unavailable: [] };
    } catch (error) {
      console.warn("Inventory reservation unavailable; cart saved locally.", error);
      return { ok: true, unavailable: [], warning: error.message };
    }
  }

  function cartCount() {
    return readCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function addItem(product, quantity = 1) {
    const items = readCart();
    const id = product.id;
    const existing = items.find((item) => item.id === id);
    const stockLevel = normalizeStockLevel(product.stockLevel);
    const available = localAvailability(items, id, stockLevel);
    const requested = Math.max(1, Math.floor(Number(quantity || 1)));
    const allowedQuantity = Math.min(requested, available);

    if (allowedQuantity <= 0) {
      return { ok: false, message: "This product is out of stock." };
    }

    if (existing) {
      existing.quantity += allowedQuantity;
      existing.stockLevel = stockLevel;
      existing.holdExpiresAt = holdExpiresAt();
    } else {
      items.push({
        id,
        name: product.name,
        price: Number(product.price || 0),
        imageUrl: product.imageUrl || "",
        quantity: allowedQuantity,
        stockLevel,
        holdExpiresAt: holdExpiresAt()
      });
    }

    writeCart(items.filter((item) => item.quantity > 0));
    reserveCart();
    return {
      ok: allowedQuantity === requested,
      quantity: allowedQuantity,
      message: allowedQuantity === requested ? "Added to cart." : `Only ${allowedQuantity} available to reserve.`
    };
  }

  function updateItem(id, quantity) {
    const requested = Math.max(0, Math.floor(Number(quantity || 0)));
    const items = readCart().map((item) => {
      if (item.id !== id) return item;
      const stockLevel = normalizeStockLevel(item.stockLevel);
      const nextQuantity = stockLevel === null ? requested : Math.min(requested, stockLevel);
      return { ...item, quantity: nextQuantity, holdExpiresAt: holdExpiresAt() };
    });
    writeCart(items.filter((item) => item.quantity > 0));
    reserveCart();
  }

  function clearCart() {
    writeCart([]);
    reserveCart();
  }

  async function validateCheckout() {
    const items = readCart();
    if (!items.length) return { ok: false, unavailable: [], message: "Your cart is empty." };

    try {
      const result = await window.BeyondPepsSupabase?.validateCheckout?.(cartId(), items);
      return result || { ok: true, unavailable: [] };
    } catch (error) {
      return {
        ok: false,
        unavailable: [],
        message: `Inventory check failed: ${error.message}`
      };
    }
  }

  function updateCartBadges() {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = cartCount();
    });
  }

  window.BeyondPepsCart = {
    addItem,
    cartId,
    clearCart,
    holdMinutes: HOLD_MINUTES,
    readCart,
    reserveCart,
    updateCartBadges,
    updateItem,
    validateCheckout
  };

  document.addEventListener("DOMContentLoaded", updateCartBadges);
})();

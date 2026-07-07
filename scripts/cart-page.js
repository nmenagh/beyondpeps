(function () {
  const SHIPPING_ADDRESS_KEY = "beyondPepsShippingAddress";
  const SHIPPING_RATE_KEY = "beyondPepsShippingRate";
  const SHIPPING_RATES_KEY = "beyondPepsShippingRates";
  const PAYMENT_METHOD_KEY = "beyondPepsPaymentMethod";
  const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS",
    "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM",
    "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI",
    "WV", "WY", "DC"
  ];

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readShippingAddress() {
    return readJson(SHIPPING_ADDRESS_KEY, {
      name: "",
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: ""
    });
  }

  function readShippingRate() {
    return readJson(SHIPPING_RATE_KEY, null);
  }

  function readShippingRates() {
    return readJson(SHIPPING_RATES_KEY, []);
  }

  function readSiteContent() {
    if (window.BeyondPepsContent) return window.BeyondPepsContent;
    return readJson("beyondPepsContent", window.BEYOND_PEPS_DEFAULT_CONTENT || {});
  }

  function shippingMethodSettings() {
    const settings = readSiteContent()?.site?.shippingMethods || {};
    const enabledServicelevels = Array.isArray(settings.enabledServicelevels)
      ? settings.enabledServicelevels
      : [];
    const customServicelevels = String(settings.customServicelevels || "")
      .split(/[\n,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    return {
      enabledServicelevels: [...new Set([...enabledServicelevels, ...customServicelevels])]
    };
  }

  function paymentMethodSettings() {
    const zelle = readSiteContent()?.site?.paymentMethods?.zelle || {};
    return {
      zelle: {
        enabled: zelle.enabled !== false,
        displayName: zelle.displayName || "Zelle",
        recipientName: zelle.recipientName || "",
        recipientEmail: zelle.recipientEmail || "",
        recipientPhone: zelle.recipientPhone || "",
        memoInstructions: zelle.memoInstructions || "Include your order number in the Zelle memo.",
        confirmationIntro: zelle.confirmationIntro || "Your order is reserved. Send payment with Zelle using the details below, then keep your order number for reference."
      }
    };
  }

  function readPaymentMethod() {
    return localStorage.getItem(PAYMENT_METHOD_KEY) || "zelle";
  }

  function shippingLabel(rate) {
    const parts = [rate.provider, rate.servicelevel].filter(Boolean);
    return parts.join(" - ") || "Shipping";
  }

  function deliveryText(rate) {
    if (rate.estimatedDays) return `${rate.estimatedDays} business day${rate.estimatedDays === 1 ? "" : "s"}`;
    if (rate.durationTerms) return rate.durationTerms;
    return "Delivery estimate unavailable";
  }

  function renderShippingForm(address, selectedRate, rates = [], message = "") {
    const stateOptions = [`<option value="">State</option>`]
      .concat(US_STATES.map((state) => `<option value="${state}"${address.state === state ? " selected" : ""}>${state}</option>`))
      .join("");

    return `
      <div class="glass-panel shipping-card">
        <div class="shipping-heading">
          <div>
            <p class="eyebrow">Shipping</p>
            <h2>Calculate delivery options</h2>
          </div>
          ${selectedRate ? `<strong>${money(selectedRate.amount)}</strong>` : ""}
        </div>
        <div class="shipping-form" id="shippingForm">
          <label class="field-wide">Ship-to name<input name="name" autocomplete="name" value="${escapeHtml(address.name)}" required></label>
          <label>Street address<input name="street1" autocomplete="shipping address-line1" value="${escapeHtml(address.street1)}" required></label>
          <label>Apt / suite<input name="street2" autocomplete="shipping address-line2" value="${escapeHtml(address.street2)}"></label>
          <label>City<input name="city" autocomplete="shipping address-level2" value="${escapeHtml(address.city)}" required></label>
          <label>State<select name="state" autocomplete="shipping address-level1" required>${stateOptions}</select></label>
          <label>ZIP<input name="zip" autocomplete="shipping postal-code" inputmode="numeric" value="${escapeHtml(address.zip)}" required></label>
          <label>Phone<input name="phone" autocomplete="tel" value="${escapeHtml(address.phone)}"></label>
          <label class="field-wide">Email<input name="email" autocomplete="email" value="${escapeHtml(address.email)}"></label>
        </div>
        <button class="button primary" id="calculateShipping" type="button">Calculate shipping methods</button>
        ${message ? `<p class="cart-message">${escapeHtml(message)}</p>` : ""}
        ${rates.length ? `
          <div class="shipping-rates" role="radiogroup" aria-label="Shipping methods">
            ${rates.map((rate) => `
              <label class="shipping-rate ${selectedRate?.id === rate.id ? "is-selected" : ""}">
                <input type="radio" name="shippingRate" value="${escapeHtml(rate.id)}"${selectedRate?.id === rate.id ? " checked" : ""}>
                <span>
                  <strong>${escapeHtml(shippingLabel(rate))}</strong>
                  <small>${escapeHtml(deliveryText(rate))}</small>
                </span>
                <b>${money(rate.amount)}</b>
              </label>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderPaymentOptions(settings, selectedMethod) {
    const options = [];
    if (settings.zelle?.enabled) {
      options.push(`
        <label class="payment-rate ${selectedMethod === "zelle" ? "is-selected" : ""}">
          <input type="radio" name="paymentMethod" value="zelle"${selectedMethod === "zelle" ? " checked" : ""}>
          <span>
            <strong>${escapeHtml(settings.zelle.displayName || "Zelle")}</strong>
            <small>Place the order now and receive payment instructions by email.</small>
          </span>
        </label>
      `);
    }

    return `
      <div class="glass-panel payment-card">
        <div class="shipping-heading">
          <div>
            <p class="eyebrow">Payment</p>
            <h2>Choose payment method</h2>
          </div>
        </div>
        ${options.length ? `<div class="payment-rates">${options.join("")}</div>` : `<p class="cart-message is-error">No payment methods are currently enabled.</p>`}
      </div>
    `;
  }

  function renderZelleInstructions(settings, order) {
    const zelle = settings.zelle || {};
    const details = [
      zelle.recipientName ? ["Name", zelle.recipientName] : null,
      zelle.recipientEmail ? ["Email", zelle.recipientEmail] : null,
      zelle.recipientPhone ? ["Phone", zelle.recipientPhone] : null,
      ["Memo", order.paymentReference || order.orderNumber || ""]
    ].filter(Boolean);

    return `
      <div class="cart-message zelle-instructions">
        <strong>${escapeHtml(zelle.confirmationIntro || "Send your Zelle payment using the details below.")}</strong>
        <dl>
          ${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
        </dl>
        <p>${escapeHtml(zelle.memoInstructions || "Include your order number in the Zelle memo.")}</p>
      </div>
    `;
  }

  function collectShippingAddress() {
    const form = document.querySelector("#shippingForm");
    const data = Object.fromEntries([...form.querySelectorAll("input, select")].map((field) => [field.name, field.value.trim()]));
    writeJson(SHIPPING_ADDRESS_KEY, data);
    return data;
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
    const selectedRate = readShippingRate();
    const paymentSettings = paymentMethodSettings();
    const selectedPaymentMethod = readPaymentMethod();
    const total = subtotal + Number(selectedRate?.amount || 0);
    summary.innerHTML = `
      ${renderShippingForm(readShippingAddress(), selectedRate, readShippingRates())}
      ${renderPaymentOptions(paymentSettings, selectedPaymentMethod)}
      <div class="glass-panel cart-summary-card">
        <div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div><span>Shipping</span><strong>${selectedRate ? money(selectedRate.amount) : "Select method"}</strong></div>
        <div class="summary-total"><span>Estimated total</span><strong>${money(total)}</strong></div>
        <p>Items added to cart are reserved for ${window.BeyondPepsCart.holdMinutes} minutes, then released if checkout is not completed.</p>
        ${message ? `<p class="cart-message">${escapeHtml(message)}</p>` : ""}
        <button class="button primary" id="checkoutCheck" type="button">Place order</button>
        <button class="button ghost" id="clearCart" type="button">Clear cart</button>
      </div>
    `;

    document.querySelectorAll(".cart-item").forEach((row) => {
      row.querySelector(".cart-qty").addEventListener("change", async (event) => {
        window.BeyondPepsCart.updateItem(row.dataset.cartItem, Math.max(0, Number.parseInt(event.target.value, 10) || 0));
        await renderCart();
      });
    });

    document.querySelector("#shippingForm").addEventListener("input", () => {
      collectShippingAddress();
      localStorage.removeItem(SHIPPING_RATE_KEY);
      localStorage.removeItem(SHIPPING_RATES_KEY);
    });

    document.querySelector("#calculateShipping").addEventListener("click", async () => {
      const button = document.querySelector("#calculateShipping");
      const address = collectShippingAddress();
      button.disabled = true;
      button.textContent = "Calculating...";

      try {
        const response = await fetch("/api/shipping-rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, items, shippingMethods: shippingMethodSettings() })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to calculate shipping.");
        const rates = data.rates || [];
        if (!rates.length) {
          await renderCart("No shipping methods were returned for that address.");
          return;
        }
        writeJson(SHIPPING_RATES_KEY, rates);
        writeJson(SHIPPING_RATE_KEY, rates[0]);
        await renderCart("Choose your preferred shipping method.");
      } catch (error) {
        await renderCart(error.message);
      }
    });

    function attachShippingRateHandlers(rates = []) {
      document.querySelectorAll("input[name='shippingRate']").forEach((input) => {
        input.addEventListener("change", async () => {
          const rate = rates.find((item) => item.id === input.value);
          if (rate) {
            writeJson(SHIPPING_RATE_KEY, rate);
            await renderCart();
          }
        });
      });
    }
    attachShippingRateHandlers(readShippingRates());

    document.querySelectorAll("input[name='paymentMethod']").forEach((input) => {
      input.addEventListener("change", async () => {
        localStorage.setItem(PAYMENT_METHOD_KEY, input.value);
        await renderCart();
      });
    });

    document.querySelector("#checkoutCheck").addEventListener("click", async () => {
      const button = document.querySelector("#checkoutCheck");
      button.disabled = true;
      button.textContent = "Placing order...";
      if (!readShippingRate()) {
        await renderCart("Please calculate and select a shipping method before checkout.");
        return;
      }
      const address = collectShippingAddress();
      if (!address.email) {
        await renderCart("Please add an email address so we can send your order confirmation.");
        return;
      }
      if (readPaymentMethod() !== "zelle" || !paymentSettings.zelle?.enabled) {
        await renderCart("Please choose an available payment method.");
        return;
      }
      const result = await window.BeyondPepsCart.validateCheckout();
      if (!result.ok) {
        const unavailable = (result.unavailable || []).map((item) => `${item.id}: ${item.available ?? 0} available`).join("; ");
        await renderCart(result.message || `Some items are no longer available. ${unavailable}`);
        return;
      }

      try {
        const order = await window.BeyondPepsSupabase.createZelleOrder({
          cartId: window.BeyondPepsCart.cartId(),
          customer: { name: address.name, email: address.email, phone: address.phone },
          shippingAddress: address,
          shippingRate: readShippingRate(),
          items
        });
        if (!order?.ok) throw new Error(order?.message || "Order could not be placed.");

        const emailResult = await sendOrderConfirmation(order, address, items, readShippingRate(), paymentSettings);
        window.BeyondPepsCart.clearCart();
        localStorage.removeItem(SHIPPING_RATE_KEY);
        localStorage.removeItem(SHIPPING_RATES_KEY);
        const emailText = emailResult?.sent ? " A confirmation email has been sent." : " Email is not configured yet, so save these payment details.";
        await renderCart(`Order ${order.orderNumber} placed.${emailText}`);
        document.querySelector("#cartItems").innerHTML = `
          <div class="empty-state glass-panel">
            <h2>Order ${escapeHtml(order.orderNumber)} placed.</h2>
            <p>Your order is reserved while Zelle payment is matched.</p>
            ${renderZelleInstructions(paymentSettings, order)}
            <a class="button primary" href="shop.html">Continue shopping</a>
          </div>
        `;
      } catch (error) {
        await renderCart(error.message);
      }
    });

    document.querySelector("#clearCart").addEventListener("click", async () => {
      window.BeyondPepsCart.clearCart();
      await renderCart();
    });
  }

  async function sendOrderConfirmation(order, address, items, shippingRate, paymentSettings) {
    try {
      const response = await fetch("/api/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order_confirmation",
          customer: { name: address.name, email: address.email, phone: address.phone },
          order,
          items,
          shippingRate,
          paymentSettings
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Confirmation email failed.");
      return data;
    } catch (error) {
      console.warn("Confirmation email did not send.", error);
      return { sent: false, reason: error.message };
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const contentReady = window.BeyondPepsSite?.loadContent
      ? window.BeyondPepsSite.loadContent().then((content) => {
        if (content) window.BeyondPepsContent = content;
      })
      : Promise.resolve();
    contentReady
      .catch((error) => console.warn("Cart content refresh unavailable.", error))
      .then(() => window.BeyondPepsCart.reserveCart())
      .then(() => renderCart());
  });
})();

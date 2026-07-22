(function () {
  const authForm = document.querySelector("#authForm");
  const signUpForm = document.querySelector("#signUpForm");
  const profileForm = document.querySelector("#profileForm");
  const authStatus = document.querySelector("#authStatus");
  const signUpStatus = document.querySelector("#signUpStatus");
  const profileStatus = document.querySelector("#profileStatus");
  const adminLink = document.querySelector("#accountAdminLink");
  const settingsForm = document.querySelector("#settingsForm");
  const passwordForm = document.querySelector("#passwordForm");
  const orderList = document.querySelector("#orderList");
  const orderDetail = document.querySelector("#orderDetail");
  const ordersEmpty = document.querySelector("#ordersEmpty");
  const billingSameAsShipping = document.querySelector("#billingSameAsShipping");

  const addressKeys = ["name", "line1", "line2", "city", "state", "postal"];
  const states = [
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["DC", "District of Columbia"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"]
  ];
  let activeUser = null;
  let activeProfile = null;

  function setStatus(node, message) {
    if (node) node.textContent = message;
  }

  function setAdminVisible(isVisible) {
    adminLink?.classList.toggle("is-hidden", !isVisible);
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function inputValue(selector) {
    return document.querySelector(selector)?.value.trim() || "";
  }

  function addressFrom(prefix) {
    return {
      ...Object.fromEntries(addressKeys.map((key) => [key, inputValue(`#${prefix}${capitalize(key)}`)])),
      country: "United States"
    };
  }

  function addressHasContent(address = {}) {
    return addressKeys.some((key) => Boolean(address[key]));
  }

  function fillAddress(prefix, data = {}) {
    addressKeys.forEach((key) => {
      const node = document.querySelector(`#${prefix}${capitalize(key)}`);
      if (node) node.value = data[key] || "";
    });
  }

  function populateStateSelects() {
    document.querySelectorAll("[data-state-select]").forEach((select) => {
      select.innerHTML = [
        '<option value="">Select state</option>',
        ...states.map(([value, label]) => `<option value="${value}">${label}</option>`)
      ].join("");
    });
  }

  function copyShippingToBilling() {
    addressKeys.forEach((key) => {
      const shipping = document.querySelector(`#ship${capitalize(key)}`);
      const billing = document.querySelector(`#bill${capitalize(key)}`);
      if (shipping && billing) billing.value = shipping.value;
    });
  }

  function setBillingFieldsLocked(isLocked) {
    addressKeys.forEach((key) => {
      const node = document.querySelector(`#bill${capitalize(key)}`);
      if (node) node.disabled = isLocked;
    });
  }

  function syncBillingPreference() {
    const isSame = Boolean(billingSameAsShipping?.checked);
    if (isSame) copyShippingToBilling();
    setBillingFieldsLocked(isSame);
  }

  function formatAddressSummary(shipping = {}, billing = {}) {
    const hasShipping = addressHasContent(shipping);
    const hasBilling = addressHasContent(billing);
    if (hasShipping && hasBilling) return "Shipping and billing saved";
    if (hasShipping) return "Shipping saved";
    if (hasBilling) return "Billing saved";
    return "Add your checkout details";
  }

  function addressesMatch(shipping = {}, billing = {}) {
    return addressHasContent(shipping) && addressKeys.every((key) => (shipping[key] || "") === (billing[key] || ""));
  }

  function moneyFromCents(cents = 0, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD"
    }).format(Number(cents || 0) / 100);
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

  function formatOrderDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  }

  function nameParts(fullName = "") {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      first: parts.shift() || "",
      last: parts.join(" ")
    };
  }

  function setActivePanel(name) {
    document.querySelectorAll("[data-account-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.accountPanel === name);
    });

    document.querySelectorAll("[data-account-panel-trigger]").forEach((trigger) => {
      trigger.classList.toggle("is-active", trigger.dataset.accountPanelTrigger === name);
    });
  }

  function updateProfileSummaries(user, profile) {
    const fullName = profile?.full_name || "";
    const email = user?.email || profile?.email || "";
    const parts = nameParts(fullName);
    const firstName = parts.first || "there";
    document.querySelector("#accountGreeting").textContent = `Welcome back, ${firstName}`;
    document.querySelector("#firstName").value = parts.first;
    document.querySelector("#lastName").value = parts.last;
    document.querySelector("#profileEmail").value = email;
    document.querySelector("#profilePhone").value = profile?.phone || "";
    fillAddress("ship", profile?.shipping_address || {});
    fillAddress("bill", profile?.billing_address || {});
    if (billingSameAsShipping) {
      billingSameAsShipping.checked = addressesMatch(profile?.shipping_address, profile?.billing_address);
    }
    setStatus(profileStatus, `${formatAddressSummary(profile?.shipping_address, profile?.billing_address)}. Signed in as ${email}.`);
    syncBillingPreference();
  }

  function renderOrders(orders = []) {
    ordersEmpty?.classList.toggle("is-hidden", orders.length > 0);
    orderList?.classList.toggle("is-hidden", orders.length === 0);
    orderDetail?.classList.add("is-hidden");
    if (!orderList) return;

    orderList.innerHTML = orders.map((order) => `
      <button class="order-row" type="button" data-order-id="${escapeHtml(order.id)}">
        <div>
          <span class="tile-kicker">${formatOrderDate(order.created_at)}</span>
          <strong>Order ${String(order.id).slice(0, 8)}</strong>
        </div>
        <span>${order.status || "pending"}</span>
        <strong>${moneyFromCents(order.total_cents, order.currency)}</strong>
      </button>
    `).join("");

    orderList.querySelectorAll("[data-order-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const order = orders.find((item) => item.id === button.dataset.orderId);
        if (order) renderOrderDetail(order);
      });
    });
  }

  function orderAddressLines(address = {}) {
    return [
      address.name,
      address.street1 || address.line1,
      address.street2 || address.line2,
      [address.city, address.state, address.zip || address.postal].filter(Boolean).join(", "),
      address.phone,
      address.email
    ].filter(Boolean);
  }

  function orderTracking(order = {}) {
    const shipments = Array.isArray(order.order_shipments) ? order.order_shipments : [];
    if (shipments.length) {
      return shipments
        .slice()
        .sort((left, right) => Number(left.package_number || 1) - Number(right.package_number || 1))
        .map((shipment) => ({
          ...shipment,
          trackingNumber: shipment.tracking_number || "",
          trackingUrl: shipment.tracking_url || "",
          trackingCarrier: shipment.carrier || ""
        }));
    }
    const labels = Array.isArray(order.shipping_method?.labels) ? order.shipping_method.labels : [];
    if (labels.length) return labels;
    if (!order.tracking_number && !order.tracking_url) return [];
    return [{
      trackingNumber: order.tracking_number || "",
      trackingUrl: order.tracking_url || "",
      trackingCarrier: order.tracking_carrier || order.shipping_provider || ""
    }];
  }

  function trackingStatusLabel(status = "") {
    const labels = {
      PRE_TRANSIT: "Label created",
      TRANSIT: "In transit",
      DELIVERED: "Delivered",
      RETURNED: "Returning to sender",
      FAILURE: "Delivery issue",
      UNKNOWN: "Tracking pending"
    };
    return labels[String(status).toUpperCase()] || String(status || "Tracking pending").replace(/_/g, " ");
  }

  function trackingDate(value, includeTime = false) {
    if (!value || Number.isNaN(Date.parse(value))) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
    }).format(new Date(value));
  }

  function trackingLocation(location = {}) {
    return [location.city, location.state, location.country].filter(Boolean).join(", ");
  }

  function trackingHistory(shipment = {}) {
    const history = Array.isArray(shipment.tracking_history) ? shipment.tracking_history : [];
    return history.slice(-4).reverse();
  }

  function renderTrackingShipment(shipment, index) {
    const status = String(shipment.status || "UNKNOWN").toUpperCase();
    const delivered = status === "DELIVERED";
    const eta = !delivered && trackingDate(shipment.eta);
    const statusDate = trackingDate(shipment.delivered_at || shipment.status_date, true);
    const location = trackingLocation(shipment.location);
    const history = trackingHistory(shipment);
    const detail = shipment.substatus_text || shipment.status_details || "";

    return `
      <article class="shipment-card shipment-${escapeHtml(status.toLowerCase())}">
        <div class="shipment-heading">
          <div>
            <span class="shipment-package">Package ${escapeHtml(shipment.package_number || index + 1)}</span>
            <strong>${escapeHtml(shipment.trackingCarrier || "Carrier")}</strong>
          </div>
          <span class="shipment-status">${escapeHtml(trackingStatusLabel(status))}</span>
        </div>
        ${delivered && statusDate ? `<p class="shipment-prominent">Delivered ${escapeHtml(statusDate)}</p>` : ""}
        ${eta ? `<p class="shipment-prominent">Estimated delivery ${escapeHtml(eta)}</p>` : ""}
        ${detail ? `<p class="shipment-detail">${escapeHtml(detail)}</p>` : ""}
        ${location ? `<p class="shipment-location">Latest location: ${escapeHtml(location)}</p>` : ""}
        ${shipment.action_required ? `<p class="shipment-alert">Action may be required. Please use the carrier link for instructions.</p>` : ""}
        <p class="shipment-number">
          <span>${escapeHtml(shipment.trackingNumber || "Tracking pending")}</span>
          ${shipment.trackingUrl ? `<a href="${escapeHtml(shipment.trackingUrl)}" target="_blank" rel="noopener">Track with carrier</a>` : ""}
        </p>
        ${history.length ? `
          <ol class="tracking-timeline">
            ${history.map((event) => `
              <li>
                <span>${escapeHtml(trackingDate(event.status_date, true))}</span>
                <strong>${escapeHtml(trackingStatusLabel(event.status))}</strong>
                <small>${escapeHtml(event.status_details || trackingLocation(event.location) || "Carrier update")}</small>
              </li>
            `).join("")}
          </ol>
        ` : ""}
      </article>
    `;
  }

  function renderOrderDetail(order) {
    if (!orderDetail || !orderList) return;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const tracking = orderTracking(order);
    const shippingMethod = [
      order.shipping_provider || order.shipping_method?.provider,
      order.shipping_service || order.shipping_method?.servicelevel
    ].filter(Boolean).join(" - ");

    orderList.classList.add("is-hidden");
    ordersEmpty?.classList.add("is-hidden");
    orderDetail.classList.remove("is-hidden");
    orderDetail.innerHTML = `
      <div class="order-customer-header">
        <button class="button ghost" id="backToOrderHistory" type="button">Back to orders</button>
        <div>
          <p class="eyebrow">Order ${escapeHtml(String(order.id).slice(0, 8))}</p>
          <h3>${escapeHtml(formatOrderDate(order.created_at))}</h3>
          <span class="order-detail-status">${escapeHtml(order.status || "pending")}</span>
        </div>
      </div>
      <div class="order-customer-grid">
        <section>
          <h4>Order items</h4>
          <div class="order-detail-lines">
            ${items.map((item) => `
              <p>
                <span>${escapeHtml(item.product_title || item.product_name || item.product_slug || "Item")} &times; ${escapeHtml(item.quantity || 1)}</span>
                <strong>${escapeHtml(moneyFromCents(item.total_cents || (item.unit_price_cents || item.price_cents_at_purchase || 0) * (item.quantity || 1), order.currency))}</strong>
              </p>
            `).join("") || "<p>No item details are available.</p>"}
          </div>
        </section>
        <section>
          <h4>Shipping address</h4>
          <address>${orderAddressLines(order.shipping_address).map((line) => escapeHtml(line)).join("<br>") || "No shipping address available."}</address>
          ${shippingMethod ? `<p>${escapeHtml(shippingMethod)}</p>` : ""}
        </section>
        <section>
          <h4>Tracking</h4>
          <div class="shipment-list">
            ${tracking.map(renderTrackingShipment).join("") || "<p>Tracking will appear here after the order ships.</p>"}
          </div>
        </section>
        <section>
          <h4>Totals</h4>
          <div class="order-detail-lines">
            <p><span>Subtotal</span><strong>${escapeHtml(moneyFromCents(order.subtotal_cents, order.currency))}</strong></p>
            <p><span>Shipping</span><strong>${escapeHtml(moneyFromCents(order.shipping_cents, order.currency))}</strong></p>
            <p><span>Total</span><strong>${escapeHtml(moneyFromCents(order.total_cents, order.currency))}</strong></p>
          </div>
        </section>
      </div>
    `;
    orderDetail.querySelector("#backToOrderHistory")?.addEventListener("click", () => {
      orderDetail.classList.add("is-hidden");
      orderList.classList.remove("is-hidden");
    });
  }

  async function saveProfilePatch(patch = {}) {
    if (!activeProfile) activeProfile = await window.BeyondPepsSupabase.loadProfile();
    activeProfile = await window.BeyondPepsSupabase.saveProfile({
      full_name: activeProfile?.full_name || "",
      phone: activeProfile?.phone || "",
      shipping_address: activeProfile?.shipping_address || {},
      billing_address: activeProfile?.billing_address || {},
      ...patch
    });
    activeUser = await window.BeyondPepsSupabase.currentUser();
    updateProfileSummaries(activeUser, activeProfile);
    return activeProfile;
  }

  async function showProfile() {
    const user = await window.BeyondPepsSupabase.currentUser();
    if (!user) {
      authForm.classList.remove("is-hidden");
      signUpForm?.classList.add("is-hidden");
      profileForm.classList.add("is-hidden");
      setAdminVisible(false);
      activeUser = null;
      activeProfile = null;
      return;
    }

    authForm.classList.add("is-hidden");
    signUpForm?.classList.add("is-hidden");
    profileForm.classList.remove("is-hidden");
    activeUser = user;
    activeProfile = await window.BeyondPepsSupabase.loadProfile();
    updateProfileSummaries(activeUser, activeProfile);
    setAdminVisible(await window.BeyondPepsSupabase.currentUserIsAdmin());
    setStatus(profileStatus, `Signed in as ${user.email}`);

    try {
      renderOrders(await window.BeyondPepsSupabase.loadOrders());
    } catch (error) {
      renderOrders([]);
      setStatus(profileStatus, `Signed in as ${user.email}. Order history is unavailable.`);
    }
  }

  document.querySelectorAll("[data-account-panel-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => setActivePanel(trigger.dataset.accountPanelTrigger));
  });

  billingSameAsShipping?.addEventListener("change", syncBillingPreference);
  addressKeys.forEach((key) => {
    const shippingField = document.querySelector(`#ship${capitalize(key)}`);
    const syncIfChecked = () => {
      if (billingSameAsShipping?.checked) copyShippingToBilling();
    };
    shippingField?.addEventListener("input", syncIfChecked);
    shippingField?.addEventListener("change", syncIfChecked);
  });

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = inputValue("#accountEmail");
    const password = document.querySelector("#accountPassword")?.value || "";

    try {
      await window.BeyondPepsSupabase.signIn(email, password);
      window.BeyondPepsAnalytics?.track("login");
      setStatus(authStatus, "Signed in.");
      await showProfile();
      window.BeyondPepsSite?.updateAccountPill?.();
    } catch (error) {
      setStatus(authStatus, `Sign in failed: ${error.message}`);
    }
  });

  document.querySelector("#showSignUpButton")?.addEventListener("click", () => {
    authForm.classList.add("is-hidden");
    signUpForm?.classList.remove("is-hidden");
    document.querySelector("#signUpFirstName")?.focus();
  });

  document.querySelector("#backToSignInButton")?.addEventListener("click", () => {
    signUpForm?.classList.add("is-hidden");
    authForm.classList.remove("is-hidden");
    document.querySelector("#accountEmail")?.focus();
  });

  signUpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#signUpPassword")?.value || "";
    const passwordConfirm = document.querySelector("#signUpPasswordConfirm")?.value || "";

    if (password !== passwordConfirm) {
      setStatus(signUpStatus, "Account creation failed: passwords do not match.");
      return;
    }

    const firstName = inputValue("#signUpFirstName");
    const lastName = inputValue("#signUpLastName");
    const email = inputValue("#signUpEmail");

    try {
      const result = await window.BeyondPepsSupabase.signUp(email, password, {
        full_name: [firstName, lastName].filter(Boolean).join(" ")
      });
      window.BeyondPepsAnalytics?.track("sign_up");
      signUpForm.reset();

      if (result.access_token) {
        await showProfile();
        window.BeyondPepsSite?.updateAccountPill?.();
      } else {
        signUpForm.classList.add("is-hidden");
        authForm.classList.remove("is-hidden");
        document.querySelector("#accountEmail").value = email;
        setStatus(authStatus, "Account created. Check your email to confirm your account, then sign in.");
      }
    } catch (error) {
      setStatus(signUpStatus, `Account creation failed: ${error.message}`);
    }
  });

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const nextEmail = inputValue("#profileEmail");
      const fullName = [inputValue("#firstName"), inputValue("#lastName")].filter(Boolean).join(" ");
      const phone = inputValue("#profilePhone");
      const emailChanged = Boolean(nextEmail && nextEmail !== activeUser?.email);
      if (emailChanged) {
        await window.BeyondPepsSupabase.updateAuthUser({ email: nextEmail });
      }
      if (billingSameAsShipping?.checked) copyShippingToBilling();
      await saveProfilePatch({
        full_name: fullName,
        phone,
        shipping_address: addressFrom("ship"),
        billing_address: addressFrom("bill")
      });
      setStatus(profileStatus, emailChanged ? "Account settings saved. Confirm the new email if Supabase requires verification." : "Account settings saved.");
    } catch (error) {
      setStatus(profileStatus, `Profile save failed: ${error.message}`);
    }
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.querySelector("#currentPassword").value;
    const newPassword = document.querySelector("#newPassword").value;
    const confirmPassword = document.querySelector("#confirmPassword").value;

    if (newPassword !== confirmPassword) {
      setStatus(profileStatus, "Password update failed: new passwords do not match.");
      return;
    }

    try {
      await window.BeyondPepsSupabase.signIn(activeUser.email, currentPassword);
      await window.BeyondPepsSupabase.updateAuthUser({ password: newPassword });
      passwordForm.reset();
      await showProfile();
      setStatus(profileStatus, "Password updated.");
    } catch (error) {
      setStatus(profileStatus, `Password update failed: ${error.message}`);
    }
  });

  document.querySelector("#accountSignOut")?.addEventListener("click", () => {
    window.BeyondPepsSupabase.clearSession();
    authForm.classList.remove("is-hidden");
    signUpForm?.classList.add("is-hidden");
    profileForm.classList.add("is-hidden");
    setAdminVisible(false);
    activeUser = null;
    activeProfile = null;
    window.BeyondPepsSite?.updateAccountPill?.();
    setStatus(authStatus, "Signed out.");
  });

  populateStateSelects();
  setActivePanel("orders");
  showProfile().catch((error) => setStatus(authStatus, error.message));
})();

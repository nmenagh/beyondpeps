(function () {
  const authForm = document.querySelector("#authForm");
  const profileForm = document.querySelector("#profileForm");
  const authStatus = document.querySelector("#authStatus");
  const profileStatus = document.querySelector("#profileStatus");
  const adminLink = document.querySelector("#accountAdminLink");
  const settingsForm = document.querySelector("#settingsForm");
  const addressesForm = document.querySelector("#addressesForm");
  const passwordForm = document.querySelector("#passwordForm");
  const orderList = document.querySelector("#orderList");
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
    if (!orderList) return;

    orderList.innerHTML = orders.map((order) => `
      <article class="order-row">
        <div>
          <span class="tile-kicker">${formatOrderDate(order.created_at)}</span>
          <strong>Order ${String(order.id).slice(0, 8)}</strong>
        </div>
        <span>${order.status || "pending"}</span>
        <strong>${moneyFromCents(order.total_cents, order.currency)}</strong>
      </article>
    `).join("");
  }

  async function saveProfilePatch(patch = {}) {
    if (!activeProfile) activeProfile = await window.BeyondPepsSupabase.loadProfile();
    activeProfile = await window.BeyondPepsSupabase.saveProfile({
      full_name: activeProfile?.full_name || "",
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
      profileForm.classList.add("is-hidden");
      setAdminVisible(false);
      activeUser = null;
      activeProfile = null;
      return;
    }

    authForm.classList.add("is-hidden");
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
    try {
      await window.BeyondPepsSupabase.signIn(
        inputValue("#accountEmail"),
        document.querySelector("#accountPassword").value
      );
      setStatus(authStatus, "Signed in.");
      await showProfile();
      window.BeyondPepsSite?.updateAccountPill?.();
    } catch (error) {
      setStatus(authStatus, `Sign in failed: ${error.message}`);
    }
  });

  document.querySelector("#signUpButton")?.addEventListener("click", async () => {
    try {
      await window.BeyondPepsSupabase.signUp(
        inputValue("#accountEmail"),
        document.querySelector("#accountPassword").value
      );
      setStatus(authStatus, "Account created. If email confirmation is enabled, confirm your email before signing in.");
      await showProfile();
      window.BeyondPepsSite?.updateAccountPill?.();
    } catch (error) {
      setStatus(authStatus, `Account creation failed: ${error.message}`);
    }
  });

  settingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const nextEmail = inputValue("#profileEmail");
      const fullName = [inputValue("#firstName"), inputValue("#lastName")].filter(Boolean).join(" ");
      const emailChanged = Boolean(nextEmail && nextEmail !== activeUser?.email);
      if (emailChanged) {
        await window.BeyondPepsSupabase.updateAuthUser({ email: nextEmail });
      }
      await saveProfilePatch({ full_name: fullName });
      setStatus(profileStatus, emailChanged ? "Profile saved. Confirm the new email if Supabase requires verification." : "Profile saved.");
    } catch (error) {
      setStatus(profileStatus, `Profile save failed: ${error.message}`);
    }
  });

  addressesForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (billingSameAsShipping?.checked) copyShippingToBilling();
      await saveProfilePatch({
        shipping_address: addressFrom("ship"),
        billing_address: addressFrom("bill")
      });
      setStatus(profileStatus, "Addresses saved.");
    } catch (error) {
      setStatus(profileStatus, `Address save failed: ${error.message}`);
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

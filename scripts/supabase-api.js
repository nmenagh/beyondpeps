(function () {
  const SESSION_KEY = "beyondPepsSupabaseSession";

  function config() {
    return window.BEYOND_PEPS_SUPABASE || {};
  }

  function isConfigured() {
    const { url, anonKey } = config();
    return Boolean(url && anonKey);
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function request(path, options = {}) {
    const { url, anonKey } = config();
    const activeSession = session();
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${options.authToken || activeSession?.access_token || anonKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers
    };

    const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Supabase request failed: ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function dbStatusToUi(status = "draft") {
    return String(status).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function uiStatusToDb(status = "draft") {
    return String(status).trim().toLowerCase().replace(/\s+/g, "_");
  }

  function productFromDb(product) {
    return {
      id: product.slug || product.id,
      name: product.name || product.title,
      category: product.category || "Research Supplies",
      price: Math.round((product.price_cents || 0) / 100),
      status: dbStatusToUi(product.status),
      summary: product.summary || product.description || "",
      description: product.description || product.summary || "",
      imageUrl: product.image_url || "",
      galleryImages: normalizeGalleryImages(product.gallery_image_urls || [], product.image_url || ""),
      tags: product.tags || [],
      featured: Boolean(product.featured),
      stockLevel: product.inventory_count ?? null,
      mustShipSeparately: Boolean(product.must_ship_separately),
      packageLength: product.package_length_in ?? null,
      packageWidth: product.package_width_in ?? null,
      packageHeight: product.package_height_in ?? null,
      packageWeight: product.package_weight_oz ?? null
    };
  }

  function productToDb(product, index) {
    const slug = product.id || slugify(product.name || `product-${index + 1}`);
    const name = product.name || "Untitled product";
    return {
      slug,
      title: name,
      name,
      category: product.category || "Research Supplies",
      summary: product.summary || "",
      description: product.description || product.summary || "",
      image_url: product.imageUrl || null,
      gallery_image_urls: normalizeGalleryImages(product.galleryImages || [], product.imageUrl || ""),
      price_cents: Math.round(Number(product.price || 0) * 100),
      status: uiStatusToDb(product.status || "draft"),
      tags: Array.isArray(product.tags) ? product.tags : [],
      featured: Boolean(product.featured),
      inventory_count: Number.isFinite(Number(product.stockLevel)) ? Math.max(0, Math.floor(Number(product.stockLevel))) : null,
      must_ship_separately: Boolean(product.mustShipSeparately),
      package_length_in: positiveNumberOrNull(product.packageLength),
      package_width_in: positiveNumberOrNull(product.packageWidth),
      package_height_in: positiveNumberOrNull(product.packageHeight),
      package_weight_oz: positiveNumberOrNull(product.packageWeight),
      sort_order: index * 10
    };
  }

  function positiveNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function referenceFromDb(reference) {
    return {
      id: reference.slug || reference.id,
      slug: reference.slug || reference.id,
      title: reference.title,
      type: reference.type || "Guide",
      summary: reference.summary || "",
      body: reference.body || "",
      status: dbStatusToUi(reference.status || "published"),
      sortOrder: Number(reference.sort_order || 0)
    };
  }

  function referenceToDb(reference, index) {
    const title = reference.title || "Untitled reference";
    return {
      slug: reference.slug || reference.id || slugify(title || `reference-${index + 1}`),
      title,
      type: reference.type || "Guide",
      summary: reference.summary || "",
      body: reference.body || reference.summary || "",
      status: uiStatusToDb(reference.status || "published"),
      sort_order: index * 10
    };
  }

  function postFromDb(post) {
    return {
      id: post.slug || post.id,
      slug: post.slug || post.id,
      title: post.title,
      date: (post.published_at || post.created_at || "").slice(0, 10),
      summary: post.summary || "",
      body: post.body || post.summary || "",
      imageUrl: post.image_url || "",
      heroImageUrl: post.hero_image_url || post.image_url || "",
      status: dbStatusToUi(post.status)
    };
  }

  function mediaAssetFromDb(asset) {
    return {
      id: asset.id,
      name: asset.name || fileNameFromUrl(asset.url || asset.path || ""),
      url: asset.url || "",
      path: asset.path || "",
      folder: asset.folder || "uploads",
      mimeType: asset.mime_type || "",
      sizeBytes: asset.size_bytes || 0
    };
  }

  function postToDb(post) {
    const status = uiStatusToDb(post.status || "draft");
    return {
      slug: slugify(post.title || "untitled-post"),
      title: post.title || "Untitled post",
      summary: post.summary || "",
      body: post.body || post.summary || "",
      image_url: post.imageUrl || null,
      hero_image_url: post.heroImageUrl || post.imageUrl || null,
      status,
      published: status === "published",
      published_at: status === "published" ? `${post.date || new Date().toISOString().slice(0, 10)}T00:00:00.000Z` : null
    };
  }

  function slugify(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `item-${Date.now()}`;
  }

  function normalizeGalleryImages(images = [], primary = "") {
    const list = [
      primary,
      ...(Array.isArray(images) ? images : String(images || "").split(/[\n,]+/))
    ];
    return [...new Set(list.map((url) => String(url || "").trim()).filter(Boolean))];
  }

  function fileNameFromUrl(url = "") {
    const clean = String(url).split("?")[0].split("#")[0];
    return decodeURIComponent(clean.split("/").pop() || "Media asset");
  }

  function collapseDuplicateSortRows(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = Number.isFinite(Number(row.sort_order)) ? `sort:${row.sort_order}` : `slug:${row.slug || row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function postgrestQuotedList(values = []) {
    return values.map((value) => encodeURIComponent(`"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`)).join(",");
  }

  async function deleteMissingReferences(slugs = []) {
    const filter = slugs.length
      ? `slug=not.in.(${postgrestQuotedList(slugs)})`
      : "slug=not.is.null";

    await request(`/rest/v1/references?${filter}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
  }

  async function deleteMissingProducts(slugs = []) {
    const filter = slugs.length
      ? `slug=not.in.(${postgrestQuotedList(slugs)})`
      : "slug=not.is.null";

    await request(`/rest/v1/products?${filter}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
  }

  async function loadContent(defaultContent, options = {}) {
    if (!isConfigured()) return null;

    const productFilter = options.includeDrafts ? "" : "&status=in.(coming_soon,active)";
    const referenceFilter = options.includeDrafts ? "" : "&status=eq.published";
    const postFilter = options.includeDrafts ? "" : "&status=eq.published";

    const [settings, products, references, posts] = await Promise.all([
      request("/rest/v1/site_settings?key=eq.home&select=value"),
      request(`/rest/v1/products?select=*&order=sort_order.asc${productFilter}`),
      request(`/rest/v1/references?select=*&order=sort_order.asc,updated_at.desc${referenceFilter}`),
      request(`/rest/v1/blog_posts?select=*&order=published_at.desc,created_at.desc${postFilter}`)
    ]);

    const content = JSON.parse(JSON.stringify(defaultContent));
    content.site = { ...content.site, ...(settings?.[0]?.value || {}) };
    content.products = products.map(productFromDb);
    content.references = collapseDuplicateSortRows(references).map(referenceFromDb);
    content.posts = posts.map(postFromDb);
    return content;
  }

  async function saveContent(content) {
    if (!isConfigured()) return false;

    await request("/rest/v1/site_settings?on_conflict=key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{ key: "home", value: content.site }]
    });

    const productRows = content.products.map(productToDb);
    await request("/rest/v1/products?on_conflict=slug", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: productRows
    });
    await deleteMissingProducts(productRows.map((product) => product.slug));

    const referenceRows = content.references.map(referenceToDb);
    await request("/rest/v1/references?on_conflict=slug", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: referenceRows
    });
    await deleteMissingReferences(referenceRows.map((reference) => reference.slug));

    await request("/rest/v1/blog_posts?on_conflict=slug", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: content.posts.map(postToDb)
    });

    return true;
  }

  async function loadMediaAssets() {
    if (!isConfigured()) return [];
    const assets = await request("/rest/v1/media_assets?select=*&order=created_at.desc");
    return assets.map(mediaAssetFromDb);
  }

  async function recordMediaAsset(asset) {
    if (!isConfigured()) return null;
    const body = {
      name: asset.name || fileNameFromUrl(asset.url || asset.path || ""),
      url: asset.url,
      path: asset.path || null,
      folder: asset.folder || "uploads",
      mime_type: asset.mimeType || null,
      size_bytes: asset.sizeBytes || null
    };
    const rows = await request("/rest/v1/media_assets?on_conflict=url", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [body]
    });
    return rows?.[0] ? mediaAssetFromDb(rows[0]) : null;
  }

  async function reserveCart(cartId, items = []) {
    if (!isConfigured()) return null;
    return request("/rest/v1/rpc/beyond_peps_reserve_cart", {
      method: "POST",
      body: {
        p_cart_id: cartId,
        p_items: items.map((item) => ({
          id: item.id,
          quantity: Math.max(0, Math.floor(Number(item.quantity || 0)))
        })).filter((item) => item.id && item.quantity > 0)
      }
    });
  }

  async function validateCheckout(cartId, items = []) {
    if (!isConfigured()) return { ok: true, unavailable: [] };
    return request("/rest/v1/rpc/beyond_peps_validate_checkout", {
      method: "POST",
      body: {
        p_cart_id: cartId,
        p_items: items.map((item) => ({
          id: item.id,
          quantity: Math.max(0, Math.floor(Number(item.quantity || 0)))
        })).filter((item) => item.id && item.quantity > 0)
      }
    });
  }

  async function createZelleOrder({ cartId, customer, shippingAddress, shippingRate, items }) {
    if (!isConfigured()) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    return request("/rest/v1/rpc/beyond_peps_create_zelle_order", {
      method: "POST",
      body: {
        p_cart_id: cartId,
        p_customer: customer || {},
        p_shipping_address: shippingAddress || {},
        p_shipping_rate: shippingRate || {},
        p_items: (items || []).map((item) => ({
          id: item.id,
          quantity: Math.max(0, Math.floor(Number(item.quantity || 0)))
        })).filter((item) => item.id && item.quantity > 0)
      }
    });
  }

  async function uploadMedia(file, folder = "uploads") {
    if (!isConfigured()) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    const activeSession = session();
    if (!activeSession?.access_token) {
      throw new Error("Sign in before uploading media.");
    }

    const { url, anonKey } = config();
    const safeName = `${Date.now()}-${file.name}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
    const path = `${folder}/${safeName}`;
    const response = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/beyond-peps-media/${path}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${activeSession.access_token}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Upload failed: ${response.status}`);
    }

    const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/beyond-peps-media/${path}`;
    await recordMediaAsset({
      name: file.name,
      url: publicUrl,
      path,
      folder,
      mimeType: file.type || "",
      sizeBytes: file.size || 0
    }).catch((error) => console.warn("Media asset record failed.", error));
    return publicUrl;
  }

  async function signIn(email, password) {
    if (!isConfigured()) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    const { url, anonKey } = config();
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Sign in failed.");
    }

    const value = await response.json();
    saveSession(value);
    return value;
  }

  async function signUp(email, password) {
    if (!isConfigured()) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    const { url, anonKey } = config();
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Sign up failed.");
    }

    const value = await response.json();
    if (value.access_token) saveSession(value);
    return value;
  }

  async function currentUser() {
    if (!isConfigured()) return null;
    const activeSession = session();
    if (!activeSession?.access_token) return null;

    const { url, anonKey } = config();
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${activeSession.access_token}`
      }
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    return response.json();
  }

  async function currentUserIsAdmin() {
    if (!session()?.access_token) return false;
    try {
      const result = await request("/rest/v1/rpc/beyond_peps_current_user_is_admin", {
        method: "POST",
        body: {}
      });
      return result === true;
    } catch {
      return false;
    }
  }

  async function updateAuthUser(fields = {}) {
    if (!isConfigured()) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    const activeSession = session();
    if (!activeSession?.access_token) {
      throw new Error("Sign in before updating your account.");
    }

    const { url, anonKey } = config();
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${activeSession.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fields)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Account update failed.");
    }

    return response.json();
  }

  async function loadProfile() {
    const user = await currentUser();
    if (!user?.id) return null;
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,full_name,shipping_address,billing_address,role`);
    return rows[0] || {
      id: user.id,
      email: user.email,
      full_name: "",
      shipping_address: {},
      billing_address: {}
    };
  }

  async function saveProfile(profile) {
    const user = await currentUser();
    if (!user?.id) throw new Error("Sign in before saving your account.");
    const payload = {
      id: user.id,
      email: user.email,
      full_name: profile.full_name || "",
      shipping_address: profile.shipping_address || {},
      billing_address: profile.billing_address || {}
    };
    const rows = await request("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [payload]
    });
    return rows[0];
  }

  async function loadOrders() {
    const user = await currentUser();
    if (!user?.id) return [];
    return request(`/rest/v1/orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,status,total_cents,currency,created_at&order=created_at.desc`);
  }

  async function loadAdminOrders() {
    if (!isConfigured()) return [];
    return request("/rest/v1/orders?select=*,order_items(*)&order=created_at.desc");
  }

  async function updateAdminOrder(orderId, fields = {}) {
    if (!isConfigured()) throw new Error("Supabase URL or anon key is missing.");
    const rows = await request(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: fields
    });
    return rows?.[0] || null;
  }

  async function deleteAdminOrder(orderId) {
    if (!isConfigured()) throw new Error("Supabase URL or anon key is missing.");
    await request(`/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
    await request(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
    return true;
  }

  window.BeyondPepsSupabase = {
    clearSession,
    currentUser,
    currentUserIsAdmin,
    createZelleOrder,
    isConfigured,
    loadProfile,
    loadOrders,
    loadAdminOrders,
    loadContent,
    loadMediaAssets,
    recordMediaAsset,
    reserveCart,
    saveContent,
    updateAdminOrder,
    validateCheckout,
    deleteAdminOrder,
    saveProfile,
    session,
    signIn,
    signUp,
    updateAuthUser,
    uploadMedia
  };
})();

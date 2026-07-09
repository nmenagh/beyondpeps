const STORAGE_KEY = "beyondPepsContent";
const MAX_FEATURED_PRODUCTS = 3;
const SHIPPO_SERVICELEVEL_OPTIONS = [
  ["usps_ground_advantage", "USPS Ground Advantage"],
  ["usps_priority", "USPS Priority Mail"],
  ["usps_priority_express", "USPS Priority Mail Express"],
  ["ups_ground", "UPS Ground"],
  ["ups_second_day_air", "UPS 2nd Day Air"],
  ["ups_next_day_air", "UPS Next Day Air"],
  ["fedex_ground", "FedEx Ground"],
  ["fedex_2_day", "FedEx 2Day"],
  ["fedex_standard_overnight", "FedEx Standard Overnight"]
];

let content = null;
let adminAllowed = false;
let mediaAssets = [];
let orders = [];
let emailTemplates = [];
let crmContacts = [];
let crmSequences = [];
let crmSequenceSteps = [];
let crmSends = [];
let crmCampaigns = [];
let activeOrderId = null;
let activeProductIndex = null;
let activeReferenceIndex = null;
let activePostIndex = null;
let activePaymentSectionId = null;
let activeSiteCopyPageId = null;
let activeEmailTemplateId = null;
let activeCrmSection = null;
let activeCrmContactId = null;
let activeCrmSequenceId = null;
let activeAdminEmail = "";
const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"];

const siteSchema = [
  ["name", "Site name"],
  ["domain", "Domain"],
  ["disclaimer", "Footer disclaimer", "textarea"]
];

const productSchema = [
  ["id", "ID"],
  ["name", "Name"],
  ["category", "Category"],
  ["price", "Price", "number"],
  ["stockLevel", "Stock level", "number"],
  ["productWeight", "Product weight (oz)", "number"],
  ["status", "Status"],
  ["featured", "Featured product", "checkbox"],
  ["mustShipSeparately", "Must Ship Separately", "checkbox"],
  ["packageLength", "Package length (in)", "number", false, "uploads", (item) => item.mustShipSeparately],
  ["packageWidth", "Package width (in)", "number", false, "uploads", (item) => item.mustShipSeparately],
  ["packageHeight", "Package height (in)", "number", false, "uploads", (item) => item.mustShipSeparately],
  ["packageWeight", "Package weight (oz)", "number", false, "uploads", (item) => item.mustShipSeparately],
  ["imageUrl", "Product image", "image", true, "products"],
  ["galleryImages", "Product gallery images", "gallery", true, "products"],
  ["summary", "Card summary", "textarea", true],
  ["description", "Extended product description", "textarea", true]
];

const pageCopyConfig = [
  {
    id: "home",
    title: "Home",
    summary: "Hero, CTAs, announcement, and home section headings.",
    fields: [
      ["site.heroEyebrow", "Hero eyebrow"],
      ["site.heroTitle", "Hero title", "textarea"],
      ["site.heroBody", "Hero body", "textarea"],
      ["site.primaryCta", "Primary CTA"],
      ["site.secondaryCta", "Secondary CTA"],
      ["site.announcement", "Announcement", "textarea"],
      ["site.homeFeaturedEyebrow", "Featured products eyebrow"],
      ["site.homeFeaturedTitle", "Featured products title", "textarea"],
      ["site.homeFeaturedBody", "Featured products body", "textarea"],
      ["site.homeReferencesEyebrow", "References eyebrow"],
      ["site.homeReferencesTitle", "References title", "textarea"],
      ["site.homeReferencesBody", "References body", "textarea"],
      ["site.homeCalculatorsEyebrow", "Calculators eyebrow"],
      ["site.homeCalculatorsTitle", "Calculators title", "textarea"],
      ["site.homeCalculatorsBody", "Calculators body", "textarea"],
      ["site.homeBlogEyebrow", "Blog eyebrow"],
      ["site.homeBlogTitle", "Blog title", "textarea"],
      ["site.homeBlogBody", "Blog body", "textarea"]
    ]
  },
  {
    id: "shop",
    title: "Shop",
    summary: "Shop page hero eyebrow, title, and intro copy.",
    fields: [
      ["site.pages.shop.eyebrow", "Eyebrow"],
      ["site.pages.shop.title", "Title", "textarea"],
      ["site.pages.shop.body", "Body", "textarea"]
    ]
  },
  {
    id: "references",
    title: "References",
    summary: "Reference library page hero copy.",
    fields: [
      ["site.pages.references.eyebrow", "Eyebrow"],
      ["site.pages.references.title", "Title", "textarea"],
      ["site.pages.references.body", "Body", "textarea"]
    ]
  },
  {
    id: "calculators",
    title: "Calculators",
    summary: "Calculator page hero copy.",
    fields: [
      ["site.pages.calculators.eyebrow", "Eyebrow"],
      ["site.pages.calculators.title", "Title", "textarea"],
      ["site.pages.calculators.body", "Body", "textarea"]
    ]
  },
  {
    id: "blog",
    title: "Blog",
    summary: "Blog page hero copy and hero image.",
    fields: [
      ["site.pages.blog.eyebrow", "Eyebrow"],
      ["site.pages.blog.title", "Title", "textarea"],
      ["site.pages.blog.body", "Body", "textarea"],
      ["site.blogHeroImageUrl", "Blog hero image", "image", true, "blog"]
    ]
  },
  {
    id: "cart",
    title: "Cart",
    summary: "Cart page hero copy.",
    fields: [
      ["site.pages.cart.eyebrow", "Eyebrow"],
      ["site.pages.cart.title", "Title", "textarea"],
      ["site.pages.cart.body", "Body", "textarea"]
    ]
  },
  {
    id: "account",
    title: "Account",
    summary: "Account page hero copy.",
    fields: [
      ["site.pages.account.eyebrow", "Eyebrow"],
      ["site.pages.account.title", "Title", "textarea"],
      ["site.pages.account.body", "Body", "textarea"]
    ]
  },
  {
    id: "global",
    title: "Global",
    summary: "Site name, domain, and footer disclaimer.",
    fields: siteSchema.map(([key, label, type]) => [`site.${key}`, label, type])
  }
];

async function loadContent() {
  const defaults = cloneDefaultContent();
  try {
    const remoteContent = await window.BeyondPepsSupabase?.loadContent(defaults, { includeDrafts: true });
    if (hasUsableContent(remoteContent)) {
      storageSet(STORAGE_KEY, JSON.stringify(remoteContent));
      return remoteContent;
    }
  } catch (error) {
    console.warn("Supabase content unavailable, using local admin content.", error);
  }

  const stored = storageGet(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (hasUsableContent(parsed)) return parsed;
      const fallback = cloneDefaultContent();
      storageSet(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    } catch {
      storageRemove(STORAGE_KEY);
    }
  }

  try {
    const response = await fetch("../data/site-content.json");
    if (!response.ok) throw new Error("Content request failed");
    const data = await response.json();
    storageSet(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    const data = defaults;
    storageSet(STORAGE_KEY, JSON.stringify(data));
    return data;
  }
}

async function saveContent() {
  if (!adminAllowed) {
    toast("Admin access required.");
    return;
  }

  if (!validateFeaturedLimit()) return;

  try {
    if (window.BeyondPepsSupabase?.isConfigured()) {
      await window.BeyondPepsSupabase.saveContent(content);
      toast("Changes saved to Supabase.");
    } else {
      toast("Changes saved locally.");
    }
  } catch (error) {
    toast(`Supabase save failed: ${error.message}`);
  }

  storageSet(STORAGE_KEY, JSON.stringify(content));
  updateJsonEditor();
}

async function loadMediaAssets() {
  try {
    mediaAssets = await window.BeyondPepsSupabase?.loadMediaAssets?.() || [];
  } catch (error) {
    console.warn("Media library unavailable, using product images.", error);
    mediaAssets = [];
  }

  if (!mediaAssets.length && content) {
    mediaAssets = mediaAssetsFromContent(content);
  }
}

async function loadAdminOrders() {
  try {
    orders = await window.BeyondPepsSupabase?.loadAdminOrders?.() || [];
  } catch (error) {
    console.warn("Orders unavailable.", error);
    orders = [];
    toast(`Orders unavailable: ${error.message}`);
  }
}

async function loadEmailAndCrm() {
  try {
    emailTemplates = await window.BeyondPepsSupabase.loadEmailTemplates();
    const crm = await window.BeyondPepsSupabase.loadCrmDashboard();
    crmContacts = crm.contacts || [];
    crmSequences = crm.sequences || [];
    crmSequenceSteps = crm.steps || [];
    crmSends = crm.sends || [];
    crmCampaigns = crm.campaigns || [];
  } catch (error) {
    console.warn("Email and CRM data unavailable.", error);
    emailTemplates = [];
    crmContacts = [];
    crmSequences = [];
    crmSequenceSteps = [];
    crmSends = [];
    crmCampaigns = [];
    toast(`Email and CRM unavailable: ${error.message}`);
  }
}

function cloneDefaultContent() {
  return JSON.parse(JSON.stringify(window.BEYOND_PEPS_DEFAULT_CONTENT || {
    site: {},
    categories: [],
    products: [],
    references: [],
    posts: []
  }));
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast("Browser storage is unavailable, so changes are visible only until refresh.");
    return false;
  }
  return true;
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function hasUsableContent(data) {
  return Boolean(
    data?.schemaVersion >= 2 &&
    data?.site?.heroTitle &&
    Array.isArray(data.products) &&
    Array.isArray(data.references) &&
    Array.isArray(data.posts)
  );
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `item-${Date.now()}`;
}

function normalizeContent(data) {
  const defaults = cloneDefaultContent();
  data.site = {
    ...defaults.site,
    ...data.site,
    pages: {
      ...(defaults.site?.pages || {}),
      ...(data.site?.pages || {})
    },
    shippingMethods: normalizeShippingMethods(data.site?.shippingMethods),
    paymentMethods: normalizePaymentMethods(data.site?.paymentMethods)
  };
  data.products = (data.products || []).map((product) => ({
    ...product,
    featured: Boolean(product.featured)
  }));
  data.references = (data.references || []).map((reference, index) => ({
    slug: reference.slug || reference.id || slugify(reference.title || `reference-${index + 1}`),
    title: reference.title || "Untitled reference",
    type: reference.type || "Guide",
    status: reference.status || "Published",
    summary: reference.summary || "",
    body: reference.body || reference.summary || ""
  }));
  return data;
}

function valueAtPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function setValueAtPath(source, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((node, key) => {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    return node[key];
  }, source);
  target[last] = value;
}

function normalizeShippingMethods(value = {}) {
  const enabledServicelevels = Array.isArray(value.enabledServicelevels)
    ? value.enabledServicelevels
    : ["usps_ground_advantage", "usps_priority", "ups_ground"];
  return {
    enabledServicelevels: [...new Set(enabledServicelevels.map((item) => String(item || "").trim()).filter(Boolean))],
    customServicelevels: String(value.customServicelevels || "")
  };
}

function normalizePaymentMethods(value = {}) {
  const zelle = value.zelle || {};
  return {
    zelle: {
      enabled: zelle.enabled !== false,
      displayName: zelle.displayName || "Zelle",
      recipientName: zelle.recipientName || "",
      recipientEmail: zelle.recipientEmail || "",
      recipientPhone: zelle.recipientPhone || "",
      paymentLink: zelle.paymentLink || "",
      qrCodeImageUrl: zelle.qrCodeImageUrl || "",
      memoInstructions: zelle.memoInstructions || "Include your order number in the Zelle memo.",
      confirmationIntro: zelle.confirmationIntro || "Your order is reserved. Send payment with Zelle using the details below, then keep your order number for reference."
    }
  };
}

function featuredProductCount(excludeItem = null) {
  return (content?.products || []).filter((product) => product !== excludeItem && product.featured).length;
}

function validateFeaturedLimit() {
  const count = featuredProductCount();
  if (count <= MAX_FEATURED_PRODUCTS) return true;
  toast(`Only ${MAX_FEATURED_PRODUCTS} products can be featured at a time. Uncheck ${count - MAX_FEATURED_PRODUCTS} before saving.`);
  return false;
}

function mediaAssetsFromContent(data) {
  const urls = new Set();
  (data.products || []).forEach((product) => {
    if (product.imageUrl) urls.add(product.imageUrl);
    (product.galleryImages || []).forEach((url) => urls.add(url));
  });
  if (data.site?.blogHeroImageUrl) urls.add(data.site.blogHeroImageUrl);
  if (data.site?.paymentMethods?.zelle?.qrCodeImageUrl) urls.add(data.site.paymentMethods.zelle.qrCodeImageUrl);
  (data.posts || []).forEach((post) => {
    if (post.imageUrl) urls.add(post.imageUrl);
    if (post.heroImageUrl) urls.add(post.heroImageUrl);
  });
  return [...urls].map((url) => ({
    id: url,
    name: fileNameFromUrl(url),
    url,
    folder: "existing"
  }));
}

function fileNameFromUrl(url = "") {
  const clean = String(url).split("?")[0].split("#")[0];
  return decodeURIComponent(clean.split("/").pop() || "Media asset");
}

function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.setTimeout(() => node.classList.remove("is-visible"), 2200);
}

function moneyFromCents(cents = 0, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD"
  }).format(Number(cents || 0) / 100);
}

function formatDate(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString();
}

function orderNumber(order = {}) {
  return String(order.id || "").slice(0, 8).toUpperCase();
}

function orderEmail(order = {}) {
  return order.customer_email || order.email || order.metadata?.customer?.email || "";
}

function orderCustomerName(order = {}) {
  return order.metadata?.customer?.name || order.shipping_address?.name || "Customer";
}

function shippingLine(order = {}) {
  const count = Number(order.shipping_method?.packageCount || order.shipping_method?.packages?.length || 0);
  const suffix = count > 1 ? ` (${count} packages)` : "";
  return `${order.selected_carrier || [order.shipping_method?.provider, order.shipping_method?.servicelevel].filter(Boolean).join(" - ") || "Shipping method not selected"}${suffix}`;
}

function orderLabels(order = {}) {
  const labels = Array.isArray(order.shipping_method?.labels) ? order.shipping_method.labels : [];
  if (labels.length) return labels;
  return order.label_url ? [{
    labelUrl: order.label_url,
    trackingUrl: order.tracking_url || "",
    trackingNumber: order.tracking_number || "",
    packageNumber: 1
  }] : [];
}

function cleanRichHtml(html = "") {
  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H2", "H3", "H4", "HR", "I", "LI", "OL", "P", "SPAN", "STRONG", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL"]);
  const allowedStyles = new Set(["font-weight", "font-style", "text-align", "text-decoration"]);
  const safeAnchor = /^[A-Za-z_][A-Za-z0-9:_.-]*$/;
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === "style") {
        const bookmark = attribute.value.match(/mso-bookmark\s*:\s*([^;]+)/i)?.[1]?.trim();
        if (bookmark && safeAnchor.test(bookmark) && !node.id) {
          node.id = bookmark;
        }
      }

      if ((name === "id" || name === "name") && safeAnchor.test(attribute.value.trim())) {
        return;
      }

      if (name === "href" && node.tagName === "A") {
        const href = attribute.value.trim();
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return;
      }

      if (name === "style") {
        const safeStyles = attribute.value.split(";").map((rule) => rule.trim()).filter((rule) => {
          const property = rule.split(":")[0]?.trim().toLowerCase();
          return allowedStyles.has(property);
        });
        if (safeStyles.length) {
          node.setAttribute("style", safeStyles.join("; "));
          return;
        }
      }

      node.removeAttribute(attribute.name);
    });
  });

  return template.innerHTML.trim();
}

function field(label, value, onInput, type = "text", wide = false, uploadFolder = "uploads") {
  if (type === "richtext") {
    const wrap = document.createElement("div");
    wrap.className = "admin-field richtext-field field-wide";

    const fieldLabel = document.createElement("span");
    fieldLabel.className = "admin-field-label";
    fieldLabel.textContent = label;

    const toolbar = document.createElement("div");
    toolbar.className = "richtext-toolbar";
    [
      ["bold", "Bold"],
      ["italic", "Italic"],
      ["underline", "Underline"],
      ["insertUnorderedList", "Bullet list"],
      ["insertOrderedList", "Numbered list"],
      ["formatBlock", "Heading", "H3"],
      ["formatBlock", "Paragraph", "P"]
    ].forEach(([command, text, argument]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => {
        editor.focus();
        document.execCommand(command, false, argument);
        onInput(cleanRichHtml(editor.innerHTML));
      });
      toolbar.append(button);
    });

    const editor = document.createElement("div");
    editor.className = "richtext-editor";
    editor.contentEditable = "true";
    editor.innerHTML = cleanRichHtml(value || "");
    editor.addEventListener("input", () => onInput(cleanRichHtml(editor.innerHTML)));
    editor.addEventListener("paste", () => {
      window.setTimeout(() => {
        editor.innerHTML = cleanRichHtml(editor.innerHTML);
        onInput(editor.innerHTML);
      }, 0);
    });
    editor.addEventListener("blur", () => {
      editor.innerHTML = cleanRichHtml(editor.innerHTML);
      onInput(editor.innerHTML);
    });

    wrap.append(fieldLabel, toolbar, editor);
    return wrap;
  }

  const wrap = document.createElement("label");
  if (wide || type === "textarea" || type === "image" || type === "gallery") wrap.classList.add("field-wide");
  wrap.textContent = label;

  if (type === "shipping_methods") {
    const settings = normalizeShippingMethods(value);
    const panel = document.createElement("div");
    panel.className = "shipping-method-admin field-wide";

    const heading = document.createElement("div");
    heading.innerHTML = `
      <span class="admin-field-label">${escapeAttribute(label)}</span>
      <p>Choose the Shippo service levels customers can select at checkout. Add custom service tokens if Shippo returns methods not listed here.</p>
    `;

    const optionGrid = document.createElement("div");
    optionGrid.className = "shipping-method-grid";

    const sync = () => {
      const enabledServicelevels = [...optionGrid.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
      onInput({
        enabledServicelevels,
        customServicelevels: custom.value
      });
      updateJsonEditor();
    };

    SHIPPO_SERVICELEVEL_OPTIONS.forEach(([token, name]) => {
      const item = document.createElement("label");
      item.className = "checkbox-field";
      item.innerHTML = `<input type="checkbox" value="${escapeAttribute(token)}"${settings.enabledServicelevels.includes(token) ? " checked" : ""}><span>${escapeAttribute(name)}</span>`;
      item.querySelector("input").addEventListener("change", sync);
      optionGrid.append(item);
    });

    const customLabel = document.createElement("label");
    customLabel.className = "field-wide";
    customLabel.textContent = "Custom Shippo service tokens";

    const custom = document.createElement("textarea");
    custom.value = settings.customServicelevels;
    custom.placeholder = "One per line or comma-separated, for example: dhl_express_worldwide";
    custom.addEventListener("input", sync);

    customLabel.append(custom);
    panel.append(heading, optionGrid, customLabel);
    return panel;
  }

  if (type === "payment_settings") {
    const settings = normalizePaymentMethods(value);
    const panel = document.createElement("div");
    panel.className = "payment-method-admin field-wide";

    const heading = document.createElement("div");
    heading.innerHTML = `
      <span class="admin-field-label">${escapeAttribute(label)}</span>
      <p>These Zelle details are shown at checkout and used in the order confirmation email.</p>
    `;

    const zelle = settings.zelle;
    const enabled = field("Enable Zelle checkout", zelle.enabled, (next) => {
      zelle.enabled = next;
      onInput(settings);
      return true;
    }, "checkbox");
    const displayName = field("Payment label", zelle.displayName, (next) => {
      zelle.displayName = next;
      onInput(settings);
      return true;
    });
    const recipientName = field("Zelle recipient name", zelle.recipientName, (next) => {
      zelle.recipientName = next;
      onInput(settings);
      return true;
    });
    const recipientEmail = field("Zelle email", zelle.recipientEmail, (next) => {
      zelle.recipientEmail = next;
      onInput(settings);
      return true;
    }, "email");
    const recipientPhone = field("Zelle phone", zelle.recipientPhone, (next) => {
      zelle.recipientPhone = next;
      onInput(settings);
      return true;
    }, "tel");
    const paymentLink = field("Zelle payment link", zelle.paymentLink, (next) => {
      zelle.paymentLink = next;
      onInput(settings);
      return true;
    }, "url", true);
    const qrCodeImageUrl = field("Zelle QR code image", zelle.qrCodeImageUrl, (next) => {
      zelle.qrCodeImageUrl = next;
      onInput(settings);
      return true;
    }, "image", true, "payments");
    const memoInstructions = field("Memo instructions", zelle.memoInstructions, (next) => {
      zelle.memoInstructions = next;
      onInput(settings);
      return true;
    }, "textarea", true);
    const confirmationIntro = field("Customer confirmation message", zelle.confirmationIntro, (next) => {
      zelle.confirmationIntro = next;
      onInput(settings);
      return true;
    }, "textarea", true);

    panel.append(heading, enabled, displayName, recipientName, recipientEmail, recipientPhone, paymentLink, qrCodeImageUrl, memoInstructions, confirmationIntro);
    return panel;
  }

  if (type === "checkbox") {
    wrap.classList.add("checkbox-field");
    wrap.textContent = "";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => {
      const accepted = onInput(input.checked);
      if (accepted === false) input.checked = !input.checked;
      updateJsonEditor();
    });

    const text = document.createElement("span");
    text.textContent = label;

    wrap.append(input, text);
    return wrap;
  }

  if (type === "image") {
    wrap.classList.add("image-field");
    const preview = document.createElement("div");
    preview.className = "image-preview";
    preview.innerHTML = imagePreviewMarkup(value);

    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.placeholder = "Image URL or upload below";
    input.addEventListener("input", () => {
      onInput(input.value);
      preview.innerHTML = imagePreviewMarkup(input.value);
    });

    const picker = mediaPicker(value, "Choose from media library", (url) => {
      input.value = url;
      onInput(url);
      preview.innerHTML = imagePreviewMarkup(url);
      updateJsonEditor();
    });

    const upload = document.createElement("input");
    upload.type = "file";
    upload.accept = "image/*";
    upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      if (!file) return;
      try {
        preview.innerHTML = `<span>Uploading...</span>`;
        const url = await window.BeyondPepsSupabase.uploadMedia(file, uploadFolder);
        input.value = url;
        onInput(url);
        preview.innerHTML = imagePreviewMarkup(url);
        updateJsonEditor();
        toast("Image uploaded. Save changes to persist the URL.");
      } catch (error) {
        preview.innerHTML = imagePreviewMarkup(value);
        toast(`Upload failed: ${error.message}`);
      } finally {
        upload.value = "";
      }
    });

    wrap.append(preview, picker, input, upload);
    return wrap;
  }

  if (type === "gallery") {
    wrap.classList.add("gallery-field");
    const values = normalizeGalleryValue(value);
    const list = document.createElement("div");
    list.className = "gallery-editor-list";

    const sync = () => {
      const next = [...list.querySelectorAll("[data-gallery-url]")]
        .map((input) => input.value.trim())
        .filter(Boolean);
      onInput(next);
      updateJsonEditor();
    };

    const addRow = (url = "") => {
      const row = document.createElement("div");
      row.className = "gallery-editor-row";

      const preview = document.createElement("div");
      preview.className = "gallery-editor-preview";
      preview.innerHTML = imagePreviewMarkup(url);

      const input = document.createElement("input");
      input.type = "text";
      input.value = url;
      input.placeholder = "Image URL or upload below";
      input.dataset.galleryUrl = "true";
      input.addEventListener("input", () => {
        preview.innerHTML = imagePreviewMarkup(input.value);
        sync();
      });

      const picker = mediaPicker(url, "Choose gallery image", (selectedUrl) => {
        input.value = selectedUrl;
        preview.innerHTML = imagePreviewMarkup(selectedUrl);
        sync();
      });

      const upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/*";
      upload.addEventListener("change", async () => {
        const file = upload.files?.[0];
        if (!file) return;
        try {
          preview.innerHTML = `<span>Uploading...</span>`;
          const uploadedUrl = await window.BeyondPepsSupabase.uploadMedia(file, uploadFolder);
          input.value = uploadedUrl;
          preview.innerHTML = imagePreviewMarkup(uploadedUrl);
          sync();
          toast("Gallery image uploaded. Save changes to persist the URL.");
        } catch (error) {
          preview.innerHTML = imagePreviewMarkup(input.value);
          toast(`Upload failed: ${error.message}`);
        } finally {
          upload.value = "";
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-item gallery-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        row.remove();
        sync();
      });

      row.append(preview, picker, input, upload, remove);
      list.append(row);
    };

    values.forEach(addRow);
    if (!values.length) addRow("");

    const add = document.createElement("button");
    add.type = "button";
    add.className = "button ghost gallery-add";
    add.textContent = "Add gallery image";
    add.addEventListener("click", () => addRow(""));

    wrap.append(list, add);
    return wrap;
  }

  const control = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") control.type = type;
  control.value = value ?? "";
  control.addEventListener("input", () => {
    onInput(type === "number" ? Number(control.value) : control.value);
  });
  wrap.append(control);
  return wrap;
}

function resolveAdminImageUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(url)) return url;
  return `../${url.replace(/^\.?\//, "")}`;
}

function imagePreviewMarkup(value = "") {
  const url = resolveAdminImageUrl(value);
  return url ? `<img src="${escapeAttribute(url)}" alt="">` : `<span>No image selected</span>`;
}

function normalizeGalleryValue(value = []) {
  if (Array.isArray(value)) return value.map((url) => String(url || "").trim()).filter(Boolean);
  return String(value || "").split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
}

function mediaPicker(value = "", placeholder = "Choose image", onSelect = () => {}) {
  const wrap = document.createElement("div");
  wrap.className = "media-picker";

  const thumb = document.createElement("div");
  thumb.className = "media-picker-thumb";
  thumb.innerHTML = imagePreviewMarkup(value);

  const select = document.createElement("select");
  select.innerHTML = `
    <option value="">${escapeAttribute(placeholder)}</option>
    ${mediaAssets.map((asset) => `<option value="${escapeAttribute(asset.url)}"${asset.url === value ? " selected" : ""}>${escapeAttribute(asset.name || fileNameFromUrl(asset.url))}</option>`).join("")}
  `;
  select.addEventListener("change", () => {
    if (!select.value) return;
    thumb.innerHTML = imagePreviewMarkup(select.value);
    onSelect(select.value);
  });

  wrap.append(thumb, select);
  return wrap;
}

function escapeAttribute(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function renderSiteFields() {
  const root = document.querySelector("#siteFields");
  root.innerHTML = "";

  const activePage = pageCopyConfig.find((page) => page.id === activeSiteCopyPageId);
  if (activePage) {
    const back = document.createElement("button");
    back.className = "button ghost product-back";
    back.type = "button";
    back.textContent = "Back to page tiles";
    back.addEventListener("click", () => {
      activeSiteCopyPageId = null;
      renderAll();
    });

    const card = document.createElement("article");
    card.className = "editor-card page-copy-editor";
    const title = document.createElement("h2");
    title.textContent = activePage.title;
    card.append(title);

    activePage.fields.forEach(([path, label, type, wide, uploadFolder]) => {
      card.append(field(label, valueAtPath(content, path), (value) => {
        setValueAtPath(content, path, value);
        return true;
      }, type || "text", wide || type === "textarea", uploadFolder));
    });

    root.append(back, card);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "page-copy-grid";
  pageCopyConfig.forEach((page) => {
    const tile = document.createElement("button");
    tile.className = "page-copy-tile";
    tile.type = "button";
    tile.innerHTML = `
      <span class="page-copy-index">${escapeAttribute(page.title.slice(0, 2).toUpperCase())}</span>
      <span class="page-copy-text">
        <strong>${escapeAttribute(page.title)}</strong>
        <small>${escapeAttribute(page.summary)}</small>
      </span>
    `;
    tile.addEventListener("click", () => {
      activeSiteCopyPageId = page.id;
      renderAll();
    });
    grid.append(tile);
  });

  root.append(grid);
}

function renderShippingFields() {
  const root = document.querySelector("#shippingFields");
  if (!root) return;
  root.innerHTML = "";
  root.append(field("Shippo shipping methods", content.site.shippingMethods, (value) => {
    content.site.shippingMethods = normalizeShippingMethods(value);
  }, "shipping_methods"));
}

function renderPaymentFields() {
  const root = document.querySelector("#paymentFields");
  if (!root) return;
  root.innerHTML = "";

  if (!activePaymentSectionId) {
    const grid = document.createElement("div");
    grid.className = "page-copy-grid";
    const zelleTile = document.createElement("button");
    zelleTile.className = "page-copy-tile";
    zelleTile.type = "button";
    zelleTile.innerHTML = `
      <span class="page-copy-index">ZE</span>
      <span class="page-copy-text">
        <strong>Zelle</strong>
        <small>Payment credentials, payment link, QR code, memo copy, and test email.</small>
      </span>
    `;
    zelleTile.addEventListener("click", () => {
      activePaymentSectionId = "zelle";
      renderAll();
    });
    grid.append(zelleTile);
    root.append(grid);
    return;
  }

  const back = document.createElement("button");
  back.className = "button ghost product-back";
  back.type = "button";
  back.textContent = "Back to payment tiles";
  back.addEventListener("click", () => {
    activePaymentSectionId = null;
    renderAll();
  });
  root.append(back);

  root.append(field("Zelle payment settings", content.site.paymentMethods, (value) => {
    content.site.paymentMethods = normalizePaymentMethods(value);
  }, "payment_settings"));

  const tester = document.createElement("article");
  tester.className = "payment-test-card field-wide";
  tester.innerHTML = `
    <div>
      <span class="admin-field-label">Send test email</span>
      <p>Send a sample Zelle order confirmation using the current payment settings.</p>
    </div>
    <label>Recipient email<input id="testEmailRecipient" type="email" value="${escapeAttribute(activeAdminEmail)}" placeholder="you@example.com"></label>
    <button class="button primary" id="sendTestEmail" type="button">Send test email</button>
    <p class="admin-note" id="testEmailStatus"></p>
  `;
  root.append(tester);

  tester.querySelector("#sendTestEmail").addEventListener("click", () => {
    sendTestEmail(tester.querySelector("#testEmailRecipient").value.trim());
  });
}

async function sendTestEmail(recipient) {
  const status = document.querySelector("#testEmailStatus");
  const button = document.querySelector("#sendTestEmail");
  if (!recipient) {
    status.textContent = "Enter a recipient email address.";
    return;
  }

  button.disabled = true;
  button.textContent = "Sending...";
  status.textContent = "";

  const order = {
    orderId: "test-order",
    orderNumber: "TEST-ZELLE",
    paymentReference: "BP-ZELLE-TEST",
    subtotalCents: 1500,
    shippingCents: 500,
    totalCents: 2000,
    currency: "USD",
    status: "awaiting_zelle_payment"
  };

  try {
    const response = await fetch("../api/order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "order_confirmation",
        customer: { name: "Test Customer", email: recipient },
        order,
        items: [{ id: "test-item", name: "Beyond Peps Test Item", price: 15, quantity: 1 }],
        shippingRate: { provider: "Test Carrier", servicelevel: "Test Shipping", amount: 5 },
        paymentSettings: normalizePaymentMethods(content.site.paymentMethods)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Test email failed.");
    if (!data.sent) {
      status.textContent = data.reason || "Email endpoint responded, but email is not configured.";
      toast("Email is not configured.");
      return;
    }
    status.textContent = `Test email sent to ${recipient}.`;
    toast("Test email sent.");
  } catch (error) {
    status.textContent = error.message;
    toast("Test email failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Send test email";
  }
}

function renderOrders() {
  const root = document.querySelector("#ordersEditor");
  if (!root) return;
  root.innerHTML = "";

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  if (activeOrder) {
    root.append(renderOrderDetail(activeOrder));
    return;
  }

  if (!orders.length) {
    root.innerHTML = `<div class="empty-media">No orders yet.</div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "order-admin-grid";
  orders.forEach((order) => {
    const tile = document.createElement("button");
    tile.className = "order-admin-tile";
    tile.type = "button";
    tile.innerHTML = `
      <span class="order-admin-status">${escapeAttribute(order.status || "pending")}</span>
      <strong>Order ${escapeAttribute(orderNumber(order))}</strong>
      <small>${escapeAttribute(orderEmail(order) || "No email")} &middot; ${escapeAttribute(formatDate(order.created_at))}</small>
      <span>${escapeAttribute(moneyFromCents(order.total_cents, order.currency))} &middot; ${escapeAttribute(shippingLine(order))}</span>
    `;
    tile.addEventListener("click", () => {
      activeOrderId = order.id;
      renderAll();
    });
    grid.append(tile);
  });
  root.append(grid);
}

function renderOrderDetail(order) {
  const card = document.createElement("article");
  card.className = "editor-card order-detail-card";
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const statusOptions = ORDER_STATUSES.map((status) => `<option value="${status}"${order.status === status ? " selected" : ""}>${status}</option>`).join("");
  const labelUrl = order.label_url || "";
  const trackingUrl = order.tracking_url || "";
  const labels = orderLabels(order);

  card.innerHTML = `
    <div class="field-wide order-detail-header">
      <button class="button ghost" id="backToOrders" type="button">Back to orders</button>
      <div>
        <p class="eyebrow">Order ${escapeAttribute(orderNumber(order))}</p>
        <h2>${escapeAttribute(orderCustomerName(order))}</h2>
        <p>${escapeAttribute(orderEmail(order))}</p>
      </div>
    </div>

    <section class="order-detail-section">
      <h3>Status</h3>
      <label>Status
        <select id="orderStatus">${statusOptions}</select>
      </label>
      <button class="button primary" id="saveOrderStatus" type="button">Save status</button>
      <button class="button ghost" id="cancelOrder" type="button">Cancel order</button>
      <button class="remove-item" id="deleteOrder" type="button">Delete order</button>
    </section>

    <section class="order-detail-section">
      <h3>Totals</h3>
      <p><span>Subtotal</span><strong>${escapeAttribute(moneyFromCents(order.subtotal_cents, order.currency))}</strong></p>
      <p><span>Shipping</span><strong>${escapeAttribute(moneyFromCents(order.shipping_cents, order.currency))}</strong></p>
      <p><span>Total</span><strong>${escapeAttribute(moneyFromCents(order.total_cents, order.currency))}</strong></p>
      <p><span>Payment</span><strong>${escapeAttribute(order.payment_provider || order.payment_method || "Payment")}</strong></p>
      <p><span>Reference</span><strong>${escapeAttribute(order.payment_reference || "None")}</strong></p>
    </section>

    <section class="order-detail-section field-wide">
      <h3>Shipping</h3>
      <p>${escapeAttribute(shippingLine(order))}</p>
      <pre>${escapeAttribute(addressBlock(order.shipping_address))}</pre>
      ${labels.map((label, index) => `
        <p>
          <span>Package ${escapeAttribute(label.packageNumber || index + 1)}</span>
          <strong>
            ${label.labelUrl ? `<a href="${escapeAttribute(label.labelUrl)}" target="_blank" rel="noopener">Open label</a>` : ""}
            ${label.trackingUrl ? ` · <a href="${escapeAttribute(label.trackingUrl)}" target="_blank" rel="noopener">Track ${escapeAttribute(label.trackingNumber || "")}</a>` : ""}
          </strong>
        </p>
      `).join("")}
      ${!labels.length && labelUrl ? `<p><a href="${escapeAttribute(labelUrl)}" target="_blank" rel="noopener">Open shipping label</a></p>` : ""}
      ${!labels.length && trackingUrl ? `<p><a href="${escapeAttribute(trackingUrl)}" target="_blank" rel="noopener">Track package ${escapeAttribute(order.tracking_number || "")}</a></p>` : ""}
      <button class="button primary" id="createShippoLabel" type="button">${labelUrl ? "Recheck label" : "Create Shippo label"}</button>
      <p class="admin-note" id="labelStatus"></p>
    </section>

    <section class="order-detail-section field-wide">
      <h3>Items</h3>
      <div class="order-items-table">
        ${items.map((item) => `
          <p>
            <span>${escapeAttribute(item.product_title || item.product_name || item.product_slug || "Item")} x ${escapeAttribute(item.quantity || 1)}</span>
            <strong>${escapeAttribute(moneyFromCents(item.total_cents || (item.unit_price_cents || item.price_cents_at_purchase || 0) * (item.quantity || 1), order.currency))}</strong>
          </p>
        `).join("") || "<p>No items found for this order.</p>"}
      </div>
    </section>
  `;

  card.querySelector("#backToOrders").addEventListener("click", () => {
    activeOrderId = null;
    renderAll();
  });
  card.querySelector("#saveOrderStatus").addEventListener("click", () => updateOrderStatus(order.id, card.querySelector("#orderStatus").value));
  card.querySelector("#cancelOrder").addEventListener("click", () => updateOrderStatus(order.id, "cancelled"));
  card.querySelector("#deleteOrder").addEventListener("click", () => deleteOrder(order.id));
  card.querySelector("#createShippoLabel").addEventListener("click", () => createShippoLabel(order.id));

  return card;
}

function addressBlock(address = {}) {
  return [
    address.name,
    address.street1,
    address.street2,
    [address.city, address.state, address.zip].filter(Boolean).join(", "),
    address.phone,
    address.email
  ].filter(Boolean).join("\n");
}

async function updateOrderStatus(orderId, status) {
  try {
    await window.BeyondPepsSupabase.updateAdminOrder(orderId, { status });
    await loadAdminOrders();
    const order = orders.find((item) => item.id === orderId);
    if (orderEmail(order)) {
      await fetch("../api/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order_status_update",
          customer: { email: orderEmail(order), name: orderCustomerName(order) },
          order: {
            orderId: order.id,
            orderNumber: orderNumber(order),
            status
          }
        })
      });
    }
    toast(`Order marked ${status}.`);
    renderAll();
  } catch (error) {
    toast(`Status update failed: ${error.message}`);
  }
}

async function deleteOrder(orderId) {
  if (!window.confirm("Delete this order permanently? This cannot be undone.")) return;
  try {
    await window.BeyondPepsSupabase.deleteAdminOrder(orderId);
    activeOrderId = null;
    await loadAdminOrders();
    toast("Order deleted.");
    renderAll();
  } catch (error) {
    toast(`Delete failed: ${error.message}`);
  }
}

async function createShippoLabel(orderId) {
  const status = document.querySelector("#labelStatus");
  const button = document.querySelector("#createShippoLabel");
  button.disabled = true;
  button.textContent = "Creating label...";
  status.textContent = "";

  try {
    const token = window.BeyondPepsSupabase.session()?.access_token;
    const response = await fetch("../api/create-label", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`
      },
      body: JSON.stringify({ orderId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Label creation failed.");
    await loadAdminOrders();
    const updatedOrder = orders.find((order) => order.id === orderId) || data.order;
    await sendShippedEmail(updatedOrder, data);
    status.textContent = data.labelUrl ? "Label created. Shipping email sent if email is configured." : "Label already exists.";
    toast("Shippo label ready.");
    renderAll();
  } catch (error) {
    status.textContent = error.message;
    toast("Label creation failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Create Shippo label";
  }
}

async function sendShippedEmail(order = {}, labelData = {}) {
  const email = orderEmail(order);
  if (!email) return;
  try {
    await fetch("../api/order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "order_shipped",
        customer: { email, name: orderCustomerName(order) },
        order: {
          orderId: order.id,
          orderNumber: orderNumber(order),
          trackingNumber: labelData.trackingNumber || order.tracking_number,
          trackingUrl: labelData.trackingUrl || order.tracking_url,
          shippingProvider: order.shipping_provider || order.tracking_carrier || order.shipping_method?.provider,
          shippingService: order.shipping_service || order.shipping_method?.servicelevel
        }
      })
    });
  } catch (error) {
    console.warn("Shipped email did not send.", error);
  }
}

function editorCard(collection, item, index, schema) {
  const card = document.createElement("article");
  card.className = "editor-card";
  const title = document.createElement("h2");
  title.textContent = `${index + 1}. ${item.name || item.title || "Untitled"}`;
  card.append(title);

  schema.forEach(([key, label, type, wide, uploadFolder, shouldShow]) => {
    if (typeof shouldShow === "function" && !shouldShow(item)) return;
    card.append(field(label, item[key], (value) => {
      if (collection === "products" && key === "featured" && value && featuredProductCount(item) >= MAX_FEATURED_PRODUCTS) {
        toast(`Only ${MAX_FEATURED_PRODUCTS} products can be featured at a time.`);
        return false;
      }
      item[key] = value;
      title.textContent = `${index + 1}. ${item.name || item.title || "Untitled"}`;
      if (collection === "products" && key === "mustShipSeparately") renderAll();
      return true;
    }, type || "text", wide, uploadFolder));
  });

  const remove = document.createElement("button");
  remove.className = "remove-item";
  remove.type = "button";
  remove.textContent = "Remove item";
  remove.addEventListener("click", () => {
    content[collection].splice(index, 1);
    if (collection === "products") activeProductIndex = null;
    if (collection === "references") activeReferenceIndex = null;
    if (collection === "posts") activePostIndex = null;
    renderAll();
  });
  card.append(remove);
  return card;
}

function renderProductTiles() {
  const root = document.querySelector("#productsEditor");
  root.innerHTML = "";

  if (Number.isInteger(activeProductIndex) && content.products[activeProductIndex]) {
    const back = document.createElement("button");
    back.className = "button ghost product-back";
    back.type = "button";
    back.textContent = "Back to product tiles";
    back.addEventListener("click", () => {
      activeProductIndex = null;
      renderAll();
    });
    root.append(back, editorCard("products", content.products[activeProductIndex], activeProductIndex, productSchema));
    return;
  }

  const grid = document.createElement("div");
  grid.className = "product-admin-grid";

  content.products.forEach((product, index) => {
    const tile = document.createElement("button");
    tile.className = "product-admin-tile";
    tile.type = "button";
    tile.innerHTML = `
      <div class="product-admin-image">${imagePreviewMarkup(product.imageUrl)}</div>
      <span class="product-admin-copy">
        <strong>${escapeAttribute(product.name || "Untitled product")}</strong>
        <small>${escapeAttribute(product.category || "Research Supplies")} &middot; ${escapeAttribute(product.status || "Draft")}</small>
        <span>${escapeAttribute(product.featured ? "Featured" : "Not featured")} &middot; ${Number.isFinite(Number(product.stockLevel)) ? `${Number(product.stockLevel)} in stock` : "Stock unset"}</span>
      </span>
    `;
    tile.addEventListener("click", () => {
      activeProductIndex = index;
      renderAll();
    });
    grid.append(tile);
  });

  if (content.products.length) {
    root.append(grid);
  } else {
    root.innerHTML = `<div class="empty-media">No products yet. Use Add product to create one.</div>`;
  }
}

function renderCollection(collection, rootSelector, schema) {
  const root = document.querySelector(rootSelector);
  root.innerHTML = "";

  content[collection].forEach((item, index) => {
    root.append(editorCard(collection, item, index, schema));
  });
}

function renderEditableTiles(collection, rootSelector, schema, activeIndex, setActiveIndex, options = {}) {
  const root = document.querySelector(rootSelector);
  root.innerHTML = "";

  if (Number.isInteger(activeIndex) && content[collection]?.[activeIndex]) {
    const back = document.createElement("button");
    back.className = "button ghost product-back";
    back.type = "button";
    back.textContent = `Back to ${options.backLabel || "tiles"}`;
    back.addEventListener("click", () => {
      setActiveIndex(null);
      renderAll();
    });
    root.append(back, editorCard(collection, content[collection][activeIndex], activeIndex, schema));
    return;
  }

  if (!content[collection]?.length) {
    root.innerHTML = `<div class="empty-media">${escapeAttribute(options.emptyText || "No items yet.")}</div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "content-admin-grid";
  content[collection].forEach((item, index) => {
    const tile = document.createElement("button");
    tile.className = "content-admin-tile";
    tile.type = "button";
    tile.innerHTML = `
      <span class="content-admin-status">${escapeAttribute(item.status || "Draft")}</span>
      <strong>${escapeAttribute(item.title || item.name || "Untitled")}</strong>
      <small>${escapeAttribute(options.meta?.(item) || "")}</small>
      <span>${escapeAttribute(item.summary || item.body?.replace(/<[^>]*>/g, "").slice(0, 120) || "No summary yet.")}</span>
    `;
    tile.addEventListener("click", () => {
      setActiveIndex(index);
      renderAll();
    });
    grid.append(tile);
  });
  root.append(grid);
}

function renderCollections() {
  renderProductTiles();

  renderEditableTiles("references", "#referencesEditor", [
    ["slug", "Slug"],
    ["title", "Title"],
    ["type", "Type"],
    ["status", "Status"],
    ["summary", "Card summary", "textarea", true],
    ["body", "Reference page body", "richtext", true]
  ], activeReferenceIndex, (value) => {
    activeReferenceIndex = value;
  }, {
    backLabel: "reference tiles",
    emptyText: "No references yet. Use Add reference to create one.",
    meta: (reference) => reference.type || "Reference"
  });

  renderEditableTiles("posts", "#postsEditor", [
    ["slug", "Slug"],
    ["title", "Title"],
    ["date", "Date"],
    ["status", "Status"],
    ["imageUrl", "Blog card image", "image", true, "blog"],
    ["heroImageUrl", "Blog post hero image", "image", true, "blog"],
    ["summary", "Summary", "textarea", true],
    ["body", "Blog post body", "richtext", true]
  ], activePostIndex, (value) => {
    activePostIndex = value;
  }, {
    backLabel: "blog tiles",
    emptyText: "No blog posts yet. Use Add post to create one.",
    meta: (post) => post.date || "Blog post"
  });
}

function renderEmailTemplates() {
  const root = document.querySelector("#emailTemplatesEditor");
  if (!root) return;
  root.innerHTML = "";
  const template = emailTemplates.find((item) => item.id === activeEmailTemplateId);

  if (!template) {
    if (!emailTemplates.length) {
      root.innerHTML = `<div class="empty-media">No email templates are available. Apply the CRM database migration first.</div>`;
      return;
    }
    [
      ["transactional", "Transactional templates", "Required order and account communication."],
      ["marketing", "Automated marketing templates", "Emails used inside scheduled CRM sequences."],
      ["blast", "Blast templates", "One-time sales, announcements, and promotional campaigns."]
    ].forEach(([category, title, description]) => {
      const items = emailTemplates.filter((item) => item.category === category);
      const section = document.createElement("section");
      section.className = "email-template-group";
      section.innerHTML = `<div class="email-template-group-heading"><p class="eyebrow">${escapeAttribute(category)}</p><h2>${escapeAttribute(title)}</h2><p>${escapeAttribute(description)}</p></div>`;
      const grid = document.createElement("div");
      grid.className = "content-admin-grid";
      items.forEach((item) => {
        const tile = document.createElement("button");
        tile.className = "content-admin-tile";
        tile.type = "button";
        tile.innerHTML = `
          <span class="content-admin-status">${escapeAttribute(item.category || "transactional")}</span>
          <strong>${escapeAttribute(item.name || item.id)}</strong>
          <small>${escapeAttribute(item.subject || "No subject")}</small>
          <span>${escapeAttribute(item.enabled === false ? "Disabled" : "Enabled")}</span>
        `;
        tile.addEventListener("click", () => {
          activeEmailTemplateId = item.id;
          renderAll();
        });
        grid.append(tile);
      });
      if (!items.length) grid.innerHTML = `<div class="empty-media">No ${escapeAttribute(category)} templates yet.</div>`;
      section.append(grid);
      root.append(section);
    });
    return;
  }

  const back = document.createElement("button");
  back.className = "button ghost product-back";
  back.type = "button";
  back.textContent = "Back to email templates";
  back.addEventListener("click", () => {
    activeEmailTemplateId = null;
    renderAll();
  });

  const card = document.createElement("article");
  card.className = "editor-card";
  card.innerHTML = `
    <div class="field-wide">
      <p class="eyebrow">${escapeAttribute(template.category)}</p>
      <h2>${escapeAttribute(template.name)}</h2>
      <p class="admin-note">Available variables include {{customer_name}}, {{order_number}}, {{order_status}}, {{tracking_number}}, {{tracking_url}}, {{site_url}}, {{order_items}}, {{subtotal}}, {{shipping}}, {{total}}, and {{payment_details}}.</p>
    </div>
  `;
  card.append(
    field("Template name", template.name, (value) => { template.name = value; }),
    field("Subject line", template.subject, (value) => { template.subject = value; }),
    field("Preview text", template.preview_text, (value) => { template.preview_text = value; }, "textarea", true),
    field("Header image", template.header_image_url, (value) => { template.header_image_url = value; }, "image", true, "email"),
    field("Email body", template.body_html, (value) => { template.body_html = value; }, "richtext", true),
    field("Enabled", template.enabled, (value) => { template.enabled = value; }, "checkbox")
  );
  const save = document.createElement("button");
  save.className = "button primary";
  save.type = "button";
  save.textContent = "Save email template";
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const saved = await window.BeyondPepsSupabase.saveEmailTemplate(template);
      Object.assign(template, saved || {});
      toast("Email template saved.");
    } catch (error) {
      toast(`Template save failed: ${error.message}`);
    } finally {
      save.disabled = false;
    }
  });
  card.append(save);

  if (template.category === "blast") {
    const scheduler = document.createElement("section");
    scheduler.className = "email-campaign-scheduler field-wide";
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setMinutes(0, 0, 0);
    const localDefault = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const campaigns = crmCampaigns.filter((campaign) => campaign.template_id === template.id);
    scheduler.innerHTML = `
      <div>
        <p class="eyebrow">Blast scheduling</p>
        <h3>Schedule this email</h3>
      </div>
      <label>Campaign name<input id="blastCampaignName" type="text" value="${escapeAttribute(template.name || "Email blast")}"></label>
      <label>Send date and time<input id="blastCampaignTime" type="datetime-local" value="${localDefault}"></label>
      <button class="button primary" id="scheduleBlast" type="button">Schedule blast</button>
      <div class="campaign-list field-wide">
        <span class="admin-field-label">Campaign history</span>
        ${campaigns.map((campaign) => `
          <article class="campaign-row">
            <span><strong>${escapeAttribute(campaign.name)}</strong><small>${escapeAttribute(formatDate(campaign.scheduled_at))}</small></span>
            <b>${escapeAttribute(campaign.status)}</b>
            ${campaign.status === "scheduled" ? `<button class="remove-item" type="button" data-cancel-campaign="${escapeAttribute(campaign.id)}">Cancel</button>` : ""}
          </article>
        `).join("") || "<p>No campaigns have been scheduled from this template.</p>"}
      </div>
    `;
    scheduler.querySelector("#scheduleBlast").addEventListener("click", async () => {
      const name = scheduler.querySelector("#blastCampaignName").value.trim();
      const dateValue = scheduler.querySelector("#blastCampaignTime").value;
      if (!dateValue || Number.isNaN(new Date(dateValue).getTime())) {
        toast("Choose a valid blast send time.");
        return;
      }
      try {
        const saved = await window.BeyondPepsSupabase.saveEmailTemplate(template);
        Object.assign(template, saved || {});
        await window.BeyondPepsSupabase.scheduleCrmCampaign({
          template_id: template.id,
          name: name || template.name,
          scheduled_at: new Date(dateValue).toISOString()
        });
        await loadEmailAndCrm();
        toast("Email blast scheduled.");
        renderAll();
      } catch (error) {
        toast(`Blast scheduling failed: ${error.message}`);
      }
    });
    scheduler.querySelectorAll("[data-cancel-campaign]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await window.BeyondPepsSupabase.cancelCrmCampaign(button.dataset.cancelCampaign);
          await loadEmailAndCrm();
          toast("Email blast cancelled.");
          renderAll();
        } catch (error) {
          toast(`Campaign cancellation failed: ${error.message}`);
        }
      });
    });
    card.append(scheduler);
  }

  if (template.category !== "transactional") {
    const remove = document.createElement("button");
    remove.className = "remove-item";
    remove.type = "button";
    remove.textContent = "Delete template";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
      try {
        await window.BeyondPepsSupabase.deleteEmailTemplate(template.id);
        emailTemplates = emailTemplates.filter((item) => item.id !== template.id);
        activeEmailTemplateId = null;
        await loadEmailAndCrm();
        toast("Email template deleted.");
        renderAll();
      } catch (error) {
        toast(`Template delete failed: ${error.message}`);
      }
    });
    card.append(remove);
  }
  root.append(back, card);
}

function crmTile(title, summary, meta, onClick) {
  const tile = document.createElement("button");
  tile.className = "content-admin-tile";
  tile.type = "button";
  tile.innerHTML = `
    <span class="content-admin-status">${escapeAttribute(meta)}</span>
    <strong>${escapeAttribute(title)}</strong>
    <span>${escapeAttribute(summary)}</span>
  `;
  tile.addEventListener("click", onClick);
  return tile;
}

function renderCrmContacts(root) {
  const contact = crmContacts.find((item) => item.id === activeCrmContactId);
  if (contact) {
    const back = document.createElement("button");
    back.className = "button ghost product-back";
    back.type = "button";
    back.textContent = "Back to CRM contacts";
    back.addEventListener("click", () => {
      activeCrmContactId = null;
      renderAll();
    });
    const card = document.createElement("article");
    card.className = "editor-card";
    card.innerHTML = `
      <div class="field-wide">
        <p class="eyebrow">${escapeAttribute(contact.marketing_status)}</p>
        <h2>${escapeAttribute(contact.email)}</h2>
        <p class="admin-note">Source: ${escapeAttribute(contact.source)} · Joined ${escapeAttribute(formatDate(contact.created_at))}</p>
      </div>
    `;
    card.append(
      field("Name", contact.full_name, (value) => { contact.full_name = value; }),
      field("Email", contact.email, (value) => { contact.email = value; }, "email")
    );
    const status = document.createElement("label");
    status.textContent = "Marketing status";
    const select = document.createElement("select");
    select.innerHTML = ["subscribed", "unsubscribed"].map((value) => `<option value="${value}"${contact.marketing_status === value ? " selected" : ""}>${value}</option>`).join("");
    select.addEventListener("change", () => { contact.marketing_status = select.value; });
    status.append(select);
    const save = document.createElement("button");
    save.className = "button primary";
    save.type = "button";
    save.textContent = "Save contact";
    save.addEventListener("click", async () => {
      try {
        await window.BeyondPepsSupabase.updateCrmContact(contact.id, {
          email: contact.email,
          full_name: contact.full_name,
          marketing_status: contact.marketing_status,
          subscribed_at: contact.marketing_status === "subscribed" ? (contact.subscribed_at || new Date().toISOString()) : contact.subscribed_at,
          unsubscribed_at: contact.marketing_status === "unsubscribed" ? new Date().toISOString() : null
        });
        toast("CRM contact saved.");
      } catch (error) {
        toast(`Contact save failed: ${error.message}`);
      }
    });
    card.append(status, save);
    root.append(back, card);
    return;
  }

  const back = document.createElement("button");
  back.className = "button ghost product-back";
  back.type = "button";
  back.textContent = "Back to CRM";
  back.addEventListener("click", () => {
    activeCrmSection = null;
    renderAll();
  });
  const grid = document.createElement("div");
  grid.className = "content-admin-grid";
  crmContacts.forEach((item) => {
    grid.append(crmTile(
      item.full_name || item.email,
      item.email,
      item.marketing_status,
      () => {
        activeCrmContactId = item.id;
        renderAll();
      }
    ));
  });
  root.append(back, grid);
}

function renderCrmSequenceEditor(root, sequence) {
  const steps = crmSequenceSteps
    .filter((step) => step.sequence_id === sequence.id)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const back = document.createElement("button");
  back.className = "button ghost product-back";
  back.type = "button";
  back.textContent = "Back to CRM sequences";
  back.addEventListener("click", () => {
    activeCrmSequenceId = null;
    renderAll();
  });
  const card = document.createElement("article");
  card.className = "editor-card";
  card.append(
    field("Sequence name", sequence.name, (value) => { sequence.name = value; }),
    field("Description", sequence.description, (value) => { sequence.description = value; }, "textarea", true),
    field("Active", sequence.active, (value) => { sequence.active = value; }, "checkbox")
  );
  const trigger = document.createElement("label");
  trigger.textContent = "Enrollment trigger";
  const triggerSelect = document.createElement("select");
  [
    ["all", "Accounts and mailing-list signups"],
    ["account_created", "New accounts"],
    ["mailing_list_signup", "Mailing-list signups"]
  ].forEach(([value, label]) => {
    triggerSelect.insertAdjacentHTML("beforeend", `<option value="${value}"${sequence.trigger_source === value ? " selected" : ""}>${label}</option>`);
  });
  triggerSelect.addEventListener("change", () => { sequence.trigger_source = triggerSelect.value; });
  trigger.append(triggerSelect);

  const stepList = document.createElement("div");
  stepList.className = "crm-step-list field-wide";
  const renderSteps = () => {
    stepList.innerHTML = `<span class="admin-field-label">Scheduled emails</span>`;
    steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "crm-step-row";
      const templateSelect = document.createElement("select");
      templateSelect.innerHTML = emailTemplates
        .filter((item) => item.category === "marketing")
        .map((item) => `<option value="${escapeAttribute(item.id)}"${step.template_id === item.id ? " selected" : ""}>${escapeAttribute(item.name)}</option>`)
        .join("");
      templateSelect.addEventListener("change", () => { step.template_id = templateSelect.value; });
      const delay = document.createElement("input");
      delay.type = "number";
      delay.min = "0";
      delay.value = step.delay_days || 0;
      delay.setAttribute("aria-label", "Days after enrollment");
      delay.addEventListener("input", () => { step.delay_days = Math.max(0, Number(delay.value || 0)); });
      const remove = document.createElement("button");
      remove.className = "remove-item";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        steps.splice(index, 1);
        renderSteps();
      });
      row.append(templateSelect, delay, document.createTextNode(" days after enrollment"), remove);
      stepList.append(row);
    });
  };
  renderSteps();

  const addStep = document.createElement("button");
  addStep.className = "button ghost";
  addStep.type = "button";
  addStep.textContent = "Add scheduled email";
  addStep.addEventListener("click", () => {
    const defaultTemplate = emailTemplates.find((item) => item.category === "marketing");
    if (!defaultTemplate) {
      toast("Create a marketing email template first.");
      return;
    }
    steps.push({
      id: crypto.randomUUID(),
      sequence_id: sequence.id,
      template_id: defaultTemplate.id,
      delay_days: 1,
      sort_order: steps.length * 10
    });
    renderSteps();
  });
  const save = document.createElement("button");
  save.className = "button primary";
  save.type = "button";
  save.textContent = "Save sequence";
  save.addEventListener("click", async () => {
    try {
      const saved = await window.BeyondPepsSupabase.saveCrmSequence(sequence, steps);
      Object.assign(sequence, saved || {});
      await loadEmailAndCrm();
      toast("CRM sequence saved.");
      renderAll();
    } catch (error) {
      toast(`Sequence save failed: ${error.message}`);
    }
  });
  card.append(trigger, stepList, addStep, save);
  root.append(back, card);
}

function renderCrmSequences(root) {
  const sequence = crmSequences.find((item) => item.id === activeCrmSequenceId);
  if (sequence) {
    renderCrmSequenceEditor(root, sequence);
    return;
  }
  const back = document.createElement("button");
  back.className = "button ghost product-back";
  back.type = "button";
  back.textContent = "Back to CRM";
  back.addEventListener("click", () => {
    activeCrmSection = null;
    renderAll();
  });
  const add = document.createElement("button");
  add.className = "button primary";
  add.type = "button";
  add.textContent = "Create sequence";
  add.addEventListener("click", () => {
    const sequence = {
      id: crypto.randomUUID(),
      name: "New sequence",
      description: "",
      trigger_source: "all",
      active: false
    };
    crmSequences.unshift(sequence);
    activeCrmSequenceId = sequence.id;
    renderAll();
  });
  const grid = document.createElement("div");
  grid.className = "content-admin-grid";
  crmSequences.forEach((item) => {
    const count = crmSequenceSteps.filter((step) => step.sequence_id === item.id).length;
    grid.append(crmTile(item.name, item.description || `${count} scheduled emails`, item.active ? "Active" : "Inactive", () => {
      activeCrmSequenceId = item.id;
      renderAll();
    }));
  });
  root.append(back, add, grid);
}

function renderCrm() {
  const root = document.querySelector("#crmEditor");
  if (!root) return;
  root.innerHTML = "";
  if (activeCrmSection === "contacts") {
    renderCrmContacts(root);
    return;
  }
  if (activeCrmSection === "sequences") {
    renderCrmSequences(root);
    return;
  }
  const subscribed = crmContacts.filter((item) => item.marketing_status === "subscribed").length;
  const sent = crmSends.filter((item) => item.status === "sent").length;
  const grid = document.createElement("div");
  grid.className = "content-admin-grid";
  grid.append(
    crmTile("Contacts", `${subscribed} subscribed of ${crmContacts.length} total contacts`, "Audience", () => {
      activeCrmSection = "contacts";
      renderAll();
    }),
    crmTile("Automated sequences", `${crmSequences.length} sequences · ${sent} emails sent`, "Automation", () => {
      activeCrmSection = "sequences";
      renderAll();
    })
  );
  root.append(grid);
}

function updateJsonEditor() {
  document.querySelector("#jsonEditor").value = JSON.stringify(content, null, 2);
}

function renderAll() {
  renderBackendStatus();
  renderSummary();
  renderSiteFields();
  renderShippingFields();
  renderPaymentFields();
  renderEmailTemplates();
  renderCrm();
  renderOrders();
  renderCollections();
  renderMediaLibrary();
  updateJsonEditor();
}

function renderBackendStatus() {
  const node = document.querySelector("#adminSessionStatus");
  const lockNode = document.querySelector("#adminAuthStatus");
  if (!window.BeyondPepsSupabase?.isConfigured()) {
    if (node) node.textContent = "Supabase is not configured.";
    if (lockNode) lockNode.textContent = "Supabase is not configured.";
    return;
  }
  const text = adminAllowed ? "Admin session active" : "Admin access required";
  if (node) node.textContent = text;
  if (lockNode) lockNode.textContent = text;
}

function renderSummary() {
  const root = document.querySelector("#adminSummary");
  if (!root) return;
  const featuredCount = featuredProductCount();
  root.innerHTML = `
    <article><strong>${content.products.length}</strong><span>Products</span></article>
    <article><strong>${featuredCount}/${MAX_FEATURED_PRODUCTS}</strong><span>Featured</span></article>
    <article><strong>${orders.length}</strong><span>Orders</span></article>
    <article><strong>${mediaAssets.length}</strong><span>Media</span></article>
    <article><strong>${crmContacts.length}</strong><span>CRM contacts</span></article>
    <article><strong>${content.references.length}</strong><span>References</span></article>
    <article><strong>${content.posts.length}</strong><span>Blog posts</span></article>
  `;
}

function renderMediaLibrary() {
  const root = document.querySelector("#mediaLibrary");
  if (!root) return;

  if (!mediaAssets.length) {
    root.innerHTML = `<div class="empty-media">No media uploaded yet.</div>`;
    return;
  }

  root.innerHTML = mediaAssets.map((asset) => `
    <article class="media-card">
      <img src="${escapeAttribute(resolveAdminImageUrl(asset.url))}" alt="">
      <strong>${escapeAttribute(asset.name || fileNameFromUrl(asset.url))}</strong>
      <input type="text" value="${escapeAttribute(asset.url)}" readonly>
    </article>
  `).join("");
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((node) => node.classList.remove("is-active"));
      document.querySelectorAll(".admin-panel").forEach((node) => node.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelector(`#${tab.dataset.panel}`).classList.add("is-active");
    });
  });
}

function setupActions() {
  document.querySelector("#saveContent").addEventListener("click", saveContent);
  document.querySelector("#adminSignOut").addEventListener("click", () => {
    window.BeyondPepsSupabase?.clearSession();
    setAdminLocked("Signed out. Sign in with an admin account to continue.");
    toast("Signed out.");
  });
  document.querySelector("#refreshOrders")?.addEventListener("click", async () => {
    await loadAdminOrders();
    toast("Orders refreshed.");
    renderAll();
  });
  document.querySelector("#refreshCrm")?.addEventListener("click", async () => {
    await loadEmailAndCrm();
    toast("CRM refreshed.");
    renderAll();
  });
  const addEmailTemplate = (category) => {
    const id = `${category}_${Date.now()}`;
    emailTemplates.push({
      id,
      name: category === "blast" ? "New email blast" : "New marketing email",
      category,
      subject: "Beyond Peps",
      preview_text: "",
      header_image_url: "/assets/bp-logo-mark.png",
      body_html: "<h1>Beyond Peps</h1><p>Hi {{customer_name}},</p>",
      enabled: true
    });
    activeEmailTemplateId = id;
    renderAll();
  };
  document.querySelector("#addMarketingTemplate")?.addEventListener("click", () => addEmailTemplate("marketing"));
  document.querySelector("#addBlastTemplate")?.addEventListener("click", () => addEmailTemplate("blast"));
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const collection = button.dataset.add;
      const templates = {
        products: { id: `product-${Date.now()}`, name: "New product", category: "Research Supplies", price: 0, stockLevel: 0, productWeight: null, status: "Draft", featured: false, mustShipSeparately: false, packageLength: null, packageWidth: null, packageHeight: null, packageWeight: null, imageUrl: "", galleryImages: [], summary: "", description: "" },
        references: { slug: `reference-${Date.now()}`, title: "New reference", type: "Guide", status: "Published", summary: "", body: "" },
        posts: { slug: `post-${Date.now()}`, title: "New post", date: new Date().toISOString().slice(0, 10), status: "Draft", imageUrl: "", heroImageUrl: "", summary: "", body: "" }
      };
      content[collection].push(templates[collection]);
      if (collection === "products") activeProductIndex = content.products.length - 1;
      if (collection === "references") activeReferenceIndex = content.references.length - 1;
      if (collection === "posts") activePostIndex = content.posts.length - 1;
      renderAll();
    });
  });

  document.querySelector("#refreshJson").addEventListener("click", updateJsonEditor);
  document.querySelector("#applyJson").addEventListener("click", () => {
    try {
      content = JSON.parse(document.querySelector("#jsonEditor").value);
      saveContent();
      renderAll();
    } catch (error) {
      toast(`JSON error: ${error.message}`);
    }
  });

  setupMediaUpload();
}

function setupMediaUpload() {
  const dropzone = document.querySelector("#mediaDropzone");
  const input = document.querySelector("#mediaUploadInput");
  if (!dropzone || !input) return;

  const uploadFiles = async (files) => {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      toast("Drop image files to upload.");
      return;
    }

    dropzone.classList.add("is-uploading");
    dropzone.querySelector("span").textContent = `Uploading ${images.length} image${images.length === 1 ? "" : "s"}...`;

    let uploaded = 0;
    for (const file of images) {
      try {
        const url = await window.BeyondPepsSupabase.uploadMedia(file, "products");
        const asset = {
          id: url,
          name: file.name,
          url,
          folder: "products",
          mimeType: file.type,
          sizeBytes: file.size
        };
        mediaAssets = [asset, ...mediaAssets.filter((item) => item.url !== url)];
        uploaded += 1;
      } catch (error) {
        toast(`Upload failed: ${error.message}`);
      }
    }

    dropzone.classList.remove("is-uploading", "is-dragging");
    dropzone.querySelector("span").textContent = "or choose multiple files to upload them into the reusable media library.";
    input.value = "";
    renderAll();
    toast(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded.`);
  };

  input.addEventListener("change", () => uploadFiles(input.files || []));
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    uploadFiles(event.dataTransfer?.files || []);
  });
}

function setAdminLocked(message = "Sign in with an admin account to continue.") {
  adminAllowed = false;
  document.querySelector(".admin-shell")?.classList.add("is-locked");
  document.querySelector(".admin-shell-header")?.classList.add("is-locked");
  document.querySelector("#adminLock")?.classList.remove("is-hidden");
  const status = document.querySelector("#adminAuthStatus");
  if (status) status.textContent = message;
}

function setAdminUnlocked() {
  adminAllowed = true;
  document.querySelector(".admin-shell")?.classList.remove("is-locked");
  document.querySelector(".admin-shell-header")?.classList.remove("is-locked");
  document.querySelector("#adminLock")?.classList.add("is-hidden");
}

async function requireAdmin() {
  if (!window.BeyondPepsSupabase?.isConfigured()) {
    setAdminLocked("Supabase is not configured.");
    return false;
  }

  const user = await window.BeyondPepsSupabase.currentUser();
  if (!user) {
    setAdminLocked("You are not signed in.");
    return false;
  }
  activeAdminEmail = user.email || "";

  const isAdmin = await window.BeyondPepsSupabase.currentUserIsAdmin();
  if (!isAdmin) {
    setAdminLocked(`Signed in as ${user.email}, but this account is not an admin.`);
    return false;
  }

  setAdminUnlocked();
  return true;
}

requireAdmin().then(async (allowed) => {
  if (!allowed) return;
  const data = await loadContent();
  content = normalizeContent(data);
  await loadMediaAssets();
  await loadAdminOrders();
  await loadEmailAndCrm();
  setupTabs();
  setupActions();
  renderAll();
}).catch((error) => {
  setAdminLocked(error.message);
});

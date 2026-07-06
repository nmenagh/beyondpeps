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

const siteSchema = [
  ["name", "Site name"],
  ["domain", "Domain"],
  ["announcement", "Announcement", "textarea"],
  ["heroEyebrow", "Hero eyebrow"],
  ["heroTitle", "Hero title", "textarea"],
  ["heroBody", "Hero body", "textarea"],
  ["blogHeroImageUrl", "Blog hero image URL", "image", "blog"],
  ["primaryCta", "Primary CTA"],
  ["secondaryCta", "Secondary CTA"],
  ["shippingMethods", "Shippo shipping methods", "shipping_methods"],
  ["disclaimer", "Footer disclaimer", "textarea"]
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
  data.site = {
    ...data.site,
    shippingMethods: normalizeShippingMethods(data.site?.shippingMethods)
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

function normalizeShippingMethods(value = {}) {
  const enabledServicelevels = Array.isArray(value.enabledServicelevels)
    ? value.enabledServicelevels
    : ["usps_ground_advantage", "usps_priority", "ups_ground"];
  return {
    enabledServicelevels: [...new Set(enabledServicelevels.map((item) => String(item || "").trim()).filter(Boolean))],
    customServicelevels: String(value.customServicelevels || "")
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
  siteSchema.forEach(([key, label, type, uploadFolder]) => {
    root.append(field(label, content.site[key], (value) => {
      content.site[key] = value;
    }, type || "text", key === "domain" ? false : type === "textarea", uploadFolder));
  });
}

function renderCollection(collection, rootSelector, schema) {
  const root = document.querySelector(rootSelector);
  root.innerHTML = "";

  content[collection].forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "editor-card";
    const title = document.createElement("h2");
    title.textContent = `${index + 1}. ${item.name || item.title || "Untitled"}`;
    card.append(title);

    schema.forEach(([key, label, type, wide, uploadFolder]) => {
      card.append(field(label, item[key], (value) => {
        if (collection === "products" && key === "featured" && value && featuredProductCount(item) >= MAX_FEATURED_PRODUCTS) {
          toast(`Only ${MAX_FEATURED_PRODUCTS} products can be featured at a time.`);
          return false;
        }
        item[key] = value;
        title.textContent = `${index + 1}. ${item.name || item.title || "Untitled"}`;
        return true;
      }, type || "text", wide, uploadFolder));
    });

    const remove = document.createElement("button");
    remove.className = "remove-item";
    remove.type = "button";
    remove.textContent = "Remove item";
    remove.addEventListener("click", () => {
      content[collection].splice(index, 1);
      renderAll();
    });
    card.append(remove);
    root.append(card);
  });
}

function renderCollections() {
  renderCollection("products", "#productsEditor", [
    ["id", "ID"],
    ["name", "Name"],
    ["category", "Category"],
    ["price", "Price", "number"],
    ["stockLevel", "Stock level", "number"],
    ["status", "Status"],
    ["featured", "Featured product", "checkbox"],
    ["imageUrl", "Product image", "image", true, "products"],
    ["galleryImages", "Product gallery images", "gallery", true, "products"],
    ["summary", "Card summary", "textarea", true],
    ["description", "Extended product description", "textarea", true]
  ]);

  renderCollection("references", "#referencesEditor", [
    ["slug", "Slug"],
    ["title", "Title"],
    ["type", "Type"],
    ["status", "Status"],
    ["summary", "Card summary", "textarea", true],
    ["body", "Reference page body", "richtext", true]
  ]);

  renderCollection("posts", "#postsEditor", [
    ["title", "Title"],
    ["date", "Date"],
    ["status", "Status"],
    ["imageUrl", "Blog card image", "image", true, "blog"],
    ["heroImageUrl", "Blog post hero image", "image", true, "blog"],
    ["summary", "Summary", "textarea", true]
  ]);
}

function updateJsonEditor() {
  document.querySelector("#jsonEditor").value = JSON.stringify(content, null, 2);
}

function renderAll() {
  renderBackendStatus();
  renderSummary();
  renderSiteFields();
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
    <article><strong>${mediaAssets.length}</strong><span>Media</span></article>
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
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const collection = button.dataset.add;
      const templates = {
        products: { id: `product-${Date.now()}`, name: "New product", category: "Research Supplies", price: 0, stockLevel: 0, status: "Draft", featured: false, imageUrl: "", galleryImages: [], summary: "", description: "" },
        references: { slug: `reference-${Date.now()}`, title: "New reference", type: "Guide", status: "Published", summary: "", body: "" },
        posts: { title: "New post", date: new Date().toISOString().slice(0, 10), status: "Draft", imageUrl: "", heroImageUrl: "", summary: "" }
      };
      content[collection].push(templates[collection]);
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
  setupTabs();
  setupActions();
  renderAll();
}).catch((error) => {
  setAdminLocked(error.message);
});

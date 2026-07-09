const STORAGE_KEY = "beyondPepsContent";

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
    return false;
  }
  return true;
}

function hasUsableContent(content) {
  return Boolean(
    content?.schemaVersion >= 2 &&
    content?.site?.heroTitle &&
    Array.isArray(content.products) &&
    Array.isArray(content.references) &&
    Array.isArray(content.posts)
  );
}

async function loadContent() {
  const defaults = cloneDefaultContent();
  try {
    const remoteContent = await window.BeyondPepsSupabase?.loadContent(defaults);
    if (hasUsableContent(remoteContent)) {
      storageSet(STORAGE_KEY, JSON.stringify(remoteContent));
      return remoteContent;
    }
  } catch (error) {
    console.warn("Supabase content unavailable, using local fallback.", error);
  }

  const stored = storageGet(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (hasUsableContent(parsed)) return parsed;
      const content = cloneDefaultContent();
      storageSet(STORAGE_KEY, JSON.stringify(content));
      return content;
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }

  try {
    const response = await fetch("data/site-content.json");
    if (!response.ok) throw new Error("Content request failed");
    const content = await response.json();
    storageSet(STORAGE_KEY, JSON.stringify(content));
    return content;
  } catch {
    const content = defaults;
    storageSet(STORAGE_KEY, JSON.stringify(content));
    return content;
  }
}

function valueAtPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function applyContentBindings(content) {
  document.querySelectorAll("[data-content]").forEach((node) => {
    const value = valueAtPath(content, node.dataset.content);
    if (typeof value === "string") node.textContent = value;
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

function imageMarkup(url, alt, className) {
  if (!url) return "";
  return `<div class="${className}"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"></div>`;
}

function isPublished(item) {
  return String(item?.status || "Published").trim().toLowerCase() === "published";
}

function renderProductCard(product) {
  const stockLevel = Number.isFinite(Number(product.stockLevel)) ? Math.max(0, Math.floor(Number(product.stockLevel))) : null;
  return `
    <a class="product-card product-card-link" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name || "product")}">
      ${imageMarkup(product.imageUrl, product.name || "Product image", "card-image product-image")}
      <div class="product-topline">
        <span>${escapeHtml(product.category || "Supply")}</span>
        <span class="status">${escapeHtml(product.status || "Draft")}</span>
      </div>
      <h3>${escapeHtml(product.name || "Untitled product")}</h3>
      <p>${escapeHtml(product.summary || "")}</p>
      <span class="stock-chip ${stockLevel === 0 ? "is-empty" : ""}">${escapeHtml(stockLabel(stockLevel))}</span>
      <div class="price">${money(product.price)}</div>
    </a>
  `;
}

function stockLabel(stockLevel) {
  if (stockLevel === null) return "Stock checked at checkout";
  if (stockLevel === 0) return "Out of stock";
  if (stockLevel <= 5) return `Only ${stockLevel} left`;
  return `${stockLevel} in stock`;
}

function renderPostCard(post, wide = false) {
  const id = post.id || post.slug || slugify(post.title || "post");
  return `
    <a class="${wide ? "wide-card " : ""}post-card post-card-link" href="post.html?id=${encodeURIComponent(id)}" aria-label="Read ${escapeHtml(post.title || "blog post")}">
      ${imageMarkup(post.imageUrl || post.heroImageUrl, post.title || "Blog image", "card-image post-image")}
      <div class="post-topline">
        <span>${escapeHtml(post.date || "")}</span>
        <span>${escapeHtml(post.status || "Draft")}</span>
      </div>
      <h3>${escapeHtml(post.title || "Untitled post")}</h3>
      <p>${escapeHtml(post.summary || "")}</p>
      <span class="read-more">Read post</span>
    </a>
  `;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `post-${Date.now()}`;
}

function renderProducts(products = []) {
  const grid = document.querySelector("#productGrid");
  if (!grid) return;
  const list = grid.dataset.products === "featured"
    ? products.filter((product) => product.featured).slice(0, 3)
    : products;
  renderProductsInto(grid, list, grid.dataset.products === "featured" ? "No featured products selected yet." : "No products available yet.");
}

function renderFeaturedProducts(products = []) {
  const grid = document.querySelector("#featuredProductGrid");
  if (!grid) return;
  renderProductsInto(grid, products.filter((product) => product.featured).slice(0, 3));
}

function renderProductsInto(grid, products = [], emptyMessage = "No products available yet.") {
  grid.innerHTML = products.length
    ? products.map(renderProductCard).join("")
    : `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
}

function renderReferences(references = []) {
  const list = document.querySelector("#referenceList");
  if (!list) return;
  list.innerHTML = references.filter(isPublished).map((reference) => `
    <a class="reference-card reference-card-link" href="reference.html?id=${encodeURIComponent(reference.id || reference.slug || reference.title)}" aria-label="Read ${escapeHtml(reference.title || "reference")}">
      <span class="type">${escapeHtml(reference.type || "Reference")}</span>
      <h3>${escapeHtml(reference.title || "Untitled reference")}</h3>
      <p>${escapeHtml(reference.summary || "")}</p>
      <span class="read-more">Read reference</span>
    </a>
  `).join("");
}

function renderPosts(posts = []) {
  const grid = document.querySelector("#postGrid");
  if (!grid) return;
  grid.innerHTML = posts.filter(isPublished).map((post) => renderPostCard(post)).join("");
}

function renderPostList(posts = []) {
  const list = document.querySelector("#postList");
  if (!list) return;
  const published = posts.filter(isPublished);
  list.innerHTML = published.length
    ? published.map((post) => renderPostCard(post, true)).join("")
    : `<p class="empty-state">No published blog posts yet.</p>`;
}

function applyPageMedia(content) {
  const blogHero = document.querySelector("[data-blog-hero]");
  if (blogHero && content.site?.blogHeroImageUrl) {
    blogHero.style.setProperty("--page-hero-image", `url("${content.site.blogHeroImageUrl}")`);
    blogHero.classList.add("has-page-hero-image");
  }
}

async function updateAccountPill() {
  const pill = document.querySelector("[data-account-pill]");
  if (!pill) return;

  try {
    const user = await window.BeyondPepsSupabase?.currentUser?.();
    pill.textContent = user ? "Account" : "Login";
  } catch {
    pill.textContent = "Login";
  }
}

function setupHeroMotion() {
  const root = document.documentElement;
  let raf = 0;

  const update = () => {
    const scroll = window.scrollY;
    const shift = Math.min(120, scroll * 0.16);
    const sheen = Math.min(640, scroll * 0.7) - 220;
    const scale = 1.035 + Math.min(0.035, scroll * 0.00004);
    root.style.setProperty("--hero-shift", `${shift}px`);
    root.style.setProperty("--sheen-shift", `${sheen}px`);
    root.style.setProperty("--hero-scale", scale.toFixed(3));
    raf = 0;
  };

  window.addEventListener("scroll", () => {
    if (!raf) raf = requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function setupMobileNav() {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  if (!header || !toggle) return;

  const setOpen = (open) => {
    header.classList.toggle("is-menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  toggle.addEventListener("click", () => {
    setOpen(!header.classList.contains("is-menu-open"));
  });

  header.querySelectorAll(".nav-links a, .account-pill").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function setupNewsletterSignup() {
  const footer = document.querySelector(".site-footer");
  if (!footer || document.querySelector("#newsletterSignup")) return;

  const section = document.createElement("section");
  section.className = "newsletter-band";
  section.innerHTML = `
    <div>
      <p class="eyebrow">Beyond the order</p>
      <h2>Research notes, tools, and new supply updates.</h2>
    </div>
    <form class="newsletter-form" id="newsletterSignup">
      <label>
        Name
        <input name="fullName" type="text" autocomplete="name" placeholder="Your name">
      </label>
      <label>
        Email
        <input name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
      </label>
      <button class="button primary" type="submit">Join the mailing list</button>
      <p class="newsletter-status" id="newsletterStatus">Marketing emails include an unsubscribe link. Order messages are separate.</p>
    </form>
  `;
  footer.before(section);

  section.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const status = form.querySelector("#newsletterStatus");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    status.textContent = "Joining...";
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          fullName: values.fullName,
          source: "mailing_list_signup"
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to join the mailing list.");
      form.reset();
      status.textContent = "You're on the list. Watch your inbox for Beyond Peps updates.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

loadContent().then((content) => {
  window.BeyondPepsContent = content;
  applyContentBindings(content);
  renderProducts(content.products);
  renderFeaturedProducts(content.products);
  renderReferences(content.references);
  renderPosts(content.posts);
  renderPostList(content.posts);
  applyPageMedia(content);
  updateAccountPill();
  setupMobileNav();
  setupHeroMotion();
  setupNewsletterSignup();
});

window.BeyondPepsSite = {
  loadContent,
  updateAccountPill
};

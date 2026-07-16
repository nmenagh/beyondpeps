(function () {
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function slugify(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
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

  function bodyMarkup(value = "") {
    if (/<[a-z][\s\S]*>/i.test(value)) {
      return cleanRichHtml(value) || "<p>This reference is being expanded. Check back soon for more detail.</p>";
    }

    const blocks = String(value).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    if (!blocks.length) return "<p>This reference is being expanded. Check back soon for more detail.</p>";
    return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function normalizeAnchor(value = "") {
    return String(value).trim().replace(/^#/, "");
  }

  function anchorMatches(value, id) {
    return normalizeAnchor(value) === id || slugify(value) === slugify(id);
  }

  function findAnchorTarget(id) {
    if (!id) return null;
    return [...document.querySelectorAll("#referenceBody [id], #referenceBody [name]")]
      .find((node) => anchorMatches(node.id, id) || anchorMatches(node.getAttribute("name"), id));
  }

  function setupInternalAnchors() {
    document.querySelector("#referenceBody")?.addEventListener("click", handleAnchorClick);
    document.querySelector("#referenceToc")?.addEventListener("click", handleAnchorClick);
  }

  function handleAnchorClick(event) {
      const link = event.target.closest?.('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      const target = findAnchorTarget(id);
      if (!target) return;
      event.preventDefault();
      const section = target.closest(".reference-guide-section");
      if (section?.id) {
        setActiveSection(section.id);
      }
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      const headerOffset = window.matchMedia("(max-width: 860px)").matches ? 96 : 120;
      const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }

  function chooseGuideHeading(candidates) {
    return ["H2", "H3", "H4"].find((tag) => candidates.filter((node) => node.tagName === tag).length >= 6) || "";
  }

  function isBookmarkSectionStart(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "A") return false;
    const name = normalizeAnchor(node.getAttribute("name") || node.id);
    const title = node.textContent.trim();
    return /^bm_[a-z0-9_]+$/i.test(name) && title.length >= 2 && title.length <= 90;
  }

  function isIndexBacklink(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return /back\s+to\s+index/i.test(node.textContent.trim());
  }

  function ensureNodeId(node, usedIds) {
    const existing = normalizeAnchor(node.id || node.getAttribute("name"));
    let id = existing || slugify(node.textContent || "section");
    if (!id) id = "section";
    const base = id;
    let index = 2;
    while (usedIds.has(id)) {
      id = `${base}-${index}`;
      index += 1;
    }
    usedIds.add(id);
    node.id = id;
    return id;
  }

  function createBookmarkHeading(source, id) {
    const heading = document.createElement("h2");
    heading.id = id;
    heading.setAttribute("name", id);
    heading.textContent = source.textContent.trim() || "Reference section";
    return heading;
  }

  function buildBookmarkGuideSections(template) {
    const usedIds = new Set();
    const introNodes = [];
    const sections = [];
    let activeSection = null;

    [...template.content.childNodes].forEach((node) => {
      if (isBookmarkSectionStart(node)) {
        const id = ensureNodeId(node, usedIds);
        const heading = createBookmarkHeading(node, id);
        activeSection = {
          id,
          title: heading.textContent,
          nodes: [heading]
        };
        sections.push(activeSection);
        return;
      }

      if (activeSection) {
        if (isIndexBacklink(node)) return;
        activeSection.nodes.push(node);
      } else {
        introNodes.push(node);
      }
    });

    if (sections.length < 6) return null;
    return { introNodes, sections };
  }

  function buildGuideSections(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup;
    const headingCandidates = [...template.content.querySelectorAll("h2, h3, h4")]
      .filter((node) => node.textContent.trim().length >= 2 && node.textContent.trim().length <= 90);
    const sectionHeading = chooseGuideHeading(headingCandidates);
    if (!sectionHeading) return buildBookmarkGuideSections(template);

    const usedIds = new Set();
    const introNodes = [];
    const sections = [];
    let activeSection = null;

    [...template.content.childNodes].forEach((node) => {
      const isSectionHeading = node.nodeType === Node.ELEMENT_NODE && node.tagName === sectionHeading;
      if (isSectionHeading) {
        const id = ensureNodeId(node, usedIds);
        activeSection = {
          id,
          title: node.textContent.trim() || "Reference section",
          nodes: [node]
        };
        sections.push(activeSection);
        return;
      }

      if (activeSection) {
        if (isIndexBacklink(node)) return;
        activeSection.nodes.push(node);
      } else {
        introNodes.push(node);
      }
    });

    if (sections.length < 6) return null;
    return { introNodes, sections };
  }

  function renderNodes(nodes) {
    const wrapper = document.createElement("div");
    nodes.forEach((node) => wrapper.append(node.cloneNode(true)));
    return wrapper.innerHTML.trim();
  }

  function shouldUseStructuredGuide(reference = {}) {
    const keys = [reference.id, reference.slug, reference.title, slugify(reference.title || "")]
      .map((value) => String(value || "").toLowerCase());
    return keys.includes("peptide-reference-guide");
  }

  function renderStructuredGuide(markup, reference = {}) {
    const guide = buildGuideSections(markup);
    const tools = document.querySelector("#referenceGuideTools");
    const toc = document.querySelector("#referenceToc");
    const count = document.querySelector("#referenceGuideCount");
    const search = document.querySelector("#referenceGuideSearch");
    const clearSearch = document.querySelector("#referenceGuideClear");
    const body = document.querySelector("#referenceBody");
    const layout = document.querySelector(".reference-detail-layout");
    if (!shouldUseStructuredGuide(reference) || !guide || !tools || !toc || !body) {
      if (tools) tools.hidden = true;
      if (toc) toc.innerHTML = "";
      if (count) count.textContent = "Select a section to view.";
      if (search) search.value = "";
      if (clearSearch) clearSearch.hidden = true;
      layout?.classList.remove("is-guide-mode");
      body.innerHTML = markup;
      return false;
    }

    tools.hidden = false;
    layout?.classList.add("is-guide-mode");
    body.innerHTML = `
      <div class="reference-guide-sections">
        ${guide.sections.map((section, index) => `
          <section class="reference-guide-section${index === 0 ? " is-active" : ""}" id="section-${escapeHtml(section.id)}" data-title="${escapeHtml(section.title.toLowerCase())}">
            ${renderNodes(section.nodes)}
          </section>
        `).join("")}
      </div>
    `;

    toc.innerHTML = guide.sections.map((section, index) => `
      <a class="${index === 0 ? "is-active" : ""}" href="#${encodeURIComponent(section.id)}" data-section="section-${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>
    `).join("");

    const updateCount = (term = "") => {
      const visible = [...toc.querySelectorAll("a")].filter((link) => !link.hidden).length;
      count.textContent = term ? `${visible} matches found` : `${visible} peptides available`;
    };

    const applySearch = () => {
      const term = search?.value.trim().toLowerCase() || "";
      [...toc.querySelectorAll("a")].forEach((link) => {
        link.hidden = Boolean(term) && !link.textContent.toLowerCase().includes(term);
      });
      if (clearSearch) clearSearch.hidden = !term;
      updateCount(term);
    };

    search?.addEventListener("input", applySearch);
    clearSearch?.addEventListener("click", () => {
      search.value = "";
      applySearch();
      search.focus();
    });
    updateCount();

    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      const hashTarget = findAnchorTarget(hash);
      const section = hashTarget?.closest(".reference-guide-section");
      if (section?.id) setActiveSection(section.id);
    }

    return true;
  }

  function setActiveSection(id) {
    const sectionId = normalizeAnchor(id);
    document.querySelectorAll(".reference-guide-section").forEach((section) => {
      section.classList.toggle("is-active", section.id === sectionId);
    });
    document.querySelectorAll("#referenceToc a").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.section === sectionId);
    });
  }

  window.BeyondPepsSite.loadContent().then((content) => {
    const id = new URLSearchParams(window.location.search).get("id") || "";
    const reference = content.references.find((item) => {
      const keys = [item.id, item.slug, item.title, slugify(item.title || "")].map((value) => String(value || "").toLowerCase());
      return keys.includes(id.toLowerCase());
    });

    if (!reference) {
      document.querySelector("#referenceTitle").textContent = "Reference not found";
      document.querySelector("#referenceSummary").textContent = "The reference may have moved or is not published.";
      document.querySelector("#referenceBody").innerHTML = '<p><a href="references.html">Return to the reference library.</a></p>';
      return;
    }

    if (String(reference.status || "Published").trim().toLowerCase() !== "published") {
      document.querySelector("#referenceTitle").textContent = "Reference not published";
      document.querySelector("#referenceSummary").textContent = "This reference is not available in the public library.";
      document.querySelector("#referenceBody").innerHTML = '<p><a href="references.html">Return to the reference library.</a></p>';
      return;
    }

    document.title = `${reference.title} | Beyond Peps`;
    document.querySelector("#referenceType").textContent = reference.type || "Reference";
    document.querySelector("#referenceTitle").textContent = reference.title || "Reference";
    document.querySelector("#referenceSummary").textContent = reference.summary || "";
    const markup = bodyMarkup(reference.body || reference.summary);
    renderStructuredGuide(markup, reference);
    setupInternalAnchors();
  }).catch(() => {
    document.querySelector("#referenceTitle").textContent = "Reference unavailable";
    document.querySelector("#referenceSummary").textContent = "The reference library could not be loaded.";
  });
})();

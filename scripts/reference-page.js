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

  function findAnchorTarget(id) {
    if (!id) return null;
    const matches = (value) => value === id;
    return [...document.querySelectorAll("#referenceBody [id], #referenceBody [name]")]
      .find((node) => matches(node.id) || matches(node.getAttribute("name")));
  }

  function setupInternalAnchors() {
    document.querySelector("#referenceBody")?.addEventListener("click", (event) => {
      const link = event.target.closest?.('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      const target = findAnchorTarget(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
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
    document.querySelector("#referenceBody").innerHTML = bodyMarkup(reference.body || reference.summary);
    setupInternalAnchors();
  }).catch(() => {
    document.querySelector("#referenceTitle").textContent = "Reference unavailable";
    document.querySelector("#referenceSummary").textContent = "The reference library could not be loaded.";
  });
})();

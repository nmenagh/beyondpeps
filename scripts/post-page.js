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
    const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H2", "H3", "H4", "HR", "I", "LI", "OL", "P", "SPAN", "STRONG", "U", "UL"]);
    const template = document.createElement("template");
    template.innerHTML = html;

    template.content.querySelectorAll("*").forEach((node) => {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }

      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name === "href" && node.tagName === "A") {
          const href = attribute.value.trim();
          if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return;
        }
        node.removeAttribute(attribute.name);
      });
    });

    return template.innerHTML.trim();
  }

  function bodyMarkup(value = "") {
    if (/<[a-z][\s\S]*>/i.test(value)) {
      return cleanRichHtml(value) || "<p>This post is being written. Check back soon.</p>";
    }

    const blocks = String(value).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    if (!blocks.length) return "<p>This post is being written. Check back soon.</p>";
    return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
  }

  window.BeyondPepsSite.loadContent().then((content) => {
    const id = new URLSearchParams(window.location.search).get("id") || "";
    const post = content.posts.find((item) => {
      const keys = [item.id, item.slug, item.title, slugify(item.title || "")].map((value) => String(value || "").toLowerCase());
      return keys.includes(id.toLowerCase());
    });

    if (!post) {
      document.querySelector("#postTitle").textContent = "Post not found";
      document.querySelector("#postSummary").textContent = "The blog post may have moved or is not published.";
      document.querySelector("#postBody").innerHTML = '<p><a href="blog.html">Return to the blog.</a></p>';
      return;
    }

    if (String(post.status || "Draft").trim().toLowerCase() !== "published") {
      document.querySelector("#postTitle").textContent = "Post not published";
      document.querySelector("#postSummary").textContent = "This blog post is not available publicly yet.";
      document.querySelector("#postBody").innerHTML = '<p><a href="blog.html">Return to the blog.</a></p>';
      return;
    }

    document.title = `${post.title} | Beyond Peps`;
    document.querySelector("#postDate").textContent = post.date || "Blog";
    document.querySelector("#postTitle").textContent = post.title || "Blog post";
    document.querySelector("#postSummary").textContent = post.summary || "";
    document.querySelector("#postBody").innerHTML = bodyMarkup(post.body || post.summary);

    const hero = document.querySelector("#postHero");
    const heroImage = post.heroImageUrl || post.imageUrl;
    if (hero && heroImage) {
      hero.style.setProperty("--page-hero-image", `url("${heroImage}")`);
      hero.classList.add("has-page-hero-image");
    }
  }).catch(() => {
    document.querySelector("#postTitle").textContent = "Post unavailable";
    document.querySelector("#postSummary").textContent = "The blog could not be loaded.";
  });
})();

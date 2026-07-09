const DEFAULT_SUPABASE_URL = "https://zcxwrgnlqfgdkeqysctg.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjeHdyZ25scWZnZGtlcXlzY3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDk2ODQsImV4cCI6MjA5NzkyNTY4NH0.3mZJz2bY51GtgQKe8O6APbws4e5rzZGtGCS6tO4Qd7w";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function siteUrl() {
  return env("SITE_URL", env("PUBLIC_SITE_URL", "https://beyondpeps.vercel.app")).replace(/\/$/, "");
}

function supabaseConfig() {
  return {
    url: env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL", DEFAULT_SUPABASE_URL)).replace(/\/$/, ""),
    key: env("SUPABASE_SERVICE_ROLE_KEY", env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY)))
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${options.authToken || key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(payload?.message || payload?.error || text || "Supabase email request failed.");
  return payload;
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

function absoluteUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function replaceTokens(source = "", tokens = {}, htmlTokenNames = []) {
  const htmlTokens = new Set(htmlTokenNames);
  return String(source).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key) => {
    const value = tokens[key] ?? "";
    return htmlTokens.has(key) ? String(value) : escapeHtml(value);
  });
}

async function loadTemplate(templateId, includeDisabled = false) {
  try {
    const enabledFilter = includeDisabled ? "" : "&enabled=eq.true";
    const rows = await supabaseRequest(`/rest/v1/email_templates?id=eq.${encodeURIComponent(templateId)}${enabledFilter}&select=*&limit=1`);
    return rows?.[0] || null;
  } catch (error) {
    console.warn(`Email template ${templateId} unavailable.`, error.message);
    return null;
  }
}

async function contactForEmail(email, fullName = "") {
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) return null;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const existing = await supabaseRequest(`/rest/v1/crm_contacts?email=ilike.${encodeURIComponent(normalizedEmail)}&select=*&limit=1`);
  if (existing?.[0]) return existing[0];

  const rows = await supabaseRequest("/rest/v1/crm_contacts", {
    method: "POST",
    body: [{
      email: normalizedEmail,
      full_name: fullName || "",
      source: "order",
      marketing_status: "unsubscribed"
    }]
  });
  return rows?.[0] || null;
}

function emailWrapper({ bodyHtml, headerImageUrl, previewText, unsubscribeUrl }) {
  const image = absoluteUrl(headerImageUrl || "/assets/bp-logo-mark.png");
  const preferenceFooter = unsubscribeUrl
    ? `<p style="margin:0 0 6px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#398e88">Unsubscribe from marketing emails</a></p>`
    : "";

  return `<!doctype html>
  <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Beyond Peps</title></head>
    <body style="margin:0;background:#07161c;color:#eaf7f8;font-family:Arial,sans-serif">
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(previewText || "")}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#07161c">
        <tr><td align="center" style="padding:28px 14px">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:#10252d;border:1px solid #315966;border-radius:8px">
            <tr><td align="center" style="padding:26px 28px 10px">
              ${image ? `<img src="${escapeHtml(image)}" alt="Beyond Peps" style="display:block;max-width:360px;max-height:220px;width:auto;height:auto">` : ""}
            </td></tr>
            <tr><td style="padding:22px 32px 32px;color:#eaf7f8;font-size:16px;line-height:1.6">${bodyHtml}</td></tr>
            <tr><td style="padding:20px 32px;border-top:1px solid #315966;color:#9eb6bd;font-size:12px;line-height:1.5">
              ${preferenceFooter}
              <p style="margin:0">Unsubscribing affects marketing messages only. Order confirmations, shipping notices, and account-required emails will continue.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

async function renderStoredEmail({
  templateId,
  fallback,
  tokens = {},
  htmlTokenNames = [],
  recipientEmail = "",
  recipientName = "",
  unsubscribeToken = "",
  includeDisabled = false,
  lookupContact = true
}) {
  const template = await loadTemplate(templateId, includeDisabled);
  const selected = template || fallback;
  const contact = unsubscribeToken || !lookupContact ? null : await contactForEmail(recipientEmail, recipientName);
  const token = unsubscribeToken || contact?.unsubscribe_token || "";
  const unsubscribeUrl = token ? `${siteUrl()}/unsubscribe.html?token=${encodeURIComponent(token)}` : "";
  const mergedTokens = {
    site_url: siteUrl(),
    unsubscribe_url: unsubscribeUrl,
    ...tokens
  };
  const subject = replaceTokens(selected.subject || "Beyond Peps update", mergedTokens);
  const bodyHtml = replaceTokens(selected.body_html || "", mergedTokens, htmlTokenNames);
  return {
    subject,
    html: emailWrapper({
      bodyHtml,
      headerImageUrl: selected.header_image_url,
      previewText: replaceTokens(selected.preview_text || "", mergedTokens),
      unsubscribeUrl
    })
  };
}

async function sendResendEmail({ to, subject, html, idempotencyKey = "" }) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM", env("RESEND_FROM_EMAIL"));
  if (!apiKey || !from) return { sent: false, reason: "Email is not configured." };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from,
      to,
      reply_to: env("EMAIL_REPLY_TO") || undefined,
      subject,
      html
    })
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) throw new Error(payload.message || payload.error || "Email failed to send.");
  return { sent: true, id: payload.id };
}

module.exports = {
  escapeHtml,
  renderStoredEmail,
  sendResendEmail,
  siteUrl,
  supabaseRequest
};

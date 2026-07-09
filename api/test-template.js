const { renderStoredEmail, sendResendEmail, supabaseRequest } = require("./_email");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function requestBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body;
}

async function requireAdmin(authHeader = "") {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Admin session token is required.");
  const result = await supabaseRequest("/rest/v1/rpc/beyond_peps_current_user_is_admin", {
    method: "POST",
    authToken: token,
    body: {}
  });
  if (result !== true) throw new Error("Admin access is required.");
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    await requireAdmin(request.headers.authorization || "");
    const body = requestBody(request);
    const to = String(body.to || "").trim();
    const templateId = String(body.templateId || "").trim();
    if (!to || !templateId) throw new Error("Template and recipient email are required.");

    const rendered = await renderStoredEmail({
      templateId,
      fallback: {
        subject: "Beyond Peps template test",
        preview_text: "Email template test",
        header_image_url: "/assets/bp-logo-mark.png",
        body_html: "<h1>Template unavailable</h1><p>The selected template could not be loaded.</p>"
      },
      tokens: {
        customer_name: "Jamie Researcher",
        order_number: "BP-1048",
        order_status: "Paid",
        tracking_number: "1Z999AA10123456784",
        tracking_url: "https://www.ups.com/track",
        shipping_provider: "UPS",
        shipping_service: "Ground",
        subtotal: "$75.00",
        shipping: "$8.95",
        total: "$83.95",
        order_items: "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td style=\"padding:8px 0;border-bottom:1px solid #d8e7ea\">Research supply x 1</td><td align=\"right\" style=\"padding:8px 0;border-bottom:1px solid #d8e7ea\">$75.00</td></tr></table>",
        payment_details: "<h2>Payment details</h2><p>Your payment instructions or confirmation details appear here.</p>"
      },
      htmlTokenNames: ["order_items", "payment_details"],
      recipientEmail: to,
      recipientName: "Jamie Researcher",
      includeDisabled: true,
      lookupContact: false
    });
    const result = await sendResendEmail({
      to,
      ...rendered,
      idempotencyKey: `template-test-${templateId}-${Date.now()}`
    });
    json(response, 200, result);
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to send test email." });
  }
};

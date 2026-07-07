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

function money(cents = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(cents || 0) / 100);
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

function zelleDetails(settings = {}, order = {}) {
  const zelle = settings.zelle || {};
  return `
    <h2>Zelle payment details</h2>
    <p>${escapeHtml(zelle.confirmationIntro || "Send your Zelle payment using the details below.")}</p>
    <ul>
      ${zelle.recipientName ? `<li><strong>Name:</strong> ${escapeHtml(zelle.recipientName)}</li>` : ""}
      ${zelle.recipientEmail ? `<li><strong>Email:</strong> ${escapeHtml(zelle.recipientEmail)}</li>` : ""}
      ${zelle.recipientPhone ? `<li><strong>Phone:</strong> ${escapeHtml(zelle.recipientPhone)}</li>` : ""}
      ${zelle.paymentLink ? `<li><strong>Payment link:</strong> <a href="${escapeHtml(zelle.paymentLink)}">Open Zelle payment link</a></li>` : ""}
      <li><strong>Memo:</strong> ${escapeHtml(order.paymentReference || order.orderNumber || "")}</li>
    </ul>
    ${zelle.qrCodeImageUrl ? `<p><img src="${escapeHtml(zelle.qrCodeImageUrl)}" alt="Zelle QR code" width="220" style="display:block;max-width:220px;border:1px solid #d8e7ea;border-radius:12px;padding:8px"></p>` : ""}
    <p>${escapeHtml(zelle.memoInstructions || "Include your order number in the Zelle memo.")}</p>
  `;
}

function itemsTable(items = []) {
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tbody>
        ${items.map((item) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #d8e7ea">${escapeHtml(item.name || item.id)} x ${escapeHtml(item.quantity || 1)}</td>
            <td align="right" style="padding:8px 0;border-bottom:1px solid #d8e7ea">${money(Math.round(Number(item.price || 0) * 100) * Number(item.quantity || 1))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function confirmationHtml(body = {}) {
  const order = body.order || {};
  return `
    <div style="font-family:Arial,sans-serif;color:#102025;line-height:1.5">
      <h1>Order received</h1>
      <p>Thanks for your Beyond Peps order. Your order number is <strong>${escapeHtml(order.orderNumber || order.orderId || "")}</strong>.</p>
      ${itemsTable(body.items || [])}
      <p><strong>Subtotal:</strong> ${money(order.subtotalCents)}</p>
      <p><strong>Shipping:</strong> ${money(order.shippingCents)}</p>
      <p><strong>Total:</strong> ${money(order.totalCents)}</p>
      ${zelleDetails(body.paymentSettings, order)}
      <p>We will update your order after payment is matched and again when it ships.</p>
    </div>
  `;
}

function shippedHtml(body = {}) {
  const order = body.order || {};
  const trackingUrl = order.trackingUrl ? `<p><a href="${escapeHtml(order.trackingUrl)}">Track your package</a></p>` : "";
  return `
    <div style="font-family:Arial,sans-serif;color:#102025;line-height:1.5">
      <h1>Your order has shipped</h1>
      <p>Order <strong>${escapeHtml(order.orderNumber || order.orderId || "")}</strong> is on the way.</p>
      <p><strong>Carrier:</strong> ${escapeHtml(order.shippingProvider || "Shipping carrier")}</p>
      <p><strong>Service:</strong> ${escapeHtml(order.shippingService || "Selected service")}</p>
      <p><strong>Tracking:</strong> ${escapeHtml(order.trackingNumber || "Tracking will update soon")}</p>
      ${trackingUrl}
    </div>
  `;
}

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "Email is not configured." };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
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
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Email failed to send.");
  }
  return { sent: true, id: payload.id };
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = requestBody(request);
    const to = body.customer?.email || body.to;
    if (!to) throw new Error("Customer email is required.");

    const type = body.type || "order_confirmation";
    const subject = type === "order_shipped"
      ? `Your Beyond Peps order has shipped`
      : `Beyond Peps order ${body.order?.orderNumber || ""} received`;
    const html = type === "order_shipped" ? shippedHtml(body) : confirmationHtml(body);
    const result = await sendEmail({ to, subject, html });
    json(response, 200, result);
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to send email." });
  }
};

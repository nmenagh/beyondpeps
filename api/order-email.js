const { escapeHtml, renderStoredEmail, sendResendEmail } = require("./_email");

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

function paymentMethod(body = {}) {
  const order = body.order || {};
  return String(
    body.paymentMethod ||
    order.paymentMethod ||
    order.payment_method ||
    order.paymentProvider ||
    order.payment_provider ||
    order.metadata?.paymentMethod ||
    ""
  ).trim().toLowerCase();
}

function paymentLabel(method = "") {
  if (method === "zelle") return "Zelle";
  if (method === "card" || method === "stripe") return "Card";
  if (method === "paypal") return "PayPal";
  if (method === "crypto") return "Crypto";
  return method ? method.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Payment";
}

function paymentDetails(body = {}) {
  const order = body.order || {};
  const method = paymentMethod(body);
  if (method === "zelle") return zelleDetails(body.paymentSettings, order);

  const status = String(order.paymentStatus || order.payment_status || order.status || "").replace(/[_-]+/g, " ");
  const label = paymentLabel(method);
  const paid = ["paid", "processing", "completed"].some((token) => status.toLowerCase().includes(token));
  const note = paid
    ? "Payment has been received and your order is moving into processing."
    : "Payment details are recorded with your order. We will update you if any additional action is needed.";

  return `
    <h2>Payment summary</h2>
    <p><strong>Method:</strong> ${escapeHtml(label)}</p>
    ${status ? `<p><strong>Status:</strong> ${escapeHtml(status)}</p>` : ""}
    <p>${escapeHtml(note)}</p>
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

function confirmationFallback() {
  return {
    subject: "Beyond Peps order {{order_number}} received",
    preview_text: "We received your Beyond Peps order.",
    header_image_url: "/assets/bp-logo-mark.png",
    body_html: "<h1>Order received</h1><p>Hi {{customer_name}},</p><p>Thanks for your Beyond Peps order. Your order number is <strong>{{order_number}}</strong>.</p>{{order_items}}<p><strong>Subtotal:</strong> {{subtotal}}</p><p><strong>Shipping:</strong> {{shipping}}</p><p><strong>Total:</strong> {{total}}</p>{{payment_details}}"
  };
}

function shippedFallback() {
  return {
    subject: "Your Beyond Peps order has shipped",
    preview_text: "Your order is on the way.",
    header_image_url: "/assets/bp-logo-mark.png",
    body_html: "<h1>Your order has shipped</h1><p>Hi {{customer_name}},</p><p>Order <strong>{{order_number}}</strong> is on the way.</p><p><strong>Carrier:</strong> {{shipping_provider}}</p><p><strong>Service:</strong> {{shipping_service}}</p><p><strong>Tracking:</strong> {{tracking_number}}</p><p><a href=\"{{tracking_url}}\">Track your package</a></p>"
  };
}

function statusFallback() {
  return {
    subject: "Beyond Peps order {{order_number}} update",
    preview_text: "The status of your order has changed.",
    header_image_url: "/assets/bp-logo-mark.png",
    body_html: "<h1>Order update</h1><p>Hi {{customer_name}},</p><p>The status of order <strong>{{order_number}}</strong> is now <strong>{{order_status}}</strong>.</p>"
  };
}

function emailTokens(body = {}) {
  const order = body.order || {};
  return {
    customer_name: body.customer?.name || "there",
    order_number: order.orderNumber || order.orderId || "",
    order_status: order.status || "",
    order_items: itemsTable(body.items || []),
    subtotal: money(order.subtotalCents),
    shipping: money(order.shippingCents),
    total: money(order.totalCents),
    payment_method: paymentLabel(paymentMethod(body)),
    payment_details: paymentDetails(body),
    shipping_provider: order.shippingProvider || "Shipping carrier",
    shipping_service: order.shippingService || "Selected service",
    tracking_number: order.trackingNumber || "Tracking will update soon",
    tracking_url: order.trackingUrl || ""
  };
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
    const statusTemplateId = body.order?.status ? `order_${String(body.order.status).toLowerCase()}` : "order_status_update";
    const config = type === "order_shipped"
      ? { templateId: "order_shipped", fallback: shippedFallback() }
      : type === "order_status_update"
        ? { templateId: statusTemplateId, fallback: statusFallback() }
        : { templateId: "order_confirmation", fallback: confirmationFallback() };
    const rendered = await renderStoredEmail({
      ...config,
      tokens: emailTokens(body),
      htmlTokenNames: ["order_items", "payment_details"],
      recipientEmail: to,
      recipientName: body.customer?.name || ""
    });
    const orderKey = body.order?.orderId || body.order?.orderNumber || "order";
    const result = await sendResendEmail({
      to,
      ...rendered,
      idempotencyKey: `${type}-${orderKey}-${body.order?.status || "initial"}`
    });
    json(response, 200, result);
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to send email." });
  }
};

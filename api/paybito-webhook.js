const crypto = require("crypto");
const { escapeHtml, renderStoredEmail, sendResendEmail, supabaseRequest } = require("./_email");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function safeEqual(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body;
}

function webhookToken(request) {
  const url = new URL(request.url || "/", "https://beyondpeps.local");
  return url.searchParams.get("token") || request.headers["x-paybito-webhook-token"] || "";
}

function hmacSignature(body, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

function authorized(request, body) {
  const secret = process.env.PAYBITO_WEBHOOK_SECRET;
  if (!secret) return true;
  if (safeEqual(webhookToken(request), secret)) return true;

  const signature = request.headers["x-paybito-signature"] || request.headers["x-signature"] || "";
  if (!signature) return false;
  const expected = hmacSignature(body, secret);
  return safeEqual(String(signature).replace(/^sha256=/i, ""), expected);
}

function nestedValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((node, part) => node?.[part], source);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function orderLookup(body = {}) {
  return {
    orderId: nestedValue(body, ["order_id", "orderId", "metadata.orderId", "data.order_id", "data.orderId", "data.metadata.orderId"]),
    orderNumber: nestedValue(body, ["order_number", "orderNumber", "metadata.orderNumber", "data.order_number", "data.orderNumber", "data.metadata.orderNumber"]),
    paymentReference: nestedValue(body, ["reference", "payment_reference", "paymentReference", "payment_link_id", "metadata.paymentReference", "data.reference", "data.payment_reference", "data.paymentReference", "data.payment_link_id", "data.metadata.paymentReference"]),
    providerReference: nestedValue(body, ["id", "payment_id", "paymentId", "payment_link_id", "txn_id", "transaction_id", "transactionId", "data.id", "data.payment_id", "data.paymentId", "data.payment_link_id", "data.txn_id", "data.transaction_id", "data.transactionId"])
  };
}

function providerStatus(body = {}) {
  const eventName = String(nestedValue(body, ["event_name", "eventName", "data.event_name", "data.eventName"]) || "").trim().toLowerCase();
  if (eventName === "payment.succeeded" || eventName === "checkout.session.completed" || eventName === "charge.succeeded") return "paid";
  if (eventName === "payment.failed" || eventName === "charge.failed") return "failed";
  if (eventName === "payment.refunded") return "refunded";
  if (eventName === "checkout.session.expired") return "cancelled";
  if (eventName === "payment.pending" || eventName === "payment.created" || eventName === "checkout.session.created") return "pending";

  return String(nestedValue(body, [
    "status",
    "payment_status",
    "paymentStatus",
    "event.status",
    "data.status",
    "data.payment_status",
    "data.paymentStatus"
  ]) || "").trim().toLowerCase();
}

function normalizedPaymentStatus(status = "") {
  if (["paid", "completed", "complete", "confirmed", "success", "succeeded", "settled"].includes(status)) return "paid";
  if (["failed", "failure", "declined", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled", "expired", "void"].includes(status)) return "cancelled";
  if (["pending", "processing", "created", "open"].includes(status)) return "awaiting_paybito_payment";
  return status || "unknown";
}

function money(cents = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(cents || 0) / 100);
}

function orderItemsHtml(items = []) {
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tbody>
        ${items.map((item) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #3b535d">${escapeHtml(item.product_name || item.product_title || item.product_slug || "Item")} x ${escapeHtml(item.quantity || 1)}</td>
            <td align="right" style="padding:8px 0;border-bottom:1px solid #3b535d">${money(item.total_cents || 0)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function findOrder(lookup) {
  if (lookup.orderId) {
    const rows = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(lookup.orderId)}&select=*,order_items(*)&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (lookup.paymentReference) {
    const rows = await supabaseRequest(`/rest/v1/orders?payment_reference=eq.${encodeURIComponent(lookup.paymentReference)}&select=*,order_items(*)&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (lookup.providerReference) {
    const attempts = await supabaseRequest(`/rest/v1/payment_attempts?provider=eq.paybito&provider_reference=eq.${encodeURIComponent(lookup.providerReference)}&select=order_id&limit=1`);
    const orderId = attempts?.[0]?.order_id;
    if (orderId) {
      const rows = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)&limit=1`);
      if (rows?.[0]) return rows[0];
    }
  }
  return null;
}

async function savePaymentAttempt(order, lookup, paymentStatus, body) {
  await supabaseRequest("/rest/v1/payment_attempts", {
    method: "POST",
    body: [{
      order_id: order.id,
      provider: "paybito",
      provider_reference: lookup.providerReference || lookup.paymentReference || order.payment_reference,
      status: paymentStatus,
      amount_cents: order.total_cents || 0,
      currency: order.currency || "USD",
      raw_response: body
    }]
  });
}

async function updateOrder(order, lookup, paymentStatus, body) {
  const metadata = {
    ...(order.metadata || {}),
    paymentStatus,
    paybito: {
      ...(order.metadata?.paybito || {}),
      providerReference: lookup.providerReference || order.metadata?.paybito?.providerReference || "",
      lastWebhookAt: new Date().toISOString(),
      lastStatus: paymentStatus
    }
  };
  if (paymentStatus === "paid") metadata.paybito.paidAt = new Date().toISOString();

  const patch = {
    metadata
  };
  if (paymentStatus === "paid") patch.status = "paid";

  const updated = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: patch
  });
  await savePaymentAttempt(order, lookup, paymentStatus, body);
  return updated?.[0] || order;
}

async function sendPaymentReceivedEmail(order) {
  const email = order.customer_email || order.email || order.metadata?.customer?.email || "";
  if (!email) return;
  const rendered = await renderStoredEmail({
    templateId: "order_paid",
    fallback: {
      subject: "Beyond Peps order {{order_number}} payment received",
      preview_text: "Your payment has been matched to your order.",
      header_image_url: "/assets/bp-logo-mark.png",
      body_html: "<h1>Payment received</h1><p>Hi {{customer_name}},</p><p>Your payment for order <strong>{{order_number}}</strong> has been received.</p>{{order_items}}<p><strong>Total:</strong> {{total}}</p><p>We will update you again when your order ships.</p>"
    },
    tokens: {
      customer_name: order.metadata?.customer?.name || "there",
      order_number: String(order.id || "").slice(0, 8),
      order_status: "paid",
      order_items: orderItemsHtml(order.order_items || []),
      subtotal: money(order.subtotal_cents || 0),
      shipping: money(order.shipping_cents || 0),
      total: money(order.total_cents || 0),
      payment_method: "PayBito",
      payment_details: "<h2>Payment summary</h2><p>Payment has been received through PayBito and your order is moving into processing.</p>"
    },
    htmlTokenNames: ["order_items", "payment_details"],
    recipientEmail: email,
    recipientName: order.metadata?.customer?.name || ""
  });
  await sendResendEmail({
    to: email,
    ...rendered,
    idempotencyKey: `paybito-paid-${order.id}`
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
    const body = requestBody(request);
    if (!authorized(request, body)) {
      json(response, 401, { error: "Unauthorized." });
      return;
    }

    const lookup = orderLookup(body);
    const paymentStatus = normalizedPaymentStatus(providerStatus(body));
    const order = await findOrder(lookup);
    if (!order) {
      json(response, 202, { ok: true, matched: false });
      return;
    }

    const updated = await updateOrder(order, lookup, paymentStatus, body);
    if (paymentStatus === "paid" && order.status !== "paid") {
      await sendPaymentReceivedEmail({ ...order, ...updated }).catch((error) => console.warn("PayBito payment email did not send.", error.message));
    }
    json(response, 200, { ok: true, orderId: updated.id, paymentStatus });
  } catch (error) {
    console.error("PayBito webhook error", error);
    json(response, 500, { error: "Unable to process PayBito webhook." });
  }
};

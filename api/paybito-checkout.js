const { supabaseRequest, siteUrl } = require("./_email");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function requestBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body;
}

async function responseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function required(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
  return String(value).trim();
}

function absoluteUrl(path = "") {
  const value = String(path || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl()}${value.startsWith("/") ? "" : "/"}${value}`;
}

function nestedValue(payload = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((node, part) => node?.[part], payload);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function maybeBase64Json(value = {}) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function checkoutUrlFromPayload(payload = {}) {
  const directUrl = nestedValue(payload, [
    "checkout_url",
    "checkoutUrl",
    "payment_url",
    "paymentUrl",
    "redirect_url",
    "redirectUrl",
    "url",
    "data.checkout_url",
    "data.checkoutUrl",
    "data.payment_url",
    "data.paymentUrl",
    "data.redirect_url",
    "data.redirectUrl",
    "data.url"
  ]);
  if (directUrl) return directUrl;

  const checkoutBase = env("PAYBITO_CHECKOUT_BASE_URL").replace(/\/$/, "");
  if (!checkoutBase) return "";

  const pcn = nestedValue(payload, ["pcn", "PCN", "data.pcn", "data.PCN"]);
  if (pcn) return `${checkoutBase}/${encodeURIComponent(pcn)}`;

  const paymentId = nestedValue(payload, ["paymentId", "payment_id", "id", "data.paymentId", "data.payment_id", "data.id"]);
  const brokerId = nestedValue(payload, ["brokerId", "broker_id", "data.brokerId", "data.broker_id"]) || env("PAYBITO_BROKER_ID");
  if (paymentId && brokerId) {
    return `${checkoutBase}?data=${encodeURIComponent(maybeBase64Json({ paymentId, brokerId }))}`;
  }

  return "";
}

function providerReferenceFromPayload(payload = {}, fallback = "") {
  return nestedValue(payload, [
    "id",
    "payment_id",
    "paymentId",
    "transaction_id",
    "transactionId",
    "pcn",
    "PCN",
    "data.id",
    "data.payment_id",
    "data.paymentId",
    "data.transaction_id",
    "data.transactionId",
    "data.pcn",
    "data.PCN"
  ]) || fallback;
}

function paybitoPayload({ order = {}, customer = {}, items = [], shippingRate = {} }) {
  const orderNumber = order.orderNumber || order.orderId;
  const successUrl = absoluteUrl(`/cart.html?payment=paybito&status=success&order=${encodeURIComponent(orderNumber || "")}`);
  const cancelUrl = absoluteUrl(`/cart.html?payment=paybito&status=cancelled&order=${encodeURIComponent(orderNumber || "")}`);
  const webhookToken = env("PAYBITO_WEBHOOK_SECRET");
  const webhookUrl = webhookToken
    ? absoluteUrl(`/api/paybito-webhook?token=${encodeURIComponent(webhookToken)}`)
    : absoluteUrl("/api/paybito-webhook");

  return {
    amount: Number(order.totalCents || 0) / 100,
    amount_cents: Number(order.totalCents || 0),
    currency: order.currency || "USD",
    order_id: order.orderId,
    order_number: orderNumber,
    merchant_id: env("PAYBITO_MERCHANT_ID") || undefined,
    broker_id: env("PAYBITO_BROKER_ID") || undefined,
    reference: order.paymentReference,
    description: `Beyond Peps order ${orderNumber}`,
    success_url: successUrl,
    cancel_url: cancelUrl,
    webhook_url: webhookUrl,
    customer: {
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || ""
    },
    shipping: shippingRate,
    items: items.map((item) => ({
      id: item.id,
      name: item.name || item.id,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.price || 0),
      unit_price_cents: Math.round(Number(item.price || 0) * 100)
    })),
    metadata: {
      site: "beyondpeps.com",
      orderId: order.orderId,
      orderNumber,
      paymentReference: order.paymentReference
    }
  };
}

async function createPaybitoPayment(body) {
  const endpoint = required(env("PAYBITO_CREATE_PAYMENT_URL"), "PAYBITO_CREATE_PAYMENT_URL");
  const apiKey = required(env("PAYBITO_API_KEY"), "PAYBITO_API_KEY");
  const apiSecret = env("PAYBITO_API_SECRET");
  const merchantId = env("PAYBITO_MERCHANT_ID");
  const brokerId = env("PAYBITO_BROKER_ID");
  const payload = paybitoPayload(body);
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    apiKey
  };
  if (env("PAYBITO_USE_BEARER_AUTH") === "true") headers.Authorization = `Bearer ${apiKey}`;
  if (apiSecret) headers["X-API-Secret"] = apiSecret;
  if (merchantId) headers["X-Merchant-ID"] = merchantId;
  if (brokerId) headers["X-Broker-ID"] = brokerId;

  const paybitoResponse = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const responsePayload = await responseJson(paybitoResponse);
  if (!paybitoResponse.ok) {
    const detail = responsePayload.message || responsePayload.error || responsePayload.detail || JSON.stringify(responsePayload);
    throw new Error(`PayBito rejected checkout (${paybitoResponse.status}). ${detail || "Check API key, endpoint, domain/IP whitelist, and live/test environment."}`);
  }

  const checkoutUrl = checkoutUrlFromPayload(responsePayload);
  if (!checkoutUrl) {
    throw new Error("PayBito responded, but no checkout URL could be found. Add PAYBITO_CHECKOUT_BASE_URL if PayBito returns paymentId/brokerId or PCN instead of a full URL.");
  }

  return {
    checkoutUrl,
    providerReference: providerReferenceFromPayload(responsePayload, body.order?.paymentReference),
    rawResponse: responsePayload
  };
}

async function savePaybitoSession(order, session) {
  const metadata = {
    ...(order.metadata || {}),
    paymentStatus: "awaiting_paybito_payment",
    paybito: {
      checkoutUrl: session.checkoutUrl,
      providerReference: session.providerReference,
      createdAt: new Date().toISOString()
    }
  };

  await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.orderId)}`, {
    method: "PATCH",
    body: {
      metadata
    }
  });

  await supabaseRequest("/rest/v1/payment_attempts", {
    method: "POST",
    body: [{
      order_id: order.orderId,
      provider: "paybito",
      provider_reference: session.providerReference || order.paymentReference,
      status: "checkout_created",
      amount_cents: order.totalCents,
      currency: order.currency || "USD",
      raw_response: session.rawResponse
    }]
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
    const order = body.order || {};
    if (!order.orderId) throw new Error("Order id is required.");
    if (!order.paymentReference) throw new Error("Order payment reference is required.");

    const session = await createPaybitoPayment(body);
    await savePaybitoSession(order, session);
    json(response, 200, {
      ok: true,
      checkoutUrl: session.checkoutUrl,
      providerReference: session.providerReference
    });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to start PayBito checkout." });
  }
};

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

function checkoutUrlFromPayload(payload = {}) {
  return payload.checkout_url ||
    payload.checkoutUrl ||
    payload.payment_url ||
    payload.paymentUrl ||
    payload.redirect_url ||
    payload.redirectUrl ||
    payload.url ||
    payload.data?.checkout_url ||
    payload.data?.checkoutUrl ||
    payload.data?.payment_url ||
    payload.data?.paymentUrl ||
    payload.data?.redirect_url ||
    payload.data?.redirectUrl ||
    payload.data?.url ||
    "";
}

function providerReferenceFromPayload(payload = {}, fallback = "") {
  return payload.id ||
    payload.payment_id ||
    payload.paymentId ||
    payload.transaction_id ||
    payload.transactionId ||
    payload.data?.id ||
    payload.data?.payment_id ||
    payload.data?.paymentId ||
    payload.data?.transaction_id ||
    payload.data?.transactionId ||
    fallback;
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
  const payload = paybitoPayload(body);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-API-Key": apiKey
  };
  if (apiSecret) headers["X-API-Secret"] = apiSecret;

  const paybitoResponse = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const responsePayload = await responseJson(paybitoResponse);
  if (!paybitoResponse.ok) {
    throw new Error(responsePayload.message || responsePayload.error || "PayBito could not create a checkout session.");
  }

  const checkoutUrl = checkoutUrlFromPayload(responsePayload);
  if (!checkoutUrl) {
    throw new Error("PayBito did not return a checkout URL. Check PAYBITO_CREATE_PAYMENT_URL and merchant API response mapping.");
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

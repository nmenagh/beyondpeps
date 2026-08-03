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

function paybitoBaseUrl() {
  return env("PAYBITO_BASE_URL", "https://trade.paybito.com").replace(/\/$/, "");
}

function paybitoOrigin() {
  const configured = env("PAYBITO_ORIGIN", siteUrl()).replace(/\/$/, "");
  return configured || "https://beyondpeps.com";
}

function nestedValue(payload = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((node, part) => node?.[part], payload);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function maybeJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizedKey(key = "") {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findValueByKeys(source, allowedKeys = new Set(), depth = 0) {
  if (source === undefined || source === null || depth > 5) return "";
  const parsed = maybeJsonString(source);
  if (parsed) return findValueByKeys(parsed, allowedKeys, depth + 1);
  if (typeof source === "string") return "";
  if (Array.isArray(source)) {
    for (const item of source) {
      const value = findValueByKeys(item, allowedKeys, depth + 1);
      if (value) return value;
    }
    return "";
  }
  if (typeof source !== "object") return "";
  for (const [key, value] of Object.entries(source)) {
    if (allowedKeys.has(normalizedKey(key)) && value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  for (const value of Object.values(source)) {
    const found = findValueByKeys(value, allowedKeys, depth + 1);
    if (found) return found;
  }
  return "";
}

function redacted(value = "") {
  return String(value)
    .replace(/pk_[a-z0-9_-]+/gi, "pk_[redacted]")
    .replace(/csk_[a-z0-9_-]+/gi, "csk_[redacted]")
    .replace(/[a-f0-9]{48,}/gi, "[redacted]");
}

function responseShape(payload = {}) {
  const parsed = maybeJsonString(payload) || payload;
  if (parsed === undefined || parsed === null) return "empty response";
  if (typeof parsed !== "object") return redacted(String(parsed)).slice(0, 180);
  if (Array.isArray(parsed)) return `array(${parsed.length})`;
  const keys = Object.keys(parsed).slice(0, 12).join(", ") || "no top-level keys";
  const message = redacted(nestedValue(parsed, ["message", "error_msg", "errorMessage", "detail"]) || "").slice(0, 180);
  return message ? `keys: ${keys}; message: ${message}` : `keys: ${keys}`;
}

function encodedCheckoutPayload(value = {}) {
  const encoding = String(env("PAYBITO_CHECKOUT_DATA_ENCODING", "base64")).trim().toLowerCase();
  return Buffer.from(JSON.stringify(value)).toString(encoding === "base64url" ? "base64url" : "base64");
}

function checkoutBaseUrl() {
  return env("PAYBITO_CHECKOUT_BASE_URL", "https://portal.paybito.com/payments/merchant/checkout/").replace(/\/$/, "");
}

function checkoutUrlForPcn({ paymentId, merchantId, brokerId }) {
  const data = encodedCheckoutPayload({
    paymentId,
    merchantId: String(merchantId),
    brokerId
  });
  return `${checkoutBaseUrl()}/?data=${encodeURIComponent(data)}`;
}

function checkoutUrlFromPayload(payload = {}, merchantId = "") {
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

  const pcn = nestedValue(payload, ["pcn", "PCN", "data.pcn", "data.PCN"]);
  const paymentId = pcn || nestedValue(payload, ["paymentId", "payment_id", "id", "data.paymentId", "data.payment_id", "data.id"]);
  const brokerId = nestedValue(payload, ["brokerId", "broker_id", "data.brokerId", "data.broker_id"]) || env("PAYBITO_BROKER_ID");

  if (paymentId && brokerId && merchantId) return checkoutUrlForPcn({ paymentId, merchantId, brokerId });

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

function paybitoErrorDetail(payload = {}) {
  const values = [
    payload.message,
    payload.error_msg,
    payload.errorMessage,
    payload.detail,
    payload.error
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return values.length ? values.map(String).join(" ") : JSON.stringify(payload);
}

function ensurePaybitoSuccess(payload = {}, step = "request") {
  const error = nestedValue(payload, ["error", "data.error"]);
  const status = nestedValue(payload, ["status", "data.status"]);
  const success = nestedValue(payload, ["success", "data.success"]);
  const hasError = error !== "" && !["0", "false", "null"].includes(String(error).trim().toLowerCase());
  const explicitlyFailed = status !== "" && ["false", "failed", "failure", "error"].includes(String(status).trim().toLowerCase());
  const successFalse = success !== "" && ["false", "0"].includes(String(success).trim().toLowerCase());
  if (hasError || explicitlyFailed || successFalse) {
    throw new Error(`PayBito ${step} failed. ${paybitoErrorDetail(payload)}`);
  }
}

async function paybitoFetch(pathOrUrl, { method = "GET", headers = {}, body, step = "request" } = {}) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${paybitoBaseUrl()}${pathOrUrl}`;
  const paybitoResponse = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const responsePayload = await responseJson(paybitoResponse);
  if (!paybitoResponse.ok) {
    const detail = paybitoErrorDetail(responsePayload);
    throw new Error(`PayBito ${step} rejected checkout (${paybitoResponse.status}). ${detail || "Check API key, secret key, origin/domain whitelist, and live/test environment."}`);
  }
  ensurePaybitoSuccess(responsePayload, step);
  return responsePayload;
}

async function createClientSecret(apiKey) {
  const payload = await paybitoFetch("/TestPayments-Apikey-V2/api/v1/validate", {
    step: "client-secret validation",
    headers: {
      publicKey: apiKey,
      "X-MBX-APIKEY": apiKey,
      ...(env("PAYBITO_API_SECRET") ? { "X-MBX-SECRETKEY": env("PAYBITO_API_SECRET") } : {}),
      Origin: paybitoOrigin()
    }
  });
  const secretHash = nestedValue(payload, [
    "secretHash",
    "secret_hash",
    "data.secretHash",
    "data.secret_hash"
  ]) || findValueByKeys(payload, new Set(["secrethash"]));
  const clientSecret = nestedValue(payload, [
    "clientSecret",
    "client_secret",
    "clientSecretKey",
    "client_secret_key",
    "csk",
    "data.clientSecret",
    "data.client_secret",
    "data.clientSecretKey",
    "data.client_secret_key",
    "data.csk"
  ]) || findValueByKeys(payload, new Set(["clientsecret", "clientsecretkey", "csk"]));
  if (!secretHash && !clientSecret) {
    throw new Error(`PayBito validation succeeded, but no client secret was returned. Validation response ${responseShape(payload)}.`);
  }
  return {
    secretHash,
    clientSecret,
    rawResponse: payload
  };
}

function cartApiHeaders(apiKey, clientSecret) {
  const apiSecret = env("PAYBITO_API_SECRET");
  return {
    "Content-Type": "application/json",
    "X-MBX-PUBLIC-KEY": apiKey,
    "X-MBX-APIKEY": apiKey,
    ...(apiSecret ? { "X-MBX-SECRETKEY": apiSecret } : {}),
    "CLIENT-SECRET-KEY": clientSecret.clientSecret || clientSecret.secretHash,
    Origin: paybitoOrigin()
  };
}

function safeProductId(value = "") {
  return String(value || "item").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "item";
}

function paybitoProducts({ items = [], shippingRate = {}, order = {} }) {
  const products = items.map((item) => ({
    productId: safeProductId(item.id),
    productType: "CART",
    quantity: Math.max(1, Number(item.quantity || 1)),
    name: item.name || item.id || "Beyond Peps item",
    description: item.summary || item.description || item.name || item.id || "Beyond Peps item",
    imageUrl: item.imageUrl || "",
    attributes: {},
    metadata: {
      beyondPepsProductId: item.id,
      orderId: order.orderId,
      paymentReference: order.paymentReference
    },
    prices: [{
      priceId: 0,
      isDefault: true,
      priceType: "one-time",
      intervalType: "",
      intervalCount: 0,
      trialDays: 0,
      retryAttempts: 0,
      totalCycles: 0,
      retryInterval: "",
      variant: {},
      sku: safeProductId(item.id),
      inventory: {
        track: false,
        quantity: Math.max(1, Number(item.quantity || 1))
      },
      currencies: [{
        currency: order.currency || "USD",
        amount: Number(item.price || 0),
        isDefault: true
      }]
    }]
  }));

  const shippingAmount = Number(shippingRate?.amount || 0);
  if (shippingAmount > 0) {
    products.push({
      productId: `shipping-${safeProductId(order.orderNumber || order.orderId)}`,
      productType: "CART",
      quantity: 1,
      name: "Shipping",
      description: [shippingRate.provider, shippingRate.servicelevel].filter(Boolean).join(" - ") || "Shipping",
      imageUrl: "",
      attributes: {},
      metadata: {
        orderId: order.orderId,
        paymentReference: order.paymentReference,
        type: "shipping"
      },
      prices: [{
        priceId: 0,
        isDefault: true,
        priceType: "one-time",
        intervalType: "",
        intervalCount: 0,
        trialDays: 0,
        retryAttempts: 0,
        totalCycles: 0,
        retryInterval: "",
        variant: {},
        sku: `shipping-${safeProductId(order.orderNumber || order.orderId)}`,
        inventory: {
          track: false,
          quantity: 1
        },
        currencies: [{
          currency: order.currency || "USD",
          amount: shippingAmount,
          isDefault: true
        }]
      }]
    });
  }

  return products;
}

async function registerCart(body, apiKey, clientSecret) {
  const merchantId = Number(required(env("PAYBITO_MERCHANT_ID"), "PAYBITO_MERCHANT_ID"));
  const catalogId = Number(env("PAYBITO_CATALOG_ID", "0")) || 0;
  const payload = await paybitoFetch("/TestPayments-Apikey-V2/shopping/products/register", {
    method: "POST",
    step: "cart registration",
    headers: cartApiHeaders(apiKey, clientSecret),
    body: {
      merchantId,
      catalogId,
      cartToken: "",
      products: paybitoProducts(body)
    }
  });
  const cartToken = nestedValue(payload, ["data.cartToken", "cartToken"]);
  const returnedCatalogId = Number(nestedValue(payload, ["data.catalogId", "catalogId"])) || catalogId;
  if (!cartToken) throw new Error("PayBito cart registration succeeded, but no cart token was returned.");
  return {
    cartToken,
    catalogId: returnedCatalogId,
    rawResponse: payload
  };
}

async function initiateCheckout(body, apiKey, clientSecret, cart) {
  const merchantId = Number(required(env("PAYBITO_MERCHANT_ID"), "PAYBITO_MERCHANT_ID"));
  const order = body.order || {};
  const payload = await paybitoFetch("/TestPayments-Apikey-V2/shopping/payment/create", {
    method: "POST",
    step: "checkout creation",
    headers: cartApiHeaders(apiKey, clientSecret),
    body: {
      merchantId,
      cartToken: cart.cartToken,
      paymentName: `Beyond Peps order ${order.orderNumber || order.orderId}`,
      paymentType: "CHECKOUT",
      catalogId: cart.catalogId,
      shippingProfileId: Number(env("PAYBITO_SHIPPING_PROFILE_ID", "0")) || 0,
      buyerProfileId: Number(env("PAYBITO_BUYER_PROFILE_ID", "0")) || 0,
      billingId: Number(env("PAYBITO_BILLING_ID", "0")) || 0,
      discountProfileId: Number(env("PAYBITO_DISCOUNT_PROFILE_ID", "0")) || 0,
      isProcessingFeeApplied: Number(env("PAYBITO_PROCESSING_FEE_APPLIED", "0")) || 0,
      redirectId: Number(env("PAYBITO_REDIRECT_ID", "0")) || 0
    }
  });
  return payload;
}

async function createCartPayment(body) {
  const apiKey = required(env("PAYBITO_API_KEY"), "PAYBITO_API_KEY");
  required(env("PAYBITO_API_SECRET"), "PAYBITO_API_SECRET");
  required(env("PAYBITO_MERCHANT_ID"), "PAYBITO_MERCHANT_ID");
  const clientSecret = await createClientSecret(apiKey);
  const cart = await registerCart(body, apiKey, clientSecret);
  const responsePayload = await initiateCheckout(body, apiKey, clientSecret, cart);

  const checkoutUrl = checkoutUrlFromPayload(responsePayload, env("PAYBITO_MERCHANT_ID"));
  if (!checkoutUrl) {
    throw new Error("PayBito responded, but no checkout URL could be built from the checkout response.");
  }

  return {
    checkoutUrl,
    providerReference: providerReferenceFromPayload(responsePayload, body.order?.paymentReference),
    rawResponse: {
      validation: clientSecret.rawResponse,
      cart: cart.rawResponse,
      checkout: responsePayload
    }
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

    const session = await createCartPayment(body);
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

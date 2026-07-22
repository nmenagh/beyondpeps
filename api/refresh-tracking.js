const { supabaseRequest } = require("./_email");

const SHIPPO_API_BASE = "https://api.goshippo.com";

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function requestBody(request) {
  if (!request.body) return {};
  return typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body;
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

function isoOrNull(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function carrierToken(value = "") {
  return String(value || "").trim().toLowerCase();
}

function commaValues(value = "") {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
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

async function shippoGet(path, token) {
  const response = await fetch(`${SHIPPO_API_BASE}${path}`, {
    headers: { Authorization: `ShippoToken ${token}` }
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(payload.message || payload.detail || `Shippo request failed (${response.status}).`);
  return payload;
}

function candidatesFromOrder(order = {}) {
  const stored = Array.isArray(order.order_shipments) ? order.order_shipments : [];
  const labels = Array.isArray(order.shipping_method?.labels) ? order.shipping_method.labels : [];
  const candidates = stored.map((shipment) => ({
    id: shipment.id,
    packageNumber: shipment.package_number,
    transactionId: shipment.shippo_transaction_id,
    carrier: shipment.carrier,
    trackingNumber: shipment.tracking_number,
    trackingUrl: shipment.tracking_url,
    deliveredAt: shipment.delivered_at
  }));

  labels.forEach((label, index) => {
    const trackingNumber = label.trackingNumber || label.tracking_number;
    if (!trackingNumber || candidates.some((item) => item.trackingNumber === trackingNumber)) return;
    candidates.push({
      packageNumber: label.packageNumber || index + 1,
      transactionId: label.transactionId || label.transaction_id,
      carrier: label.trackingCarrier || label.tracking_carrier || order.tracking_carrier,
      trackingNumber,
      trackingUrl: label.trackingUrl || label.tracking_url
    });
  });

  const trackingNumbers = commaValues(order.tracking_number);
  const transactionIds = commaValues(order.shippo_transaction_id);
  trackingNumbers.forEach((trackingNumber, index) => {
    if (candidates.some((item) => item.trackingNumber === trackingNumber)) return;
    candidates.push({
      packageNumber: index + 1,
      transactionId: transactionIds[index],
      carrier: order.tracking_carrier || order.shipping_provider || order.shipping_method?.provider,
      trackingNumber,
      trackingUrl: index === 0 ? order.tracking_url : ""
    });
  });

  return candidates;
}

async function completeCandidate(candidate, token) {
  if (candidate.carrier && candidate.trackingNumber) return candidate;
  if (!candidate.transactionId) return candidate;
  const transaction = await shippoGet(`/transactions/${encodeURIComponent(candidate.transactionId)}`, token);
  return {
    ...candidate,
    carrier: candidate.carrier || transaction.tracking_carrier,
    trackingNumber: candidate.trackingNumber || transaction.tracking_number,
    trackingUrl: candidate.trackingUrl || transaction.tracking_url_provider
  };
}

async function saveTracking(order, candidate, track) {
  const current = track.tracking_status || {};
  const substatus = current.substatus || {};
  const status = String(current.status || "UNKNOWN").toUpperCase();
  const statusDate = isoOrNull(current.status_date);
  const row = {
    order_id: order.id,
    package_number: candidate.packageNumber || 1,
    shippo_transaction_id: candidate.transactionId || track.transaction || null,
    carrier: carrierToken(track.carrier || candidate.carrier),
    service_level: track.servicelevel?.name || order.shipping_service || order.shipping_method?.servicelevel || null,
    tracking_number: track.tracking_number || candidate.trackingNumber,
    tracking_url: track.tracking_url_provider || candidate.trackingUrl || null,
    status,
    status_details: current.status_details || null,
    substatus_code: substatus.code || null,
    substatus_text: substatus.text || null,
    action_required: Boolean(substatus.action_required),
    eta: isoOrNull(track.eta),
    original_eta: isoOrNull(track.original_eta),
    status_date: statusDate,
    delivered_at: status === "DELIVERED" ? (statusDate || candidate.deliveredAt || new Date().toISOString()) : (candidate.deliveredAt || null),
    location: current.location || {},
    tracking_history: Array.isArray(track.tracking_history) ? track.tracking_history : [],
    last_shippo_update_at: isoOrNull(current.object_updated || track.object_updated) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (candidate.id) {
    return supabaseRequest(`/rest/v1/order_shipments?id=eq.${encodeURIComponent(candidate.id)}`, {
      method: "PATCH",
      body: row
    });
  }
  return supabaseRequest("/rest/v1/order_shipments?on_conflict=carrier,tracking_number", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [row]
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
    const shippoToken = process.env.SHIPPO_API_TOKEN;
    if (!shippoToken) throw new Error("SHIPPO_API_TOKEN is required.");
    await requireAdmin(request.headers.authorization || "");

    const { orderId } = requestBody(request);
    if (!orderId) throw new Error("Order id is required.");
    const orders = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_shipments(*)&limit=1`);
    const order = orders?.[0];
    if (!order) throw new Error("Order was not found.");

    const candidates = candidatesFromOrder(order);
    if (!candidates.length) throw new Error("This order does not have a tracking number yet.");

    const results = [];
    for (const original of candidates) {
      try {
        const candidate = await completeCandidate(original, shippoToken);
        if (!candidate.carrier || !candidate.trackingNumber) throw new Error("Carrier or tracking number is missing.");
        const track = await shippoGet(`/tracks/${encodeURIComponent(carrierToken(candidate.carrier))}/${encodeURIComponent(candidate.trackingNumber)}`, shippoToken);
        await saveTracking(order, candidate, track);
        results.push({ trackingNumber: candidate.trackingNumber, status: track.tracking_status?.status || "UNKNOWN", ok: true });
      } catch (error) {
        results.push({ trackingNumber: original.trackingNumber || "Unknown", error: error.message, ok: false });
      }
    }

    const refreshed = results.filter((item) => item.ok).length;
    if (!refreshed) throw new Error(results[0]?.error || "Shippo could not refresh this order.");
    json(response, 200, { ok: true, refreshed, results });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to refresh tracking." });
  }
};

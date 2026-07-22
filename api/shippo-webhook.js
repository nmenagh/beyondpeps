const crypto = require("crypto");
const { supabaseRequest } = require("./_email");

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

function webhookToken(request) {
  const url = new URL(request.url || "/", "https://beyondpeps.local");
  return url.searchParams.get("token") || request.headers["x-shippo-webhook-token"] || "";
}

function trackingObject(body = {}) {
  return body.data || body.track || body;
}

function isoOrNull(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizedCarrier(value = "") {
  return String(value || "").trim().toLowerCase();
}

async function findShipment(track) {
  if (track.transaction) {
    const rows = await supabaseRequest(`/rest/v1/order_shipments?shippo_transaction_id=eq.${encodeURIComponent(track.transaction)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }

  const carrier = normalizedCarrier(track.carrier);
  const trackingNumber = String(track.tracking_number || "").trim();
  if (!carrier || !trackingNumber) return null;
  const rows = await supabaseRequest(`/rest/v1/order_shipments?carrier=eq.${encodeURIComponent(carrier)}&tracking_number=eq.${encodeURIComponent(trackingNumber)}&select=*&limit=1`);
  return rows?.[0] || null;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
    const secret = process.env.SHIPPO_WEBHOOK_SECRET;
    if (!secret) throw new Error("SHIPPO_WEBHOOK_SECRET is required.");
    if (!safeEqual(webhookToken(request), secret)) {
      json(response, 401, { error: "Unauthorized." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
    const eventType = body.event_type || body.event || "track_updated";
    if (eventType !== "track_updated") {
      json(response, 202, { ok: true, ignored: true });
      return;
    }

    const track = trackingObject(body);
    const shipment = await findShipment(track);
    if (!shipment) {
      // A successful response prevents retries for tracking numbers that do not
      // belong to an order in this environment (for example Shippo test events).
      json(response, 202, { ok: true, matched: false });
      return;
    }

    const current = track.tracking_status || {};
    const substatus = current.substatus || {};
    const status = String(current.status || "UNKNOWN").toUpperCase();
    const statusDate = isoOrNull(current.status_date);
    const updated = await supabaseRequest(`/rest/v1/order_shipments?id=eq.${encodeURIComponent(shipment.id)}`, {
      method: "PATCH",
      body: {
        carrier: normalizedCarrier(track.carrier) || shipment.carrier,
        service_level: track.servicelevel?.name || shipment.service_level,
        tracking_url: track.tracking_url_provider || track.tracking_url || shipment.tracking_url,
        status,
        status_details: current.status_details || null,
        substatus_code: substatus.code || null,
        substatus_text: substatus.text || null,
        action_required: Boolean(substatus.action_required),
        eta: isoOrNull(track.eta),
        original_eta: isoOrNull(track.original_eta),
        status_date: statusDate,
        delivered_at: status === "DELIVERED" ? (statusDate || new Date().toISOString()) : shipment.delivered_at,
        location: current.location || {},
        tracking_history: Array.isArray(track.tracking_history) ? track.tracking_history : [],
        last_shippo_update_at: isoOrNull(current.object_updated || track.object_updated) || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    json(response, 200, { ok: true, shipmentId: shipment.id, status: updated?.[0]?.status || status });
  } catch (error) {
    console.error("Shippo webhook error", error);
    json(response, 500, { error: "Unable to process tracking update." });
  }
};

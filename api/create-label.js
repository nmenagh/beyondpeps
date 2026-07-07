const SHIPPO_API_BASE = "https://api.goshippo.com";
const DEFAULT_SUPABASE_URL = "https://zcxwrgnlqfgdkeqysctg.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjeHdyZ25scWZnZGtlcXlzY3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDk2ODQsImV4cCI6MjA5NzkyNTY4NH0.3mZJz2bY51GtgQKe8O6APbws4e5rzZGtGCS6tO4Qd7w";

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function required(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
  return String(value).trim();
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

function supabaseConfig() {
  return {
    url: env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL", DEFAULT_SUPABASE_URL)).replace(/\/$/, ""),
    anonKey: env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY))
  };
}

async function supabaseRequest(path, { method = "GET", token, body, prefer = "return=representation" } = {}) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token || anonKey}`,
      "Content-Type": "application/json",
      Prefer: prefer
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new Error(payload.message || payload.error || JSON.stringify(payload) || `Supabase request failed: ${response.status}`);
  }
  return payload;
}

async function requireAdmin(authHeader = "") {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Admin session token is required.");
  const result = await supabaseRequest("/rest/v1/rpc/beyond_peps_current_user_is_admin", {
    method: "POST",
    token,
    body: {}
  });
  if (result !== true) throw new Error("Admin access is required.");
  return token;
}

function rateIdFromOrder(order = {}) {
  return order.shippo_rate_id || order.shipping_method?.id || order.shipping_method?.object_id || "";
}

function trackingUrl(transaction = {}) {
  return transaction.tracking_url_provider || transaction.tracking_url || transaction.object_tracking_url || "";
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const adminToken = await requireAdmin(request.headers.authorization || "");
    const token = required(env("SHIPPO_API_TOKEN"), "SHIPPO_API_TOKEN");
    const { orderId } = requestBody(request);
    if (!orderId) throw new Error("Order id is required.");

    const orders = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)&limit=1`, {
      token: adminToken
    });
    const order = orders?.[0];
    if (!order) throw new Error("Order was not found.");
    if (order.shippo_transaction_id && order.label_url) {
      json(response, 200, { order, alreadyCreated: true });
      return;
    }

    const rateId = rateIdFromOrder(order);
    if (!rateId) {
      throw new Error("This order does not have a stored Shippo rate id. Recalculate shipping before creating a label.");
    }

    const shippoResponse = await fetch(`${SHIPPO_API_BASE}/transactions/`, {
      method: "POST",
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rate: rateId,
        label_file_type: "PDF",
        async: false
      })
    });

    const transaction = await responseJson(shippoResponse);
    if (!shippoResponse.ok || transaction.status === "ERROR") {
      throw new Error(transaction.messages?.[0]?.text || transaction.message || "Shippo could not create the label.");
    }

    const selectedCarrier = order.selected_carrier || [order.shipping_method?.provider, order.shipping_method?.servicelevel].filter(Boolean).join(" - ");
    const updated = await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "fulfilled",
        shippo_transaction_id: transaction.object_id || null,
        label_url: transaction.label_url || null,
        tracking_number: transaction.tracking_number || null,
        tracking_url: trackingUrl(transaction) || null,
        tracking_carrier: transaction.tracking_carrier || order.tracking_carrier || null,
        shipping_provider: order.shipping_provider || order.shipping_method?.provider || selectedCarrier || null,
        shipping_service: order.shipping_service || order.shipping_method?.servicelevel || null,
        shipped_at: new Date().toISOString()
      }
    });

    json(response, 200, {
      order: updated?.[0] || order,
      transaction,
      labelUrl: transaction.label_url || "",
      trackingNumber: transaction.tracking_number || "",
      trackingUrl: trackingUrl(transaction)
    });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to create label." });
  }
};

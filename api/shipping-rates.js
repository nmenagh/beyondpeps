const SHIPPO_API_BASE = "https://api.goshippo.com";

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

function originAddress() {
  return {
    name: env("SHIP_FROM_NAME", "Beyond Peps Fulfillment"),
    company: env("SHIP_FROM_COMPANY", "Beyond Peps"),
    street1: required(env("SHIP_FROM_STREET1"), "SHIP_FROM_STREET1"),
    street2: env("SHIP_FROM_STREET2"),
    city: required(env("SHIP_FROM_CITY"), "SHIP_FROM_CITY"),
    state: required(env("SHIP_FROM_STATE"), "SHIP_FROM_STATE"),
    zip: required(env("SHIP_FROM_ZIP"), "SHIP_FROM_ZIP"),
    country: "US",
    phone: env("SHIP_FROM_PHONE"),
    email: env("SHIP_FROM_EMAIL")
  };
}

function destinationAddress(address = {}) {
  return {
    name: required(address.name, "Ship-to name"),
    street1: required(address.street1, "Street address"),
    street2: address.street2 || "",
    city: required(address.city, "City"),
    state: required(address.state, "State"),
    zip: required(address.zip, "ZIP code"),
    country: "US",
    phone: address.phone || "",
    email: address.email || ""
  };
}

function parcel(items = []) {
  const quantity = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  const defaultWeight = Number(env("SHIP_DEFAULT_WEIGHT_OZ", "8"));
  const weight = Math.max(defaultWeight, defaultWeight * Math.max(1, quantity));

  return {
    length: env("SHIP_DEFAULT_LENGTH_IN", "10"),
    width: env("SHIP_DEFAULT_WIDTH_IN", "7"),
    height: env("SHIP_DEFAULT_HEIGHT_IN", "4"),
    distance_unit: "in",
    weight: String(weight),
    mass_unit: "oz"
  };
}

function normalizeRate(rate) {
  return {
    id: rate.object_id,
    provider: rate.provider,
    servicelevel: rate.servicelevel?.name || rate.servicelevel?.token || "",
    servicelevelToken: rate.servicelevel?.token || "",
    amount: Number(rate.amount || 0),
    currency: rate.currency || "USD",
    estimatedDays: rate.estimated_days ?? null,
    durationTerms: rate.duration_terms || "",
    arrivesBy: rate.arrives_by || "",
    attributes: Array.isArray(rate.attributes) ? rate.attributes : []
  };
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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const token = required(env("SHIPPO_API_TOKEN"), "SHIPPO_API_TOKEN");
    const body = requestBody(request);
    const shipmentResponse = await fetch(`${SHIPPO_API_BASE}/shipments/`, {
      method: "POST",
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        address_from: originAddress(),
        address_to: destinationAddress(body.address),
        parcels: [parcel(body.items || [])],
        async: false
      })
    });

    const shipment = await responseJson(shipmentResponse);
    if (!shipmentResponse.ok) {
      json(response, shipmentResponse.status, {
        error: "Shippo could not calculate rates.",
        detail: shipment
      });
      return;
    }

    const rates = (shipment.rates || [])
      .map(normalizeRate)
      .filter((rate) => Number.isFinite(rate.amount))
      .sort((a, b) => a.amount - b.amount);

    json(response, 200, {
      shipmentId: shipment.object_id,
      rates
    });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to calculate shipping rates." });
  }
};

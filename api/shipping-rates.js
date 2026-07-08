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
  const street = required(address.street1, "Street address");
  const apartment = String(address.street2 || "").trim();

  return {
    name: required(address.name, "Ship-to name"),
    // Some carrier labels render street2 above street1. Keeping the unit on the
    // delivery-address line preserves the customer's street-first order.
    street1: [street, apartment].filter(Boolean).join(" "),
    street2: "",
    city: required(address.city, "City"),
    state: required(address.state, "State"),
    zip: required(address.zip, "ZIP code"),
    country: "US",
    phone: address.phone || "",
    email: address.email || ""
  };
}

function defaultItemWeight() {
  return Number(env("SHIP_DEFAULT_ITEM_WEIGHT_OZ", env("SHIP_DEFAULT_WEIGHT_OZ", "1"))) || 1;
}

function standardBoxParcel(weightOz = 1) {
  const weight = Math.max(1, Math.ceil(Number(weightOz || 1)));

  return {
    length: "8",
    width: "4",
    height: "3",
    distance_unit: "in",
    weight: String(weight),
    mass_unit: "oz"
  };
}

function defaultParcel(quantity = 1) {
  return standardBoxParcel(defaultItemWeight() * Math.max(1, Number(quantity || 1)));
}

function groupedPackageWeight(items = []) {
  const total = items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    return sum + positiveNumber(item.productWeight, defaultItemWeight()) * quantity;
  }, 0);
  return Math.ceil(Math.max(1, total));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function productParcel(item = {}) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const fallback = standardBoxParcel(positiveNumber(item.productWeight, defaultItemWeight()) * quantity);
  const weight = positiveNumber(item.packageWeight, positiveNumber(item.productWeight, defaultItemWeight())) * quantity;

  return {
    length: String(positiveNumber(item.packageLength, Number(fallback.length))),
    width: String(positiveNumber(item.packageWidth, Number(fallback.width))),
    height: String(positiveNumber(item.packageHeight, Number(fallback.height))),
    distance_unit: "in",
    weight: String(weight),
    mass_unit: "oz"
  };
}

function buildPackages(items = []) {
  const packages = [];
  const groupedItems = [];

  items.forEach((item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    if (!quantity) return;
    if (item.mustShipSeparately) {
      packages.push({
        type: "separate",
        label: item.name || item.id || "Separate package",
        items: [{ id: item.id, quantity }],
        parcel: productParcel(item)
      });
      return;
    }
    groupedItems.push(item);
  });

  const groupedQuantity = groupedItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  if (groupedQuantity > 0) {
    packages.unshift({
      type: "grouped",
      label: "Standard package",
      items: groupedItems.map((item) => ({ id: item.id, quantity: Math.max(0, Number(item.quantity || 0)) })),
      parcel: standardBoxParcel(groupedPackageWeight(groupedItems))
    });
  }

  return packages.length ? packages : [{
    type: "grouped",
    label: "Standard package",
    items: [],
    parcel: defaultParcel(1)
  }];
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

function allowedServicelevels(settings = {}) {
  const values = [
    ...(Array.isArray(settings.enabledServicelevels) ? settings.enabledServicelevels : []),
    ...(Array.isArray(settings.customServicelevels) ? settings.customServicelevels : [])
  ];
  return new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
}

function filterAllowedRates(rates = [], settings = {}) {
  const allowed = allowedServicelevels(settings);
  if (!allowed.size) return rates;
  return rates.filter((rate) => allowed.has(String(rate.servicelevelToken || "").toLowerCase()));
}

async function createShipment(token, addressTo, packageInfo) {
  const shipmentResponse = await fetch(`${SHIPPO_API_BASE}/shipments/`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      address_from: originAddress(),
      address_to: addressTo,
      parcels: [packageInfo.parcel],
      async: false
    })
  });

  const shipment = await responseJson(shipmentResponse);
  if (!shipmentResponse.ok) {
    const error = new Error("Shippo could not calculate rates.");
    error.statusCode = shipmentResponse.status;
    error.detail = shipment;
    throw error;
  }

  return {
    ...packageInfo,
    shipmentId: shipment.object_id,
    rates: (shipment.rates || []).map(normalizeRate).filter((rate) => Number.isFinite(rate.amount))
  };
}

function rateKey(rate = {}) {
  return [rate.provider || "", rate.servicelevelToken || rate.servicelevel || ""].join("::").toLowerCase();
}

function combinePackageRates(packageRates = [], settings = {}) {
  if (packageRates.length === 1) {
    return filterAllowedRates(packageRates[0].rates, settings)
      .map((rate) => ({
        ...rate,
        packageCount: 1,
        packages: [{
          label: packageRates[0].label,
          shipmentId: packageRates[0].shipmentId,
          rateId: rate.id,
          amount: rate.amount,
          provider: rate.provider,
          servicelevel: rate.servicelevel,
          servicelevelToken: rate.servicelevelToken
        }]
      }))
      .sort((a, b) => a.amount - b.amount);
  }

  const allowedPackages = packageRates.map((packageInfo) => ({
    ...packageInfo,
    rates: filterAllowedRates(packageInfo.rates, settings)
  }));
  const firstRates = allowedPackages[0]?.rates || [];
  const combined = [];

  firstRates.forEach((firstRate) => {
    const key = rateKey(firstRate);
    const matches = allowedPackages.map((packageInfo) => {
      const rate = packageInfo.rates.find((candidate) => rateKey(candidate) === key);
      return rate ? { packageInfo, rate } : null;
    });
    if (matches.some((match) => !match)) return;

    const amount = matches.reduce((sum, match) => sum + Number(match.rate.amount || 0), 0);
    combined.push({
      id: matches.map((match) => match.rate.id).join("|"),
      provider: firstRate.provider,
      servicelevel: firstRate.servicelevel,
      servicelevelToken: firstRate.servicelevelToken,
      amount: Number(amount.toFixed(2)),
      currency: firstRate.currency || "USD",
      estimatedDays: Math.max(...matches.map((match) => Number(match.rate.estimatedDays || 0))) || null,
      durationTerms: firstRate.durationTerms || "",
      arrivesBy: "",
      attributes: firstRate.attributes || [],
      packageCount: matches.length,
      packages: matches.map((match) => ({
        label: match.packageInfo.label,
        shipmentId: match.packageInfo.shipmentId,
        rateId: match.rate.id,
        amount: match.rate.amount,
        provider: match.rate.provider,
        servicelevel: match.rate.servicelevel,
        servicelevelToken: match.rate.servicelevelToken
      }))
    });
  });

  return combined.sort((a, b) => a.amount - b.amount);
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
    const addressTo = destinationAddress(body.address);
    const packages = buildPackages(body.items || []);
    const packageRates = await Promise.all(packages.map((packageInfo) => createShipment(token, addressTo, packageInfo)));
    const rates = combinePackageRates(packageRates, body.shippingMethods);

    json(response, 200, {
      shipmentId: packageRates[0]?.shipmentId || "",
      packageCount: packages.length,
      rates
    });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to calculate shipping rates." });
  }
};

const { supabaseRequest } = require("./_email");

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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = requestBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const result = await supabaseRequest("/rest/v1/rpc/subscribe_marketing_contact", {
      method: "POST",
      body: {
        p_email: email,
        p_full_name: String(body.fullName || "").trim(),
        p_source: String(body.source || "mailing_list_signup"),
        p_user_id: body.userId || null
      }
    });
    json(response, 200, result || { ok: true });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to join the mailing list." });
  }
};

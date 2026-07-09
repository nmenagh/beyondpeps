const { supabaseRequest } = require("./_email");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

module.exports = async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const token = request.query?.token || request.body?.token;
    if (!token) throw new Error("Unsubscribe token is required.");
    const result = await supabaseRequest("/rest/v1/rpc/unsubscribe_marketing_contact", {
      method: "POST",
      body: { p_token: token }
    });
    if (!result?.ok) throw new Error(result?.message || "Unsubscribe link is invalid.");
    json(response, 200, {
      ok: true,
      message: "You have been unsubscribed from marketing emails. Order and account-required emails will continue."
    });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to unsubscribe." });
  }
};

const { renderStoredEmail, sendResendEmail, supabaseRequest } = require("./_email");

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function due(startedAt, delayDays) {
  return Date.now() >= new Date(startedAt).getTime() + Number(delayDays || 0) * 86400000;
}

async function recordSend(payload) {
  return supabaseRequest("/rest/v1/crm_sends?on_conflict=enrollment_id,sequence_step_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload]
  });
}

module.exports = async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for CRM scheduling.");
    }
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.headers.authorization !== `Bearer ${cronSecret}`) {
      json(response, 401, { error: "Unauthorized." });
      return;
    }

    const [contacts, sequences, steps, enrollments, sends] = await Promise.all([
      supabaseRequest("/rest/v1/crm_contacts?marketing_status=eq.subscribed&select=*"),
      supabaseRequest("/rest/v1/crm_sequences?active=eq.true&select=*"),
      supabaseRequest("/rest/v1/crm_sequence_steps?select=*&order=sort_order.asc"),
      supabaseRequest("/rest/v1/crm_enrollments?status=eq.active&select=*"),
      supabaseRequest("/rest/v1/crm_sends?status=eq.sent&select=enrollment_id,sequence_step_id")
    ]);

    const contactsById = new Map((contacts || []).map((item) => [item.id, item]));
    const activeSequences = new Set((sequences || []).map((item) => item.id));
    const sentKeys = new Set((sends || []).map((item) => `${item.enrollment_id}:${item.sequence_step_id}`));
    let sent = 0;
    let failed = 0;

    for (const enrollment of enrollments || []) {
      if (sent >= 100 || !activeSequences.has(enrollment.sequence_id)) continue;
      const contact = contactsById.get(enrollment.contact_id);
      if (!contact) continue;
      const sequenceSteps = (steps || []).filter((step) => step.sequence_id === enrollment.sequence_id);

      for (const step of sequenceSteps) {
        if (sent >= 100) break;
        const key = `${enrollment.id}:${step.id}`;
        if (sentKeys.has(key) || !due(enrollment.started_at, step.delay_days)) continue;

        try {
          const rendered = await renderStoredEmail({
            templateId: step.template_id,
            fallback: {
              subject: "Beyond Peps",
              preview_text: "",
              header_image_url: "/assets/bp-logo-mark.png",
              body_html: "<p>Hi {{customer_name}},</p><p>Thanks for being part of Beyond Peps.</p>"
            },
            tokens: { customer_name: contact.full_name || "there" },
            recipientEmail: contact.email,
            recipientName: contact.full_name,
            unsubscribeToken: contact.unsubscribe_token
          });
          const result = await sendResendEmail({
            to: contact.email,
            ...rendered,
            idempotencyKey: `crm-${enrollment.id}-${step.id}`
          });
          if (!result.sent) throw new Error(result.reason || "Email did not send.");
          await recordSend({
            contact_id: contact.id,
            enrollment_id: enrollment.id,
            sequence_step_id: step.id,
            template_id: step.template_id,
            resend_id: result.id || null,
            status: "sent",
            error_message: null,
            sent_at: new Date().toISOString()
          });
          sentKeys.add(key);
          sent += 1;
        } catch (error) {
          await recordSend({
            contact_id: contact.id,
            enrollment_id: enrollment.id,
            sequence_step_id: step.id,
            template_id: step.template_id,
            status: "failed",
            error_message: error.message,
            sent_at: new Date().toISOString()
          });
          failed += 1;
        }
      }

      const complete = sequenceSteps.length > 0 && sequenceSteps.every((step) => sentKeys.has(`${enrollment.id}:${step.id}`));
      if (complete) {
        await supabaseRequest(`/rest/v1/crm_enrollments?id=eq.${encodeURIComponent(enrollment.id)}`, {
          method: "PATCH",
          body: { status: "completed", completed_at: new Date().toISOString() }
        });
      }
    }

    json(response, 200, { ok: true, sent, failed });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to process CRM emails." });
  }
};

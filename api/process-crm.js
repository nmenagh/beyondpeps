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

async function recordCampaignSend(payload) {
  return supabaseRequest("/rest/v1/crm_sends?on_conflict=campaign_id,contact_id", {
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
    if (!cronSecret) {
      throw new Error("CRON_SECRET is required for CRM scheduling.");
    }
    if (request.headers.authorization !== `Bearer ${cronSecret}`) {
      json(response, 401, { error: "Unauthorized." });
      return;
    }

    const now = new Date().toISOString();
    const [contacts, sequences, steps, enrollments, sends, campaigns] = await Promise.all([
      supabaseRequest("/rest/v1/crm_contacts?marketing_status=eq.subscribed&select=*"),
      supabaseRequest("/rest/v1/crm_sequences?active=eq.true&select=*"),
      supabaseRequest("/rest/v1/crm_sequence_steps?select=*&order=sort_order.asc"),
      supabaseRequest("/rest/v1/crm_enrollments?status=eq.active&select=*"),
      supabaseRequest("/rest/v1/crm_sends?status=eq.sent&select=enrollment_id,sequence_step_id,campaign_id,contact_id"),
      supabaseRequest(`/rest/v1/crm_campaigns?status=in.(scheduled,sending)&scheduled_at=lte.${encodeURIComponent(now)}&select=*&order=scheduled_at.asc`)
    ]);

    const contactsById = new Map((contacts || []).map((item) => [item.id, item]));
    const activeSequences = new Set((sequences || []).map((item) => item.id));
    const sentKeys = new Set((sends || []).map((item) => `${item.enrollment_id}:${item.sequence_step_id}`));
    const campaignSentKeys = new Set((sends || []).filter((item) => item.campaign_id).map((item) => `${item.campaign_id}:${item.contact_id}`));
    let sent = 0;
    let failed = 0;

    for (const campaign of campaigns || []) {
      if (sent >= 100 || !campaign.template_id) continue;
      await supabaseRequest(`/rest/v1/crm_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: { status: "sending", updated_at: new Date().toISOString(), error_message: null }
      });

      let campaignFailures = 0;
      for (const contact of contacts || []) {
        if (sent >= 100) break;
        const key = `${campaign.id}:${contact.id}`;
        if (campaignSentKeys.has(key)) continue;
        try {
          const rendered = await renderStoredEmail({
            templateId: campaign.template_id,
            fallback: {
              subject: "Beyond Peps",
              preview_text: "",
              header_image_url: "/assets/bp-logo-mark.png",
              body_html: "<p>Hi {{customer_name}},</p><p>There is something new at Beyond Peps.</p>"
            },
            tokens: { customer_name: contact.full_name || "there" },
            recipientEmail: contact.email,
            recipientName: contact.full_name,
            unsubscribeToken: contact.unsubscribe_token
          });
          const result = await sendResendEmail({
            to: contact.email,
            ...rendered,
            idempotencyKey: `campaign-${campaign.id}-${contact.id}`
          });
          if (!result.sent) throw new Error(result.reason || "Email did not send.");
          await recordCampaignSend({
            contact_id: contact.id,
            campaign_id: campaign.id,
            template_id: campaign.template_id,
            resend_id: result.id || null,
            status: "sent",
            error_message: null,
            sent_at: new Date().toISOString()
          });
          campaignSentKeys.add(key);
          sent += 1;
        } catch (error) {
          await recordCampaignSend({
            contact_id: contact.id,
            campaign_id: campaign.id,
            template_id: campaign.template_id,
            status: "failed",
            error_message: error.message,
            sent_at: new Date().toISOString()
          });
          campaignFailures += 1;
          failed += 1;
        }
      }

      const remaining = (contacts || []).some((contact) => !campaignSentKeys.has(`${campaign.id}:${contact.id}`));
      await supabaseRequest(`/rest/v1/crm_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: {
          status: remaining ? "scheduled" : "sent",
          sent_at: remaining ? null : new Date().toISOString(),
          recipient_count: (contacts || []).filter((contact) => campaignSentKeys.has(`${campaign.id}:${contact.id}`)).length,
          error_message: campaignFailures ? `${campaignFailures} recipients failed and will be retried.` : null,
          updated_at: new Date().toISOString()
        }
      });
    }

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

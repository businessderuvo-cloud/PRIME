import { ApiError } from "./validation.mjs";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function createAuthMailer({
  fetcher = fetch,
  apiKey = process.env.PRIME_RESEND_API_KEY || "",
  from = process.env.PRIME_EMAIL_FROM || "",
  production = process.env.NODE_ENV === "production",
} = {}) {
  const outbox = [];
  async function send({ to, subject, message, actionUrl, actionLabel }) {
    if (!apiKey || !from) {
      if (production) throw new ApiError(503, "Email transazionali non configurate: contatta il titolare PRIME.");
      outbox.unshift({ to, subject, message, action_url: actionUrl, action_label: actionLabel, created_at: new Date().toISOString() });
      if (outbox.length > 50) outbox.length = 50;
      return { local: true };
    }
    let response;
    try {
      response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text: `${message}\n\n${actionLabel}: ${actionUrl}\n\nSe non hai richiesto questa operazione, ignora questa email.`,
          html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202323"><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#202323;color:white;text-decoration:none;border-radius:8px">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;color:#686e6c">Se non hai richiesto questa operazione, ignora questa email.</p></main>`,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ApiError(502, "Servizio email temporaneamente non raggiungibile.");
    }
    if (!response.ok) throw new ApiError(502, "Il provider email non ha accettato il messaggio.");
    return { local: false };
  }
  return { send, configured: Boolean(apiKey && from), localMessages: () => outbox.map(({ to, subject, message, action_url, action_label, created_at }) => ({ to, subject, message, action_url, action_label, created_at })) };
}

// Builds the notification email for a contact message. Kept separate from the
// web handler so it can be tested on its own.
export interface ContactRecord { name: string; email: string; subject: string; message: string; created_at?: string }

// Strip anything that could add extra headers or lines to a one-line field.
const LINE_BREAKS = new RegExp("[\\r\\n" + String.fromCharCode(0x2028, 0x2029) + "]+", "g");
const oneLine = (s: string) => String(s ?? "").replace(LINE_BREAKS, " ").trim();

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Returns a short reason if the submission is not acceptable, otherwise null.
export function validateContact(b: Record<string, unknown>): string | null {
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const lim: Record<string, number> = { name: 120, email: 254, subject: 200, message: 4000 };
  for (const k of Object.keys(lim)) {
    if (!str(k)) return `${k} is required`;
    if (str(k).length > lim[k]) return `${k} is too long`;
  }
  if (!EMAIL.test(str("email"))) return "email is not valid";
  return null;
}

export function buildEmail(m: ContactRecord, opts: { from: string; to: string }) {
  const subject = oneLine(m.subject).slice(0, 180);
  const name = oneLine(m.name).slice(0, 120);
  const email = oneLine(m.email).slice(0, 254);
  return {
    from: opts.from,
    to: [opts.to],
    reply_to: email,                       // hitting Reply in your inbox replies to the sender
    subject: `[Website] ${subject}`,
    text: [
      `From: ${name} <${email}>`,
      `Subject: ${subject}`,
      "",
      String(m.message ?? "").slice(0, 4000),
      "",
      "---",
      "Sent through the contact form on the YNEPF website.",
    ].join("\n"),
  };
}

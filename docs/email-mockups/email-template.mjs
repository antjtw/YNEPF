// The mockups use the real template (supabase/email/template.ts), so what you preview is exactly what is sent.
import { renderEmail, esc, b as bold, a as anchor, BRAND, RULES_AND_KIT as RULES } from "../../supabase/email/template.ts";
export { BRAND, esc, RULES };
export const b = bold, link = anchor;
export function render(e) { const r = renderEmail({ ...e, title: e.subject }); return { subject: e.subject, html: r.html, text: r.text }; }

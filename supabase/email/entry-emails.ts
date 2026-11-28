// The entry emails shared by the entry-checkout, stripe-webhook and entry-refund functions. THIS FILE IS THE SOURCE:
// scripts/sync-email-template.mjs copies it into each of them (they cannot import it). It needs the email template above it.
// Each builder describes one email. The function that sends it turns it into HTML and plain text with renderEmail().

const gbp = (pence: number): string => "£" + (pence / 100).toFixed(2);
// "2027-02-27" -> "27 February 2027". Anything that is not an ISO date is shown as it is.
const longDate = (d: string): string => /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "Europe/London", dateStyle: "long" }) : d;
const mailto = (to: string, subject: string): string => `mailto:${to}?subject=${encodeURIComponent(subject)}`;
type Extra = { name: string; option?: string; pence: number };
const extraLabel = (x: Extra) => `${x.name}${x.option ? ` (${x.option})` : ""}`;

// ---- to the lifter ----------------------------------------------------------------------------------------------------------------------
export function confirmationEmail(e: { name: string; competition: string; date: string; event: string; equipment: string; pence: number; under18: boolean; entriesEmail: string; refundsUntil?: string; category?: string; weightClass?: string; sex?: string; division?: string; club?: string; clubLabel?: string; discountPence?: number; extras?: Extra[]; manageUrl?: string }): EmailSpec {
  const first = String(e.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: e.entriesEmail, noQuestions: true, why: "You are getting this email because you entered a YNEPF competition.",
    preheader: `Your entry for ${e.competition} on ${longDate(e.date)} is confirmed and paid.`,
    blocks: [
      ["h1", `You're in, ${first}.`],
      ["p", `Your entry for ${b(e.competition)} on ${esc(longDate(e.date))} is confirmed. Thank you for entering.`],
      ["details", [["Event", e.event], ["Equipment", e.equipment], e.category ? ["Category", e.category] : null, e.weightClass ? ["Weight class", `${e.sex === "F" ? "Women's" : "Men's"} ${e.weightClass} kg`] : null, e.division ? ["Federation or division", e.division] : null,
        e.club ? [e.clubLabel || "Club", e.club] : null, e.discountPence ? ["Discount", `${gbp(e.discountPence)} off`] : null,
        ...(e.extras ?? []).map((x): [string, string] => [`Extra: ${extraLabel(x)}`, gbp(x.pence)]), ["Paid", gbp(e.pence)]], "boldLast"],
      ...(e.under18 ? [["note", "<b>Under 18 on the day?</b> A parent or guardian needs to be with you at the competition.", "info"] as Block] : []),
      ...(e.refundsUntil ? [["p", `Refunds are available until entries close on ${esc(e.refundsUntil)}. After that, we cannot refund entries.`] as Block] : []),
      ...(e.manageUrl ? [
        ["p", "<b>Need to change something, or pull out?</b> You can do it online until entries close. Your name, club, Instagram and OpenIPF profile update straight away. A different weight class, or cancelling, goes to the entries team to approve."] as Block,
        ["button", "Manage your entry", e.manageUrl] as Block,
        ["small", `To change your event, date of birth or sex, or anything to do with money, email us at ${a(mailto(e.entriesEmail, `Changing my entry: ${e.competition}`), e.entriesEmail)} instead.`] as Block,
      ] : [
        ["p", "<b>Need to change something, or pull out?</b> Email us and the entries team will sort it, before entries close."] as Block,
        ["button2", "Email us about your entry", mailto(e.entriesEmail, `Changing my entry: ${e.competition}`)] as Block,
      ]),
      ...RULES_AND_KIT,
      ["small", "Your name, club and weight class are shown on the entries list and the lifting order. Your date of birth is never published. If anything is wrong, or you want us to change or delete what we hold about you, just reply to this email."],
    ],
  };
}
// A refund or cancellation. A whole refund cancels the entry; a part refund leaves them entered.
export function refundEmail(o: { name: string; competition: string; refundedPence: number; cancelled: boolean; reason?: string; entriesEmail: string; siteUrl?: string }): EmailSpec {
  const first = String(o.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: o.entriesEmail, why: o.cancelled ? "You are getting this email because your entry was cancelled." : "You are getting this email because part of your entry fee was refunded.",
    preheader: o.refundedPence > 0 ? `We have refunded ${gbp(o.refundedPence)}.${o.cancelled ? "" : " You are still entered."}` : "No refund is due on this entry.",
    blocks: [
      ["h1", o.cancelled ? "Your entry has been cancelled" : "We have refunded part of your entry"],
      ["p", o.cancelled ? `Hi ${esc(first)}, your entry in ${b(o.competition)} has been cancelled.` : `Hi ${esc(first)}, we have refunded part of your entry fee for ${b(o.competition)}. <b>You are still entered.</b>`],
      ["details", o.refundedPence > 0 ? [["Refunded", gbp(o.refundedPence)], ["Back on your card", "5 to 10 working days"], o.reason ? ["Reason", o.reason] : null] : [["Refunded", "No refund is due on this entry"], o.reason ? ["Reason", o.reason] : null]],
      ...(o.cancelled && o.siteUrl ? [["p", "We are sorry we will not see you on the platform this time. Keep an eye on the calendar for the next one."] as Block, ["button", "See upcoming competitions", `${o.siteUrl.replace(/\/$/, "")}/calendar`] as Block] : []),
    ],
  };
}
// Paid after the held place was released and the competition filled: refunded in full, automatically.
export function autoRefundEmail(o: { name: string; competition: string; refundedPence: number; entriesEmail: string; joinUrl?: string }): EmailSpec {
  const first = String(o.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: o.entriesEmail, why: "You are getting this email because your payment was refunded automatically.",
    preheader: "Your place was released before your payment arrived, so we have refunded you in full.",
    blocks: [
      ["h1", "We have refunded your payment"],
      ["p", `Hi ${esc(first)}, sorry: your payment arrived after your place was released, and ${b(o.competition)} has since filled. We have refunded you in full.`],
      ["details", [["Refunded", gbp(o.refundedPence)], ["Back on your account", "a few days"]]],
      ["p", "You can join the waiting list on the competition page."],
      ...(o.joinUrl ? [["button", "Join the waiting list", o.joinUrl] as Block] : []),
    ],
  };
}

// ---- notes for the competitions inbox ---------------------------------------------------------------------------------------------------------
const desk = (url: string | undefined, label: string): Block[] => url ? [["button", label, url]] : [];
export function entryNotification(e: { name: string; email: string; competition: string; date: string; event: string; equipment: string; weightClass?: string; sex?: string; category?: string; division?: string; isGuest?: boolean; club?: string; clubLabel?: string; pence: number; discountPence?: number; extras?: Extra[]; under18?: boolean; openipfUrl?: string; taken: number; capacity?: number | null; deskUrl?: string }): EmailSpec {
  const flags = [e.isGuest ? "<b>A guest:</b> the membership number needs checking." : "", e.under18 ? "<b>Under 18 on the day:</b> parent or guardian details were taken." : ""].filter(Boolean).join(" ");
  return {
    internal: true, preheader: `${e.name} has entered ${e.competition}. ${e.taken}${e.capacity ? ` of ${e.capacity}` : ""} ${e.taken === 1 && !e.capacity ? "place" : "places"} taken.`,
    blocks: [
      ["h1", "New entry"],
      ["p", `${b(e.name)} has entered ${b(e.competition)} (${esc(longDate(e.date))}).`],
      ["details", [["Event", `${e.event}, ${e.equipment.toLowerCase()}`], e.weightClass ? ["Weight class", `${e.sex === "F" ? "Women's" : "Men's"} ${e.weightClass} kg`] : null, e.category ? ["Category", e.category] : null,
        e.division ? ["Federation or division", e.division] : null, e.club ? [e.clubLabel || "Club", e.club] : null,
        e.pence > 0 ? ["Paid", `${gbp(e.pence)}${e.discountPence ? ` (after a discount of ${gbp(e.discountPence)})` : ""}`] : ["Entry", "Free: nothing to pay"],
        ...(e.extras ?? []).map((x): [string, string] => [`Extra: ${extraLabel(x)}`, gbp(x.pence)]),
        e.openipfUrl ? ["OpenIPF", `${e.openipfUrl} (checked automatically within a few minutes)`] : null, ["Email", e.email]]],
      ...(flags ? [["note", flags, "warn"] as Block] : []),
      ["p", `That is ${e.taken}${e.capacity ? ` of ${e.capacity}` : ""} ${e.taken === 1 && !e.capacity ? "place" : "places"} taken.`],
      ...desk(e.deskUrl, "Open the entries desk"),
    ],
  };
}
export function discountNotification(o: { code: string; name: string; email: string; competition: string; discountPence: number; paidPence: number; recipientName?: string; recipientEmail?: string; reason?: string; deskUrl?: string }): EmailSpec {
  const made = [o.recipientName, o.recipientEmail].filter(Boolean).join(", ");
  return {
    internal: true, preheader: `The code was used for ${o.competition}.`,
    blocks: [
      ["h1", "A discount code was used"],
      ["p", `The code ${b(o.code)} has been used for ${b(o.competition)}.`],
      ["details", [["Used by", `${o.name} (${o.email})`], ["Discount", `${gbp(o.discountPence)} off${o.paidPence > 0 ? `, so they paid ${gbp(o.paidPence)}` : ", so the entry is free"}`], made ? ["Made for", made] : null, o.reason ? ["Reason", o.reason] : null]],
      ...desk(o.deskUrl, "See every use of the codes"),
    ],
  };
}
export function refundNotification(o: { by: string; name: string; email: string; competition: string; refundedPence: number; cancelled: boolean; reason?: string; taken?: number; capacity?: number | null; deskUrl?: string }): EmailSpec {
  return {
    internal: true, preheader: o.refundedPence > 0 ? `${o.by} refunded ${gbp(o.refundedPence)} to ${o.name}.${o.cancelled ? " The place is free again." : ""}` : `${o.by} cancelled ${o.name}'s entry. No money was refunded.`,
    blocks: [
      ["h1", o.cancelled ? "Entry cancelled" : "Part refund"],
      ["p", o.refundedPence > 0 ? `${b(o.by)} refunded ${b(gbp(o.refundedPence))} to ${esc(o.name)} for their entry in ${b(o.competition)}.` : `${b(o.by)} cancelled ${esc(o.name)}'s entry in ${b(o.competition)}. No money was refunded.`],
      ["details", [o.reason ? ["Reason", o.reason] : null, ["The entry is now", o.cancelled ? "Cancelled, and the place is free" : "Still entered (a partial refund)"], ["Email", o.email],
        o.taken !== undefined ? ["Places taken", `${o.taken}${o.capacity ? ` of ${o.capacity}` : ""}`] : null]],
      ...(o.refundedPence > 0 ? [["small", "Stripe keeps its processing fee on a refund."] as Block] : []),
      ...desk(o.deskUrl, "Open the entries desk"),
    ],
  };
}

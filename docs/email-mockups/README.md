# YNEPF emails: research, mockups and plan

Status: **mockups only.** Nothing here changes the emails that are sent today. The Edge Functions are untouched.

## What we send today

Every email is **plain text only**. That is why they look like a typewriter in a serif or monospace font: the inbox picks the font, because we send none. They also read like system messages ("Event: Full power") and have raw links.

There are about 20 kinds. The ones lifters and volunteers see:

| Email | Sent from |
|---|---|
| Entry confirmation, refund, cancelled | `stripe-webhook`, `entry-refund` |
| Waiting list: joined, offer, reminder, expired | `waitlist` |
| Priority entry link | `waitlist` |
| Volunteer sign-up, "change my answers" link | `waitlist` |
| One-time points code, discount code | `waitlist` |
| Lifting order shared | `waitlist` |

Plus internal notes to the competitions inbox (new entry, discount used, refund, volunteer joined and so on).

## What the research says (short version)

This is the current mainstream advice. Sources are vendor blogs and docs rather than formal standards, so treat it as practical consensus, and the dark mode part especially as "test it".

- **Layout: tables and inline styles.** Outlook for Windows still renders email with Word's engine, and Gmail strips or ignores a lot of CSS. Nested tables with inline styles, about 600px wide, are still the reliable base. Avoid flexbox, grid and relying on background images.
- **Buttons: build them from code, not images.** A table cell carries the background colour and padding, with the link inside. It still shows when images are blocked. (Outlook needs an extra VML snippet to get rounded corners and exact padding. Without it the button just has square corners, which is fine.)
- **Fonts: use system fonts.** Custom web fonts only work in Apple Mail and a few others. Gmail and Outlook for Windows ignore them. So the stack is system fonts first (`-apple-system`, Segoe UI, Helvetica Neue, Arial). The look comes from layout, colour and spacing, not a brand typeface.
- **Send both HTML and plain text.** Multipart is still the norm. The plain text should be a proper readable version, not an auto-strip of the HTML. Deliverability impact is debated, but authentication (SPF, DKIM, DMARC) matters far more, and Resend sets that up with the domain.
- **Dark mode: you cannot fully control it.** Clients invert or recolour in different ways. Good practice is to use a design that survives it (no pure white logo boxes, transparent PNG logo), declare `color-scheme`, add a small `prefers-color-scheme` block for the clients that honour it, and test both.
- **Images:** a PNG logo hosted on the site, with width and height set. **SVG does not work** in Gmail or Outlook, so the logo is a PNG (`assets/img/email-logo.png`).
- **Preheader:** the grey preview line after the subject. Worth writing on purpose.

## The mockups

Open `out/index.html` (after `node docs/email-mockups/build.mjs`). Six emails, each shown beside its plain text version:

1. Entry confirmation
2. Priority entry link
3. Waiting list offer
4. Entry cancelled and refunded
5. Volunteer points discount
6. One-time points code

What changed in each:

- **Branded header:** navy bar with the logo, a gold rule, and the federation name.
- **Real fonts and spacing:** one clean system font stack, a clear heading, readable body text.
- **Links are buttons**, with a "copy this link" line underneath for personal links.
- **Details in a table** (event, class, price) instead of "Label: value" lines.
- **Callout boxes** for the one thing that matters: a deadline, "link only works once", "under 18".
- **Codes in a box**, big enough to read out or copy.
- **New copy:** warmer and shorter. It says what happened, what to do, and by when.
- **A proper footer** saying why they are getting the email.
- **Mobile and dark mode** checked.

## Quick wins, in order

1. **Adopt the template** (`email-template.mjs`) for the lifter-facing emails: confirmation, offer, priority, cancelled or refunded, points codes.
2. **Rewrite the copy** as in `samples.mjs`. This is the biggest improvement per hour.
3. **Send HTML and text together.** Resend takes `html` and `text` in the same call. The mockup builds both from one description, so they cannot drift apart.
4. **Leave the internal notes to the inbox as plain text.** They are for the team, and plain text is quicker to scan.
5. **Later, if wanted:** the Outlook button snippet, a free email previewing tool to check Outlook and Gmail, and a "view in browser" link.

## How it would be wired in

The Edge Functions are pasted in by hand and each one is a single file, so they cannot share code. The simplest route is to copy the template block into each function that sends email (`waitlist`, `stripe-webhook`, `entry-refund`, `entry-checkout`), and change each `send(...)` call to pass `html` as well as `text`. That is a mechanical change.

An alternative is one new `send-email` function that owns the template and the others call it. Cleaner, but more moving parts. Worth deciding before the build.

## Questions before building

- Is "The YNEPF team" the right sign-off, or should some emails come from a person or the entries team?
- Should the header carry the full name, or just the logo and "YNEPF"?
- Do we want a "view in browser" link, or is that over the top for transactional emails?
- Copy check: is the tone in `samples.mjs` right? Easy to change before it is wired in.

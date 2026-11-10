# YNEPF entry system: the plan

This is the plan to read **before any code is written**. It covers what we are building, how it is split into pieces, how the money works, who can do what, and what is still undecided. The database design is in [`schema-draft.sql`](schema-draft.sql) and the privacy guidance is in [`privacy-guidance.md`](privacy-guidance.md).

Nothing in here has been built yet. The database design has been **tested** in a scratch database (40 checks, see "How this is tested").

---

## 1. What you decided

| Topic | Decision |
|---|---|
| Prices | Same as the published FAQ: full power £40, bench only £25, sub-junior £15. All are settings per competition. |
| Weight classes | A setting per sex, using today's classes. There is no 72 kg any more (women: 43, 47, 52, 57, 63, 69, 76, 84, 84+). |
| Divisions | We have division **names**, not codes. A small table maps each name to the name used in the OpenLifter meet. |
| Franchise payments | Franchise competitions take entries **through us**. We hold the money, keep our cut, and pay the host after entries close. |
| Merchandise | 100% goes to the host (for YNE competitions, the federation). |
| Photo packages | 100% goes to White Lights Media, our photographer. |
| Reporting | A "money to send" report: what each payee is owed, what the federation keeps, Stripe fees, and total earnings. |
| Refunds | Full refund up to a cut-off date per competition. Points come back with a refund. |
| Names | Full names on the public entries and waiting lists, as we have always done, with a clear line on the form saying so. |
| Roles | Admin, Entries team, Editor, Contributor (see section 6). The entries team can refund. |
| Places left | A short poll (the page asks "how many places left?" every few seconds). Not live connections. |
| OpenIPF | The form only checks the link looks right. After payment, a background job fetches the lifter's results and stores their best total and GL points. |
| Process | Work on branches. Each piece ends in a pull request with a plain-English summary, a testing checklist and the Vercel preview link. **You merge, I don't.** |

---

## 2. How it fits together

- **The website stays static** (plain HTML, CSS and JavaScript on Vercel). Each competition's page, entry form, entries list and lifting order are **shared template pages** that load their competition from Supabase. Vercel rewrites send the clean addresses (`/competitions/2027/yne-march-open/enter`) to those templates.
- **Supabase** holds the data (Postgres), checks who may see what (row level security) and runs the server-side jobs (Edge Functions and scheduled tasks).
- **Stripe** takes the payment inside our own page (embedded Checkout). Card details never touch us.
- **Resend** sends the emails, from an `@ynepf.co.uk` address (see [email-setup-guide.md](../email-setup-guide.md)).
- **Server-side jobs** (Supabase Edge Functions): create a payment session, receive Stripe's webhook, send emails, look up OpenIPF, offer waiting list places, and a nightly check for anything stuck.

### Addresses

| Address | What it is |
|---|---|
| `/competitions/2027/yne-march-open` | The competition page: details, **Enter** (or **Join the waiting list**), places left |
| `.../enter` and `.../enter/about-you`, `/lifting`, `/extras`, `/check`, `/pay` | The entry form. Each step has its own address, so the browser back button works |
| `.../entered` | Confirmation page (where Stripe returns to) |
| `.../lifting-order` | The list of entries until a lifting order is published, then the lifting order itself. One address throughout |
| `.../waiting-list` | The waiting list (name and position) |
| `/competitions/2027` | That year's competitions |

Old addresses keep working with redirects (`/lifting-order/<slug>`, the YNE Worlds page, and any competition whose name is changed later).

---

## 3. The pieces, in order

The spec's "phase 1" is too big for one pull request. It is split into three. Each piece **works on its own** and ends with something you can click through.

### Phase 1A: take a payment, end to end

The thinnest slice that takes real money safely.

- Entry settings for a competition (events, equipment, capacity, entry opens and closes, price rules, refund cut-off), created from a template.
- The entry form: about you, your lifting, check your answers, pay. Including date of birth, the age category worked out for you, **the under-18 guardian questions and consent from day one**, and the eligibility confirmation.
- Stripe embedded Checkout in our page. Holding a place for 15 minutes while someone pays, so 96 places can never be oversold.
- The confirmation page and the confirmation email, plus a copy to the entries inbox.
- A basic entries list in `/admin`.
- The audit log (who did what, when) from the very start.
- The new roles.

**Demo:** with Stripe **test cards**, enter a competition from start to finish, see it in `/admin`, and receive the email.

### Phase 1B: run the entries desk

Everything the entries team needs to run a competition.

- The full entries table: sort, filter, expand a row, edit any field (logged), cancel and refund, add a manual entry, export CSV.
- Entry stages (priority, qualifier, general, guest), guests and divisions, "can break records".
- Extras: photo packages and merchandise, with images, options and sizes, and stock.
- The public entries list (names, never emails).
- **The money report**: money to send to each payee, what the federation keeps, Stripe fees, and total earnings.
- Reports for White Lights Media (photo orders and the do-not-photograph list) and for hosts (merchandise with sizes).
- Duplicate warnings (same email or BP number twice).

**Demo:** run a pretend competition through every desk task, and see the money report add up.

### Phase 1C: full houses

- The waiting list, and the automatic offers with a 48 hour window, reminders and lapsing.
- The background OpenIPF lookup (best total and GL), and the qualification flags.
- The remaining emails: joined the waiting list, offer, reminder, expired, cancelled.

**Demo:** sell a competition out, join the waiting list, cancel an entry, and watch the offer go out and expire.

**Pilot:** run one YNE competition in 2027 on this, with Square kept as a fallback. Pieces 1A and 1B are enough to start; until 1C is built the waiting list can stay a Google Form.

### Phase 2: lifting order

- The builder: set up days, sessions and flights, **auto sort**, drag and drop with a "Move to…" menu as the keyboard alternative, locks, prime time, timings, lot numbers.
- Publish and unpublish, with an optional email to every entrant.
- The OpenLifter export.
- A test harness with dummy entries and fixed scenarios, so you can review how it sorts and tell me how you would do it differently.

### Phase 3: volunteers, points and priority entry

- Rotas with sign-up, tick-off on the day awarding points, and a points ledger with 24 month expiry.
- Priority entry links emailed to everyone with unexpired points.
- An import of the current points sheet, with a check that nothing was lost.

### Phase 4: ideas only

Results import from OpenLifter, automatic data deletion, QR volunteer sign-in. (Stripe Connect is dropped, because you pay franchises out yourselves.)

---

## 4. The money

### What happens to each payment

Everyone pays **us**, by card, through Stripe. Stripe keeps its fee. After entries close the money is paid out to the people owed it.

| Kind of money | Goes to |
|---|---|
| Entry fees (YNE competitions) | The federation |
| Entry fees (franchise competitions) | The host, less **our cut** (a percentage set per host) |
| Merchandise | 100% to the host |
| Photo packages | 100% to White Lights Media |

These percentages are settings per competition, copied from the host when the competition is created, so a single competition can differ.

### The "money to send" report

For a competition, the report shows one row per payee:

| Payee | Entry money | Merchandise | Photos | Stripe fees | **To send** |
|---|---|---|---|---|---|
| Implexus Gym | £288 | £40 | | | **£328** |
| White Lights Media | | | £30 | | **£30** |
| YNEPF (what we keep) | £72 | | | −£9.05 | **£62.95** |

and a total line: takings, Stripe fees and **total earnings**. A "mark as paid" button records each payout (date and reference).

Things the report handles, all tested:

- **Refunds.** A cancelled or refunded entry is left out of the takings, but **Stripe keeps its fee on a refund**, so that fee still counts as a cost.
- **Pennies.** Shares are whole pence. If a split does not divide evenly (thirds, for example), the leftover penny goes to the biggest share, so the numbers **always add up exactly**.
- **Who pays Stripe's fees.** A setting per competition (see "Still to decide"). The default is that the federation absorbs them.

> **For your treasurer:** this means we hold money that belongs to other people (hosts, White Lights Media) for a few weeks. They should decide whether to keep it in a separate bank account and how it appears in the accounts.

---

## 5. Prices, categories and eligibility

- **Prices** are ordered rules, first match wins ("Sub-junior, any event: £15", "Bench only: £25", "Full power: £40").
- **Age category** is never stored. It is worked out from date of birth and the competition date using the calendar-year rule, every time. (Born 1986 is Masters 1 in 2026. Born 1987 is Masters 1 from 2027.) Tested.
- **Under 18 on the day** is worked out from the exact date, and asks for a parent or guardian's details and consent. They are stored privately, readable only by the entries team.
- **Category declaration.** The form asks men's or women's, which decides the weight classes shown. The IPF requires transgender athletes to declare and have IPF approval before competing. The form carries one confirmation tick ("I confirm I'm eligible to compete in this category under IPF rules", linking to the policy) and the line "if you need to talk to us, email us". Wording to be agreed with British Powerlifting.
- **Name on the lifting order.** Names are shown in full. The form says so ("your name will be shown on the entries list and the lifting order") and offers an optional **display name** if someone wants it shown differently. We keep the real name for our records.

---

## 6. Who can do what

| | Admin | Entries team | Editor | Contributor |
|---|:-:|:-:|:-:|:-:|
| Manage users and roles | ✔ | | | |
| Competition entry settings, prices, add-ons | ✔ | ✔ | | |
| Entries, waiting list, refunds, manual entries | ✔ | ✔ | | |
| Money reports and payouts | ✔ | ✔ | | |
| Guardian details, access needs, eligibility notes | ✔ | ✔ | | |
| Lifting order builder and publishing | ✔ | ✔ | | |
| Create competitions and events (not their entry settings) | ✔ | | ✔ | |
| Site content (Home, FAQs, Organisation, Records, Footer) | ✔ | | ✔ | |
| News posts | ✔ | | ✔ | ✔ |

This is tested at database level: every role is checked against content, news, competitions, entries and private details, so it is enforced by the database and not only by what the editor shows.

> **One thing to know when this is adopted:** the new role rules replace how `is_editor()` is defined today. When we adopt them, they have to be merged **into `supabase/schema.sql` itself**. Otherwise re-running the old file later would quietly undo them. The test caught this.

---

## 7. What the YNE Worlds lifting order tells us

I looked at the real YNE Worlds 2026 lifting order (64 lifters) to see how you actually sequence things:

- **Flights mix several weight classes** (M66, M74 and M83 in one flight). A flight is not "one class".
- **Women's flights are small** and slot between the men's (day 1, session 2: 4 women in flight C, then 13 men in flight D).
- **Day 2 is prime time**: the top women by GL points (14 lifters, GL 78 to 90) then the top men (11 lifters, GL 86 to 99), each in their own flight, across mixed classes.
- Lifters with no GL (new lifters) sit at the start of the first flight.

So the auto sort works from your description: group by weight class and go up through the day (lightest women, lightest men, then heavier), heaviest classes last, with an optional **prime time**. Prime time is set per competition: switch it on, choose how many men and how many women (for example 40 each) and the system picks them by best GL and puts them in their own session(s).

---

## 8. Money, accounts and who does what

| Thing | Who | When |
|---|---|---|
| Stripe account and Apple Pay domain steps | Treasurer (with a second named person) | Before 1A is switched on for real |
| `@ynepf.co.uk` email address | You, following [email-setup-guide.md](../email-setup-guide.md) | Before 1A is tested |
| Supabase paid plan (backups, no pausing) | Treasurer to budget | Before taking real payments |
| Vercel plan (the free plan is for non-commercial use, and taking payments is a grey area) | Treasurer to budget, or ask Vercel | Before taking real payments |
| Resend paid plan (the free plan stops at 100 emails a day) | Treasurer to budget | Before the first real entry day |
| Daily keep-awake for Supabase | Done, on branch `ops-setup` (merge it) | Now |

I will give you **numbered, plain-English steps** for every one of these when it is time, one at a time.

---

## 9. How this is tested

- **Database:** a scratch Postgres, built from the real `schema.sql`, with checks for permissions (every role against every kind of data), age categories, places left, the audit log and the money report. 40 checks pass for the draft design.
- **Concurrency:** many people entering at once for the last places, so nobody is oversold.
- **Payments:** Stripe **test mode** and test cards only, until you decide to go live. Webhooks are checked for duplicates and bad signatures.
- **Browser:** the entry form end to end, on a phone width, with accessibility checks, as for the rest of the site.
- **Preview first:** every piece is checked on a Vercel preview before you merge it, and database changes go to a **separate test project** first, never straight to the live one.

---

## 10. Still to decide

1. **Who pays Stripe's fees?** The federation (simple, and it matches "we take a cut"), or shared in proportion to what each payee receives. The design supports both. My suggestion: the federation.
2. **Prime time size.** How many men and women, and ranked by what? I have assumed best GL. You mentioned 40 of each. At 14 per flight that is three flights each, so should it be one prime time session or several?
3. **Sequence within a day.** My reading is: women's classes lightest first, then men's, ascending, with the heaviest men on the last day. Is that right, or do you interleave women and men by bodyweight?
4. **Entries team and guardian details.** Should every entries team member see guardian phone numbers and access needs for every competition, or only the people running that competition?
5. **Our cut.** The percentage per host (set once per franchise).
6. **Refund cut-off.** The default date (for example, entries closing date, or a set number of days before).
7. **Stripe account owners.** The treasurer and who?
8. **British Powerlifting.** Confirm the category declaration wording.
9. **OpenLifter (phase 2).** I need a real exported file, and the list of division names as set up in your OpenLifter template.
10. **Photo packages.** Confirm White Lights Media is paid 100%, and whether they should receive the order list by email automatically.

---

## 11. Risks I am watching

| Risk | What I will do about it |
|---|---|
| Overselling places in the 9am rush | A locked reservation in the database, tested with many simultaneous entries |
| Payment taken but no entry (or the reverse) | A nightly check; the webhook records every Stripe event once |
| Sensitive data leaking | Private details in their own table, readable by the entries team only, never in exports, emails or public views |
| Emails landing in spam | A verified `@ynepf.co.uk` domain, checked before launch |
| Re-running the old `schema.sql` undoing new rules | The new rules are merged into `schema.sql` when adopted |
| Too much at once | Small pieces, each on its own preview, each testable with Stripe test cards |

# Security review

A first-pass review of the YNEPF site, database and Edge Functions, done by the person who built it, with attack-style tests run against a copy of the real database. **It is a self-review, so it is not a substitute for an independent penetration test.** If a client, insurer or the committee needs assurance, commission one and use this as the starting brief.

## What was done

- **Database:** loaded the real schema into a scratch Postgres with Supabase's default privileges, then asked Postgres which tables, views and functions the public (`anon`), a signed-in stranger, a content editor and an entries user can reach.
- **Attack tests** (in `docs/entry-system/waitlist.test.mjs`): the public and signed-in users trying to read entries, guardian details and payments; to insert or change entries, prices and the `editors` table; to promote themselves to admin; to call server-only functions directly (`start_entry`, `confirm_entry_payment`, points functions); to alter the audit log or points ledger; to truncate tables. All blocked.
- **Edge Functions:** read each for access control, input checks, rate limits, webhook signature checking, error leakage and outbound requests.
- **Browser code:** searched for every place HTML is built from data, and tested that a name, club or Instagram handle containing a script is shown as text and never runs.
- **Repository:** searched for committed secrets (none), checked the deploy headers, and the GitHub workflow.

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | No security headers on the site (clickjacking, content sniffing, referrer, transport) | Medium | **Fixed** in `vercel.json` |
| 2 | Waiting list join: the rate limit was per visitor **and address**, so one visitor could join with endless different addresses and make the site email strangers | Medium | **Fixed** (also a per-visitor limit) |
| 3 | Volunteer points list: one call returned every volunteer's full name and balance, even though the page hid it until you searched | Medium (privacy) | **Fixed**: search needs 3+ letters and returns 25 at most; the old function is removed |
| 4 | Content editors could delete a competition (removing its volunteer sign-ups, waiting list and discount codes) | Medium | **Fixed**: only the entries team and admins can delete |
| 5 | Bulk emails (entries closed, lifting order, rota) were sent back to back with no retry, so an email service rate limit would silently drop some | Medium | **Fixed**: sends are paced and retried |
| 6 | Discount code checks could be guessed faster by changing the email address each time | Low (codes have about 30 bits of randomness, so guessing is impractical) | **Fixed**: per visitor and global limits added |
| 7 | A competition name was placed into HTML without escaping, and an entry link was only partly encoded (both set by staff only) | Low | **Fixed** |
| 8 | OpenIPF profile name could be `..` and steer the lookup to another page on openipf.org | Low | **Fixed** |
| 9 | Stripe webhook did not compare the amount paid with the entry price | Low | **Logged** as a warning, not blocked, to avoid ever rejecting a real payment |
| 10 | Supabase's default privileges give the public role write and truncate rights on every table (row security stops row access, truncate is not covered) | Low (the API cannot truncate) | **Fixed**: removed |
| 11 | Trigger functions could be run by the public | Low | **Fixed**: removed |
| 12 | `Access-Control-Allow-Origin` defaults to `*` if `ALLOWED_ORIGIN` is not set | Low (no cookies are used) | **Your action**: set the secret |
| 13 | Rate limits are held in memory, per function instance, so they are best-effort | Low | Accepted. The important limits (one-time code attempts, code lifetimes) are enforced in the database |
| 14 | A full Content Security Policy cannot be enforced yet (the site uses inline scripts and staff paste in image and sheet addresses) | Info | A full policy is sent in **report-only** mode so it can be reviewed in the browser console and tightened later. A safe subset is enforced now |
| 15 | The entries team can edit payment records directly | Info | By design (trusted role). Every change is written to the audit log, which they cannot edit |

## Things that were checked and held up

- Row security is on for every table. The public can read only the calendar, news, prices, weight classes, published lifting orders and a few reference lists.
- Roles come from a protected `editors` table, not from anything a user can edit. Only an admin can change it, the last admin cannot be removed, and a role needs a confirmed email address.
- Every function a signed-in user can run checks their role. The money and entry functions (`start_entry`, `confirm_entry_payment`, one-time codes, redeeming points) can only be run by our own server.
- Stripe webhook: signature checked in constant time, five-minute freshness window, and each event is processed once.
- Prices are worked out on the server from the database, never taken from the browser.
- Personal links and tokens (offers, volunteer links) are long and random, and the database keeps only a hash of offer and priority tokens.
- The public views (entries, waiting list, rota, lifting order) carry no emails, dates of birth, membership numbers or guardian details.
- No secrets are in the repository. The Supabase public key in `config.js` is designed to be public.
- Entries cannot oversell: `start_entry` locks the competition, so 100 people entering at the same moment are processed one after another, each in a few milliseconds.

## Things only you can check (Supabase and Stripe settings)

1. **Supabase, Authentication:** switch off **Allow new users to sign up** if only invited people sign in. Turn on **Confirm email**, and consider requiring a strong password and turning on leaked-password protection.
2. **Two-step login** for every person with access to Supabase, Stripe, Vercel, GitHub and the editors (admin accounts first).
3. **Edge Function secrets:** set `ALLOWED_ORIGIN` to `https://www.ynepf.co.uk` for every function that reads it.
4. **Stripe:** keep the secret key only in Supabase Secrets (never in chat or email). When you go live, give the Stripe key only the permissions needed (a restricted key) if you can.
5. **Backups:** check what your Supabase plan includes (daily backups, and point-in-time recovery on paid plans). A payments and personal-data system should have a tested way to restore.
6. **After deploying this review:** set `Content-Security-Policy-Report-Only` aside for a while, open the site, and look at the browser console for "Content Security Policy" messages. Anything real there is what a stricter policy would block.
7. **Who is an admin.** Review the list of editors in the site editor every few months.

## What was not done

- A real penetration test against the live site (this review ran against a scratch copy of the database, and the Edge Functions were read, not attacked).
- A data protection impact assessment (separate document).
- Load testing against live infrastructure. The design was reviewed for 100 people at once: entries are safe (see above), and bulk emails are now paced. The limits of your Supabase and Resend plans are the real ceiling, so check them against a busy competition.
- Testing in real Outlook and Gmail, or the live Stripe flow.

## Keeping it this way

New tables created in Supabase get open privileges by default. The SQL file removes the risky ones for existing tables, but **every new table needs row security turned on and a policy**, or it is open to the public. The attack tests in `docs/entry-system/waitlist.test.mjs` check the list of functions the public can run, so a new one shows up as a failing test.

## Added later: Manage your entry (`/my-entry`)

Reviewed as it was built, with tests in `docs/entry-system/waitlist.test.mjs`:
- Access is by an emailed one-time code (hashed, 15 minutes, five wrong tries lock it, five codes an hour per address). An address with no entry gets the same answer as one with an entry.
- A lifter can only ever see and change their own entries (the address is checked on every call). The page never shows a date of birth or guardian details.
- Only small, low-risk fields change without approval. Weight class, equipment and cancellation are requests the entries team decides. The team's decision can only be made through the server after it has checked the person is on the entries team.
- Every request and small change is recorded in `entry_requests` and in the audit log. The public cannot read or write it.

## Added later: gym day passes (`/pass`)

Reviewed as it was built, with tests in `docs/entry-system/waitlist.test.mjs` and `docs/entry-system/daypass-function.test.mjs`:
- A pass is a 192 bit random secret in the address. Only its SHA-256 hash is stored, so a pass cannot be read back out of the database or the audit log.
- The scan page needs no login, so it shows only the name, gym and dates, never an email address. Using a pass is a single atomic update, so two scans cannot both succeed. A scan only checks; the gym presses a button to use it.
- Points are taken when the pass is claimed and returned if it is given back unused, cancelled by the entries team, or the email could not be sent. The public cannot read or write the tables; everything goes through server-only functions. Gyms and passes are in the audit log.
- Limits: the scan and claim actions are rate limited per address. Anyone holding a pass link can mark it used (the same person who holds the QR code), so volunteers are asked not to share it.

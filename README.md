# Yorkshire &amp; North East Powerlifting Federation — microsite

A multi-page service site in the GOV.UK / NHS content style, with a lightweight Supabase-backed editor. Built for
clarity, accessibility (WCAG 2.2 AA) and responsiveness.

## What's here

```
index.html            Homepage: hero, upcoming events, three cards, news
calendar.html         Competition calendar (Upcoming / Past tabs)
records.html          Records, read live from Google Sheets
news.html, post.html  News list and a single post
committee.html        The committee and referees
faqs.html             FAQs
contact.html          Contact form
rules.html, rules/    Plain-English rules pages
chairperson.html      A message from the chairperson
lifting/              A competition's lifting order, at /lifting-order/<address>
lifting-order.html    The original YNE Worlds 26 page (self-contained, unchanged)
admin/                The site editor (sign in, then manage content)
assets/css/           palette (generated), tokens, base, components, fonts, admin
assets/js/            public.js, site.js, contact.js, nav.js, footer.js, admin.js, config.js
assets/partials/      The shared header (with menu drawer) and footer
assets/vendor/        Pinned third-party libraries, committed so there is no CDN
assets/fonts, img/    Cutmark, IBM Plex Sans, logos and image slots
design/               The colour tokens export: the single source of truth
supabase/             schema.sql, seed.sql and the email-notification function
scripts/              build helpers: palette, contrast check, seed generator
docs/                 Draft documents (privacy policy) to paste into Google Docs
build.js              Inlines the shared header/footer into every page
```

## How the shared header and footer work

The header and footer live once in `assets/partials/`. They are **inlined
directly into every page** between marker comments:

```html
<!-- @partial:header start --> ...header markup... <!-- @partial:header end -->
```

This means every page is fully self-contained: the navigation shows whether
the page is deployed on a server **or** opened straight from disk, with no
JavaScript required for the nav to appear.

All asset and link paths are **relative**, so the site works at any location,
including double-clicking a file locally.

If you edit a partial in `assets/partials/`, run the build to push the change
into every page:

```bash
node build.js
```

The build re-inlines the current partials into all pages (idempotent — safe to
run repeatedly) . Deploy the project root. The top-level files are the site — they are static, self-contained, and use relative paths.

## Deploying

Upload the **project root** to any static host (Netlify, GitHub Pages,
Cloudflare Pages, S3, etc.). No server-side code or build pipeline is required
on the host — the top-level files are the finished site. All paths are
relative, so it works wherever it is served from, and even when a file is
opened straight from disk.

## Design system

The look is built from a small set of rules, all in `assets/css/`:

| File | What it holds |
|------|---------------|
| `palette.css` | Every colour step. **Generated**, never edited by hand. |
| `tokens.css` | Colour roles, radii, shadows, motion, the type and spacing scales. |
| `base.css` | Reset, typography, links, focus, the container and the column grid. |
| `components.css` | Buttons, header, menu drawer, hero, cards, forms, tables, footer... |
| `fonts.css` | Cutmark and IBM Plex Sans, both self-hosted (no Google Fonts). |

### Colour: one source of truth

Colours come from the design export in `design/Light theme.tokens.json`. To change
one, update that file and run `node scripts/generate-palette.js`, which rewrites
`palette.css`. Components never use raw ramp colours; they use roles from
`tokens.css`:

- **Iron Oxide** is for actions only: every button, plus the active tab underline.
- **Slate Navy** is everything else: text, headings, links, surfaces.
- **Sage Green** is success, **Soft Rose** is errors and failures.
- **Gold** is used for keyboard focus and nothing else.
- Neutral Grey is for borders and quiet text.

(In the source file Iron Oxide 300 equals 400 and Slate Navy 800 equals 900, so
those pairs look identical.)

### Type and spacing (GOV.UK scales)

- **h1 and h2 are Cutmark; h3 and below, and all body text, are IBM Plex Sans.**
  The hero line (`.display`) is the largest Cutmark, at the GOV.UK 80px step.
- Sizes follow the GOV.UK scale and step up at the tablet breakpoint (641px):
  body 16px on mobile and 19px from tablet, h3 18/24, h2 27/36, h1 32/48.
- Spacing tokens `--space-1` to `--space-9` are the GOV.UK scale: 5, 10, 15, then
  15/20, 15/25, 20/30, 25/40, 30/50 and 40/60px (mobile/tablet).

### Buttons, links and focus

- **Primary** (filled iron), **secondary** (outline that fills on hover) and
  **ghost** (plain text that gets a soft tint on hover; used for row actions in
  the editor). Hover sweeps the fill in, press
  nudges down, and all of it switches off for `prefers-reduced-motion`. Buttons on
  dark sections flip to white automatically (add `on-dark` to the section).
- **Links** are navy, **visited** links are iron, hover thickens the underline.
- **Focus** is always visible: links get a gold highlight with a dark underline
  (the GOV.UK pattern); buttons and form fields get a gold ring with a dark inner
  ring, so it reads on both light and dark backgrounds.

### Clean by design

The look is deliberately quiet: an **off-white page** with plain **white cards**
that are separated by a soft shadow, not outlines. There is no decorative
pattern, glow or ring anywhere; the only imagery is the photos themselves. Space,
type and one accent colour do the work. Shapes are soft (pill buttons, 20px
cards, 28px panels).

- **Tabs and pickers** (the calendar tabs, the year picker, the editor's tabs) are
  one segmented control: a light rounded tray, with the chosen item as a white
  box. No underlines.
- **Header and menu** are light, with the colour crest. The footer is the one dark
  block, to anchor the page.
- **Motion** is small and switches off for `prefers-reduced-motion`: the button
  fill sweep, a soft header shadow as you scroll, scroll-reveal, fades between
  pages and the sliding menu. None of it is needed to read the site.

### Layout grid

Everything sits in a `.container`: content is at most **960px** wide, centred,
with side margins of 16px on mobile and 30px from tablet. That includes the
header, hero, cards and footer, so every section lines up. The one exception is
the hero photo: on wide screens it is allowed to bleed a little (up to 4rem) into
the margin (`--bleed` in `tokens.css`).
`.container-wide` (1200px) still exists but nothing uses it by default. Columns go
in a `.grid-row`:

```html
<div class="container">
  <div class="grid-row">
    <div class="grid-column-two-thirds">...</div>
    <div class="grid-column-one-third">...</div>
  </div>
</div>
```

Widths: `grid-column-full`, `-one-half`, `-one-third`, `-two-thirds`,
`-one-quarter`, `-three-quarters`. A row's widths should add up to a whole. Rows
nest. There is a 30px gutter. Below **641px** every column is full width and
stacks in source order, so write the markup in reading order for a phone.

### Header, menu and footer

`assets/partials/header.html` and `footer.html` are inlined into every page by
`node build.js`. The header shows the main links inline from 1024px. Below that
the links collapse and a **Menu** button appears, which opens a slide-out drawer (a
native dialog: focus is trapped, Esc closes it, the page behind is inert). The
menu button is not shown while the inline links fit.

**Footer links are edited in the site editor** under **Footer**. Each group is
either a **column of links** (rename it, add links, reorder with the arrows), the
**bottom row** (privacy policy, franchise agreements...), or the **social links**
under the logo. The footer draws itself from the database on each page (a single
small request, cached for a minute), and the links written in `footer.html` are the
fallback if the database cannot be reached. The privacy policy and franchise
agreements links start as `#` placeholders: replace them with the Google Doc
addresses. The contact page links to the privacy policy once it has a real address.
Links may be a full `https://` address, `mailto:`, a page on this site (like
`faqs.html`) or `#`; anything else is ignored. A starting draft of the privacy
policy is in `docs/privacy-policy-draft.md`.

### Images

The homepage hero shows a competition photo. The untouched original is kept in
`design/source-photos/`; the site only ever loads the compressed copies below.

| Slot | File | Suggested size | Notes |
|------|------|----------------|-------|
| Hero (right of the headline) | `assets/img/hero.webp` / `hero.jpg` (1000px) and `hero-640.*` (phones) | 1000 x 1250 | Fills the rounded frame from the centre (`object-fit: cover`). |

**Adding a photo.** Resize and compress it first, so it costs visitors almost no bandwidth:

```bash
npm install --no-save sharp                     # once
node scripts/optimise-image.js ~/Downloads/bench.jpg hero 1000
```

That writes `assets/img/hero.webp` (about 150 KB) and `hero.jpg` at 1000px wide (the
hero shows at about 520px, so this is sharp on retina screens), never scaling a small
photo up. The page then fills the frame with it from the centre (`object-fit: cover`),
so a portrait or landscape photo both work. Point the hero at it in `index.html`:

```html
<picture>
  <source srcset="assets/img/hero.webp" type="image/webp">
  <img src="assets/img/hero.jpg" alt="A lifter benching at a YNEPF competition" width="1000" height="1250" fetchpriority="high">
</picture>
```

Set `width` and `height` to the real size the script reports, and write an `alt` that
describes the photo.

Keep photos under about 300KB each (export as JPG or WebP).

### Favicon

The crest is the favicon: `favicon.svg` (modern browsers), `favicon-48.png` and `apple-touch-icon.png`
(180px), linked from every page's `<head>`.

### Logo

The federation crest is in `assets/img/` as `logo-colour.svg` (navy ring, coral
centre) and `logo-white.svg` (used on dark backgrounds).

### Accessibility

The site is built to WCAG 2.2 AA and checked three ways:

- `node scripts/check-contrast.js` checks 60 text/background pairings straight
  from the palette.
- Every page type (including the open menu, form errors and every editor tab) was
  run through the axe-core checker at desktop and phone widths: no violations.
- Text was also checked against the real rendered pixels behind it (about 1,300
  text items), which catches photos, gradients and overlapping elements.

Other points: semantic landmarks on every page (`header`, `nav`, `main`, `footer`),
one `h1` per page with a sensible heading order, a skip link, visible keyboard
focus everywhere, links and controls whose accessible name contains their visible
text, and `prefers-reduced-motion` respected.

## Content management (Supabase)

Competitions, news, the committee page and FAQs are stored in Supabase and
edited at **`/admin`**. The public pages read from the database when they load,
so an edit appears on the site straight away: no rebuild, no deploy.

```
admin/index.html        The editor (sign in, then manage content)
assets/js/config.js     Your Supabase URL + anon key (the only thing to fill in)
assets/js/site.js       Shared helpers: data client, UK time, markdown, competition status
assets/js/public.js     Fills calendar, home, news, committee and FAQs from the database
assets/js/admin.js      The editor itself
assets/vendor/          Pinned third-party libraries, committed so there is no CDN
supabase/schema.sql     Tables, security rules, the public competitions view
supabase/seed.sql       The existing committee, FAQs and 2026 calendar, ready to load
```

### One-off setup

1. Create a project at supabase.com.
2. **SQL editor:** run `supabase/schema.sql`, then `supabase/seed.sql`
   (both are safe to re-run; the seed only fills empty tables).
3. **Authentication > Sign In / Providers:** leave "Allow new users to sign up"
   **on**, and "Confirm email" **on**. Access is controlled by the allow-list
   below, not by sign-up: anyone can create a login, but a login that is not on
   the list can change nothing (this is enforced in the database).
4. **Sign in as the first admin.** `schema.sql` adds `ynepfentries@gmail.com` as
   the admin. Open `/admin` and either continue with Google using that address,
   or choose "Create your login" with that address and a password (you will be
   emailed a link to confirm it). After that, add everyone else from the
   **Users** tab.
5. **Authentication > URL Configuration:** set the Site URL to your live site, and
   add `https://YOUR-SITE/admin/` to Redirect URLs. This is needed for password
   reset emails and for Google/Apple sign-in to return to the editor.
6. **Project URL and key:** copy the Project URL (`https://<project-ref>.supabase.co`,
   shown under the Connect button, or Project Settings > Data API) and the
   **publishable** key (Project Settings > API Keys; a legacy `anon` key also works)
   into `assets/js/config.js`. Never use a secret key or the `service_role` key
   anywhere in this repo.
7. Deploy as before (Vercel). Open `/admin` and sign in.

### Who can edit, and how people sign in

A full step-by-step guide for editors (calendar, lifting order and records spreadsheets,
news, users and more) is in [`docs/editor-guide.md`](docs/editor-guide.md).

- **Users tab (admins only).** Add someone's email address and choose *Editor*
  (manage competitions, news, records, organisation, FAQs) or *Admin* (also add
  and remove users). Removing a user takes their access away immediately; their
  login still exists but can do nothing. The database refuses to remove or
  demote the last admin.
- **A new person** goes to `/admin` and either continues with Google (or Apple),
  or chooses "Create your login" with the email you added. Their email must be
  confirmed, so nobody can claim someone else's address. Someone signed in but
  not on the list sees a "No access yet" screen.
- **Forgotten password.** On the sign-in screen choose "Forgotten your
  password?" after typing the email. A link is emailed; opening it brings them
  back to the editor to choose a new password. If they cannot get at that
  inbox, they can continue with Google instead (same email), or you can send a
  reset from Supabase: Authentication > Users > the user > Send password
  recovery.
- **Google sign-in.** Create an OAuth client in Google Cloud Console (type: Web
  application) with the redirect URI shown in Supabase under Authentication >
  Providers > Google, then paste the client ID and secret there. It is free.
- **Apple sign-in** needs a paid Apple Developer account, a Services ID and a
  key, and Apple's client secret has to be regenerated about every 6 months. It
  is worth adding only if people ask. Apple users must share their real email
  (not "Hide My Email"), or the admin must add the relay address Apple gives
  them.
- Switch a provider's button on in `assets/js/config.js` (`authProviders`) only
  after enabling it in Supabase.

### How it behaves

- **Competitions.** Each has dates, venue (linked to Google Maps), description,
  entry link, and entry open/close date and time. Entering the competition date
  suggests entry opening 8 weeks before at 9am and closing 3 weeks before at
  noon; change either freely. Times are entered as UK time and handled across
  GMT/BST. The entry link is only returned by the database while entry is open
  (after the open time, before the close time, and not marked full), so it
  appears and disappears on schedule without anyone being online.
  **Calendar tabs:** the Calendar has two tabs. *Upcoming competitions* lists
  them soonest first, under a year subheading when they span more than one year.
  **Other events.** The editor's *Calendar* tab has *Add another event* next to
  *Add competition*, for AGMs, EGMs, referee courses and the like. An event has a
  title, description, location, date (and last day if it runs over several), a
  start time and an optional end time (UK time), and shows an "Event" tag. It has
  no entry window, waiting list, lifting order or results link. Events sit in the
  same Upcoming and Past lists as competitions and archive themselves the same way.
  They live in the same `competitions` table with `kind = 'event'`.
  A competition moves to *Past competitions* automatically once its last day has
  passed. That tab shows a row of years (newest first, only years that have past
  competitions) and, within a year, the competitions from January to December.
  Each history entry is just the name, date, venue and a link to the results: it
  shows no spaces, lifters or entry details. Paste the competition's OpenIPF page
  into *OpenIPF results link* to get the "View results on OpenIPF" link (it opens
  in a new tab); with no link the entry simply shows without one. Tabs and years
  can be linked directly: `calendar#past`, `calendar#past-2025`.
  **Entries full:** tick it (or use *Mark entries full* in the list) when a
  competition fills early. The entry button goes, an "Entries full" tag shows,
  and if you have added a **waiting list link** (a Google Form) a ghost-style
  "Join the waiting list" link appears instead. Untick it to reopen. The form's
  responses are managed in Google as usual.
  **Spaces:** *Number of spaces* shows on the competition next to the date and
  venue.
  **Enter now / lifting order:** once entry opens an "Enter now" button appears.
  A few days later, paste the lifting order sheet (a published Google Sheet:
  File > Share > Publish to web > CSV) into *Lifting order sheet* and a "View
  lifting order" button appears beside it, leading to that competition's own
  page at `/lifting-order/<address>`. The address is made from the year and name
  (for example `2027-yne-march-open`), suggested for you and editable (*Web
  address ending*); `vercel.json` rewrites it to `lifting/index.html`, and
  `/lifting/?c=<address>` also works anywhere. The page is headed with the
  competition name and lists lifters by day, session and flight. Sheet columns:
  Day, Session, Flight and Name are required; optional are Club, Instagram, Age
  class (blank = Open, else J, SJ, M1 to M4), Class (such as M66), GLP, Total (kg),
  Open IPF (links the name to the profile), and per session Weigh-in, Lift off and
  Session name. Each lifter's name cell holds the name, an Instagram icon (never
  the handle) and the club. Only columns that have something in them are shown, so
  use Total and/or GLP depending on the competition. There is no years-of-age
  column. Saving a competition warns about unrecognised age classes and invalid
  handles. `docs/mockups/sample-lifting-order.csv` is an example sheet. Within a flight lifters are
  ordered by class then GLP, except a session named "Prime time", which keeps
  the sheet's order. The page reads the sheet live, so adding, changing or
  deleting rows shows up as soon as Google refreshes the published sheet (a few
  minutes); nothing is stored or scheduled.
- **News.** Posts have a title, date, author (the signed-in editor), and a rich
  text body that is saved as Markdown, with links, headings, lists and tables.
  A post dated in the future publishes itself on that date; untick *Published*
  for a draft.
- **Organisation.** Sections (Executive team, Referees...) containing people
  (name, role, optional Instagram handle and blurb). Add, edit, delete and
  reorder with the arrow buttons; people can be moved between sections.
- **FAQs.** Categories containing questions, with Markdown answers. Same
  controls as the organisation page.
- **Records.** The Records page shows one table per entry under *Records* in
  the editor, each read live from a Google Sheet (men and women, classic and
  equipped). In each sheet use File > Share > Publish to web, choose the tab and
  CSV, and paste the link into the editor. A normal share link also works if the
  sheet is shared with "anyone with the link". The divisional records layout (a block per weight
  class, with each lift's current record in three rows: weight, holder, date) is
  recognised automatically and shown as a grid per weight class (each sheet is a
  tab, with search across all tabs and weight class jump links); any other sheet is shown as a plain table (first row = headings, blank
  rows and columns ignored). `docs/mockups/sample-records.csv` shows the layout. To move the
  records elsewhere, edit the entry and paste the new link; leaving the link
  blank hides that table. Google refreshes published sheets every few minutes.
- **FAQ links.** Each FAQ category and question gets an address made from its title (`faqs#yne-worlds`, `faqs#how-do-i-enter`; a linked question opens). The editor shows each category's link. Renaming changes the address.
- All user-written Markdown is sanitised before it is shown on the site.

### Contact form

`contact.html` collects name, email, subject and message, plus a tick-box
("I have looked through the FAQs and my question is not answered there") that must
be ticked before Send works. Validation is GOV.UK-style (an error summary that
takes focus, plus a message on each field), a hidden honeypot for bots, and a
confirmation panel.

**Messages are emailed, not stored.** The page posts the message to a small
Supabase Edge Function, `send-contact`, which sends it to the entries inbox
through Resend. The sender's address is set as the email's reply-to, so whoever
looks after the inbox just presses Reply and it goes to the person who wrote in.
There is no Messages tab in the editor and no messages table. The function
checks every field, caps the lengths, and allows 3 messages per address and 60 in
total per hour (best effort, per running instance). About ten minutes to set up:

1. Sign up at resend.com with `ynepfentries@gmail.com` and create an API key.
   (Until you verify your own domain there, Resend can only email the account
   owner, which is exactly the entries address.)
2. In Supabase, **Edge Functions > Deploy a new function**, name it
   `send-contact`, and replace its code with the whole of
   `supabase/functions/send-contact/index.ts` from this repo. It is a single
   self-contained file; there is nothing else to add.
3. In that function's settings switch **Verify JWT** off (visitors are not signed
   in, and the publishable key is not a JWT).
4. **Edge Functions > Secrets**: add `RESEND_API_KEY`. Optional: `NOTIFY_TO`
   (defaults to `ynepfentries@gmail.com`), `MAIL_FROM`, and `ALLOWED_ORIGIN` (the
   live site address, so other websites cannot use the function).
5. Send yourself a test from the Contact page.

Until the function is deployed the form shows "Sorry, your message could not be
sent" with the entries address to email instead. The email logic
(the helpers at the top of `index.ts`) and the form are tested, including that line breaks cannot be
smuggled into the email headers; the function itself has not been run against a
live Resend account. **Re-run `supabase/schema.sql`**: it removes the old
`contact_messages` table (any messages stored in it are deleted, so copy out
anything you want to keep first).

### Notes

- `assets/vendor/toastui-editor.js` is Toast UI Editor 3.2.2 bundled with its
  ProseMirror dependencies into a single file using esbuild
  (`import Editor from "@toast-ui/editor"; window.toastui = { Editor }`), because
  the npm package does not ship a ready-to-use browser bundle. Only the admin
  loads it.
- `scripts/generate-seed.js` is how `seed.sql` was produced from the original
  hand-written pages. It is kept for reference only.
- The original `lifting-order.html` (YNE Worlds 26 lifting order and volunteer
  rota) is unchanged and still updated by the scheduled GitHub Action. New
  competitions use the per-competition lifting order above instead.

## Editing the rest of the site

Pages that are not in the editor (the rules pages, the lifting order) are plain
HTML: edit the file directly, then run `node build.js`. Navigation, the ALPHA
banner and the footer are edited once in `assets/partials/` and apply
everywhere on the next build.

# Yorkshire &amp; North East Powerlifting Federation — microsite

A multi-page service site in the GOV.UK / NHS content style, with a lightweight Supabase-backed editor. Built for
clarity, accessibility (WCAG 2.1 AA) and responsiveness.

## What's here

```
ynepf/
├── index.html              Homepage: hero, events, resources
├── committee.html          Committee (Executive / Supporting tabs)
├── calendar.html           Competition calendar 2026
├── volunteering.html       Volunteer points (Earning / Spending tabs)
├── initiatives.html        2026 initiatives hub
├── faqs.html               FAQs (accordion)
├── initiatives/
│   ├── entry-fees.html     Entry fee changes (data table)
│   └── yne-worlds.html     YNE Worlds 26
├── assets/
│   ├── css/
│   │   ├── tokens.css      Source palette + accessible role mapping
│   │   ├── base.css        Reset, typography, layout primitives, a11y
│   │   └── components.css  Header, footer, banners, cards, tabs, tags, table
│   ├── js/
│   │   ├── nav.js          Mobile nav toggle (ships on every page)
│   │   └── tabs.js         Accessible WAI-ARIA tabs
│   └── partials/
│       ├── header.html     Single source of truth for the header
│       └── footer.html     Single source of truth for the footer
├── build.js                Inlines the shared header/footer into every page
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

## Typography

- **Headings:** Cutmark (a variable font), self-hosted from `assets/fonts/`.
  Declared in `assets/css/fonts.css`. Used at display weights with a slightly
  condensed width (`font-variation-settings`) for a distinctive, industrial feel.
- **Body:** IBM Plex Sans, loaded from Google Fonts via the `<link>` in each
  page `<head>`. To self-host it instead (recommended for production, removes the
  external request), download the IBM Plex Sans woff2 files, drop them in
  `assets/fonts/`, add an `@font-face` block to `fonts.css`, and remove the
  Google Fonts `<link>` from each page.

## Logo

The federation crest is in `assets/img/` as two SVGs:
`logo-colour.svg` (navy ring, coral centre) and `logo-white.svg` (used in the
navy header). The white version can be recoloured by changing its `fill`
values if you need it on a different background.

## Colour palette

The palette is derived from the supplied Figma "Light theme" tokens (Iron Oxide,
Slate Navy, Golden Sandstone, Neutral Grey, Sage Green, Soft Rose). The raw
ramps are kept in `tokens.css` for reference, but components consume the
**semantic role tokens** below it. Every text/background pairing was checked to
meet WCAG 2.1 AA:

| Role | Token | Contrast |
|------|-------|----------|
| Body text | grey-900 on white | 15.4:1 |
| Muted text | grey-700 on white | 6.9:1 |
| Links | navy-700 on white | 10.9:1 |
| Primary button | white on iron-600 | 5.7:1 |
| Header bar | white on navy-800 | 14.3:1 |
| Breadcrumb / footer | navy-800 on navy-50 | 12.1:1 |
| Tag: entry open | sage-800 on sage-100 | 7.2:1 |
| Tag: entry closed | grey-800 on grey-100 | 7.7:1 |
| Tag: open position | rose-800 on rose-100 | 6.4:1 |

The natural button colour (iron-500) only reaches 4.48:1 against white, just
under the 4.5:1 threshold, so the primary button uses iron-600 instead. The
focus ring uses Golden Sandstone (gold-500), GOV.UK style.

Only a light theme was supplied, so only a light theme is implemented. Dark mode
can be added later by defining a second set of role tokens under a
`@media (prefers-color-scheme: dark)` block or a `[data-theme="dark"]` selector;
the components already read from the role tokens, so no component CSS would
change.

## Accessibility notes

- Semantic landmarks (`header`, `nav`, `main`, `footer`) on every page
- One `h1` per page and a correct heading order (audited)
- Skip-to-content link
- Visible keyboard focus everywhere; `prefers-reduced-motion` respected
- Tabs follow the WAI-ARIA Tabs pattern (arrow / Home / End keys, deep-linkable
  by `#panel-id`)
- FAQs use native `<details>`/`<summary>` so they work without JavaScript
- The data table uses real `<th scope>` headers and a caption
- Decorative SVG icons are `aria-hidden`; the hero image has a text alternative

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
  Day, Session, Flight and Name are required; optional are Club, Instagram, Age,
  Class, Best total, GLP, Open IPF, and per session Weigh-in, Lift off and
  Session name. Only columns that have something in them are shown, so use Best
  total and/or GLP depending on the competition. Within a flight lifters are
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
  sheet is shared with "anyone with the link". The first row of the sheet is used
  as the table heading, and blank rows and columns are ignored. To move the
  records elsewhere, edit the entry and paste the new link; leaving the link
  blank hides that table. Google refreshes published sheets every few minutes.
- All user-written Markdown is sanitised before it is shown on the site.

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

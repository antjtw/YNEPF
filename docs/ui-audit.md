# UI audit: spacing, grouping and hierarchy

Branch `ui-refinements`. Method and principles: see the project skill at `.claude/skills/ui-gestalt/SKILL.md`.

This started as a first pass over the editor (CMS) tabs and the new public pages, using screenshots at
1280px and 390px wide with realistic sample data. A full pass then fixed most of it: see
**Status after the full pass** at the end.

**How to read it.** Each finding has an ID, the principle it breaks, where it is, how bad it is
(High, Medium, Low), the proposed fix and rough effort (S: under an hour, M: a few hours, L: a day).

## What is already working

- The design tokens are used consistently: there is no raw `px` or `rem` spacing in the JavaScript.
- Dialogs (for example Edit volunteer) are well grouped: clear heading, consistent field gaps, buttons
  at the bottom, a visible focus ring.
- Form controls share one style across the editor and the public pages.
- Tables and cards have a consistent surface and corner radius.
- The tab bar and the sub-tab bar are clear, with a visible current state.

## Systemic findings (fix once, many screens improve)

### S1. On phones, three spacing steps collapse into one (High, S)
`--space-3`, `--space-4` and `--space-5` are all 15px below the tablet breakpoint (`tokens.css`).
Anywhere a layout relies on the difference between "fields in a group" (`--space-3`) and "groups in a
card" (`--space-5`), that difference disappears on a phone. This explains many of the "everything is
equally spaced" problems on mobile.
**Fix:** give each step a distinct value on mobile (for example 5, 10, 15, 20, 25, 30, 40, 50, 60), then
re-check the public pages, because the tokens are shared.

### S2. Collapsible sections have no styling (High, S)
`details.ol-settings` has no CSS rules at all. The Referees, Import and Helpers sections on the points
screen, and "Who has signed up" on the rota, render as bare text on the page background with the browser's
black triangle. Opened, they run into the next section. See `admin-points-sections.png`.
**Fix:** one `details` component: a surface and border, padding, a chevron marker that rotates, a
`--space-4` gap between sections.

### S3. Text-only buttons have no boundary and look indented (Medium, M)
Most editor actions (Edit session, Add place, Close sign-up, Copy the link, Take points away, Add a
person, Close) are ghost buttons: text only, with side padding. They are hard to spot as buttons, and a
left-aligned one sits visibly in from the content edge.
**Fix:** define the hierarchy: one primary per region, outlined secondary, and a text link style with no
side padding for quiet actions. Use the link style where the action sits at a left edge.

### S4. Spacing is set by 67 inline `style:` margins in the editor (Medium, M)
`admin.js` has 67 inline styles (13 of them `margin:var(--space-3)`, others one-offs). Spacing is
correct in isolation but the rhythm is set screen by screen, so similar screens differ.
**Fix:** add a few shared classes (vertical stack, section, section head with action, card header) and
replace the inline margins as screens are touched.

### S5. Tables: columns drift, numbers are left-aligned, actions do not line up (Medium, M)
- The Upcoming and Past tables on the Calendar have different column widths, so Date and Entry jump
  (about 26px) between them.
- Number columns (Points, Earned, Spent, history deltas) are left-aligned.
- The Actions column header sits left of its buttons.
- Short cells wrap ("0 of / 1", "Not / yet", "Valid / until").
**Fix:** fixed column widths per table type, right-aligned numbers and actions, no-wrap on short cells.

### S6. Where the main action lives changes from screen to screen (Medium, S)
Calendar: action in the page head, right. Points: actions in the head. Codes: button above the intro text.
Priority entry: button below the intro text. Rota sign-up: buttons below a link.
**Fix:** page head and section head patterns (title left, primary action right, intro below).

## Screen findings

### Competition, Details tab (`admin-competition-details.png`)
- **D1 (High, M). Online entry is one flat list of about 15 controls.** Events, equipment, prices,
  franchise, qualifying standard, hold minutes, priority, waiting list and guest delay all have the same
  gaps, so nothing groups. *Principle: proximity, simplicity.*
  **Fix:** labelled sub-groups of three to five: "What lifters can enter", "Prices", "Entry rules",
  "Priority and waiting list". Tighter gaps inside, a visible step between.
- **D2 (Medium, S). Events and equipment checkboxes are one unlabelled block of four.** "Offer full power /
  bench only / classic / equipped". *Principle: common fate.* **Fix:** two fieldsets with legends.
- **D3 (Medium, S). The volunteer priority tickbox sits among text fields.** It belongs with the priority
  hours field. (Resolved by D1.)

### Competition, Codes and links tab (`admin-codes-tab.png`)
- **C1 (Medium, S). Cramped and wrapped cells.** The Code column takes most of the width while Used,
  Valid until and Status wrap. (Part of S5.)
- **C2 (Medium, S). Row actions are stacked vertically** (Copy above Delete), so a one-line row becomes
  two lines. **Fix:** an inline, right-aligned action group.
- **C3 (Low, S). Three sections with the same heading weight and the same gaps** (Discount codes, Who has
  used a code, Priority entry). **Fix:** `--space-8` between sections, with a hairline above each heading.
- **C4 (Low, S). Empty state is a plain line of text** ("No code has been used yet"). **Fix:** a calm
  empty-state block.

### Competition, Volunteers tab / rota builder (`admin-volunteers-tab.png`, `-mobile.png`)
- **V1 (High, M). The sign-up controls are a flat stack on the page background.** Status sentence, link,
  three buttons, close-time field, T-shirt toggle and the signed-up list are seven items with no common
  region, and the link wraps. *Principle: common region.*
  **Fix:** one "Sign-up" card with a status chip and the open/close control together, the link in a
  copy field, the settings below a hairline.
- **V2 (High, M). The hierarchy under each role is inverted.** A person's name is bigger than the role
  heading they sit under, and people are not indented, so they do not read as belonging to the role.
  Every empty role also gets a full heading row, so a session with 12 roles is 12 rows of mostly "No
  places yet". *Principle: hierarchy, closure.*
  **Fix:** role heading as a small muted label; person rows indented under it with a left rule; empty roles
  collapsed to a single compact line or an "Add a role" menu.
- **V3 (Medium, S). "Add place" is far from the role it belongs to** (about 700px away on desktop, on its
  own line on mobile). *Principle: proximity.* **Fix:** put it beside the role label.
- **V4 (Medium, S). The same warning appears twice**: a red summary box at the top and a large pink box
  inside each affected row. **Fix:** a compact inline marker on the row, and keep the summary short or
  drop it.
- **V5 (Medium, S). Row height jumps** (about 40px for an empty role, 90px for a filled one with a
  warning, and a heavy full-width dropdown for an empty place). *Principle: continuity.* **Fix:** a steady
  row height and a compact select.
- **V6 (Medium, M). On a phone the person buttons wrap raggedly** (Arrived, No show, Told us on one line,
  Edit and Remove on the next). **Fix:** keep Arrived and No show, move Told us, Edit and Remove into a
  small overflow menu; or stack them as an even grid.
- **V7 (Medium, S). The tab opens with a six-line paragraph** that mixes set-up and "on the day" rules.
  **Fix:** two lines up top; put the on-the-day rules in a collapsible next to the sessions.
- **V8 (Low, S). Publishing sits at the very bottom of a long page.** **Fix:** show the draft/published
  status near the top, with the controls kept at the bottom.

### Volunteer points, editor (`admin-points-sections.png`, `admin-points-history.png`)
- Sections (Referees, Import, Helpers): see S2.
- **P1 (Low, S). Wording bug:** "1 committee members earn 3 points" (should be "1 committee member
  earns"). The summary sentence is also long. **Fix:** pluralise, and split into two short lines.
- **P2 (Medium, S). History opens below the list, away from the row you clicked,** so in a long list you
  scroll to find it. *Principle: proximity.* **Fix:** a dialog or an expanded row.
- **P3 (Medium, S). The native file input ("Choose File") is unstyled** and looks out of place.
  **Fix:** style it as a secondary button with the chosen file name beside it.
- **P4 (Low, S). "Take points away" has the same quiet style as "Add a person".** Destructive and
  neutral actions look alike. *Principle: similarity.*

### Public: Volunteer points (`public-points-spend.png`)
- **U1 (High, M). "Spend your points" is a five-step flow in one unboxed column on the page background**
  (email, code, balance, unused codes, choose, get). Nothing says where you are, and finished steps stay
  fully open. *Principle: common region, flow.*
  **Fix:** one card; number the steps; fold the steps that are done; show the balance as a small summary
  tile.
- **U2 (Medium, S). The status message touches the button** ("Show my points" and the result line have no
  gap). **Fix:** a status slot with `--space-3` above it.
- **U3 (Medium, S). Unused codes are a default bulleted list** with the button on its own line below,
  unlike the editor's item rows. **Fix:** the shared item-row, with the button on the right.

### Public: Volunteer sign-up form (`public-volunteer-form.png`)
- **F1 (Medium, S). A box inside the card:** the "Please tell us in advance" note has its own border and
  padding inside the form card, so it is double-inset and heavy. **Fix:** lighten it (no border, an
  icon or a left rule) or move it above the card.
- **F2 (Medium, S). Role checkboxes are packed tight** (about 10px apart, against 24px between fields),
  and sessions are not enclosed. **Fix:** a fieldset per session with a legend, roomier checkbox gaps, two
  columns on desktop.
- **F3 (Low, S). The "I am 18 or over" tickbox floats** above the privacy note and the button.
  **Fix:** group the consent, note and button as one block.

## Not yet audited (needs richer sample data)

- Public rota page (the harness did not render it) and the calendar card action row with the new
  Volunteer and rota buttons.
- Entries tab, lifting order builder, waiting list, extras and money tabs, and the News, Home,
  Organisation, Records, FAQs and Footer editors. The screenshots exist but I have only skimmed them.
- The entry form (`enter`).

## Suggested order

1. **Foundations (S1, S2, S3, S5, S6):** tokens, the `details` component, button hierarchy, table
   defaults, page and section head. Everything else builds on these, and they change many screens at
   once.
2. **Volunteers tab (V1 to V8):** the screen you use most, with the most issues.
3. **Competition Details (D1 to D3)** and **Codes tab (C1 to C4).**
4. **Public pages (U1 to U3, F1 to F3).**
5. **Remaining editor screens**, once the shared components exist.

After each batch: re-shoot at 1280 and 390, run the tests and the accessibility checker, and compare.

## How these screenshots were made

A static server on the repo root, Playwright, and a stand-in for the database seeded with sample
volunteers, sessions, codes and points. The tests and that stand-in live outside the repo, so the
screenshots in `docs/ui-audit/` are the record. The recipe is described in the skill.


## Status after the full pass

Legend: **Done**, **Partly** (what is left is noted), **Not done**.

### Systemic
| ID | Status | What changed |
|---|---|---|
| S1 | Done | Phone spacing steps are now distinct: `--space-3` 12px, `--space-4` 15px, `--space-5` 18px (tablet and up unchanged). |
| S2 | Done | `details.ol-settings` is a proper region: surface, border, padding, rotating chevron. Used by Referees, Import, Helpers, Who has signed up, How the day works and OpenLifter settings. |
| S3 | Partly | The Home page cards use outlined Edit buttons (one filled primary per region); Edit session and Copy the link are outlined; Delete and Remove sit apart from neutral actions; ghost actions on phones and calendar cards get an outline so they read as buttons. A full redefinition of the button set was not attempted. |
| S4 | Partly | New shared classes (`section-head`, `stack`, `rota-*`, `vol-card`, `chip`, `empty-state`, `flow-*`) replace the inline margins on the rota, codes, priority, extras and points screens. The remaining inline margins elsewhere in `admin.js` are untouched. |
| S5 | Done | Numbers and actions are right-aligned on the points, history, codes, priority, money, extras and calendar tables; short cells do not wrap; the calendar's two tables share column widths; the public rota's tables share column widths. |
| S6 | Done for Codes, Priority, Extras and the rota | Heading on the left, primary action on the right, intro below. The Money tab keeps its toolbar of three buttons above the content. |

### Screens
| ID | Status | Note |
|---|---|---|
| D1, D2, D3 | Done | Online entry is split into Events, Equipment, Prices, Franchise and qualifying, Entry rules, Priority and the waiting list. |
| C1 to C4 | Done | Fixed columns, inline actions, hairline between sections, calm empty states. |
| V1 | Done | Sign-up and Publishing are cards, with the link in a copy field and a status row (Sign-up Open, Rota Published) at the top. |
| V2, V3, V5 | Done | Role names are small muted labels with "Add place" beside them; people sit under their role with a left rule; roles with nobody are one row of "+ Role" chips; steady row height. |
| V4 | Done | One compact warning on the row; the summary at the top is one short line. |
| V6 | Done | On a phone the person buttons become an even grid, with Remove place on its own full-width row. |
| V7, V8 | Done | Two-line intro; the day-of rules are in "How the day works". |
| P1, P2, P3 | Done | Singular and plural fixed; History opens under the person's row; the file chooser matches the secondary button. |
| P4 | Partly | Delete-style actions are separated; "Take points away" is still a quiet action. |
| U1, U2, U3 | Done | Spend your points is one card with numbered steps, a stat row (points, set aside, to spend), a status line with space above it, and unused codes as rows. |
| F1, F2, F3 | Done | The notes are quiet left-ruled notes; each session is its own group with roles in columns; the consent, privacy note and button are one block. |

### Found during the pass
- Entries desk: the lift, flags and money columns drifted from row to row (the grid was sized per row), and the "+" marker sat outside the card. Fixed.
- Reorder arrows: an arrow that cannot be used became a grey blob that looked more important than the live ones. It now fades.
- Calendar cards: the entry status was a bullet that looked like part of the description. It is a line of its own.
- Entry journey: "Before you start ... held for 15 minutes" appeared next to "Entries are closed", "not found" and the waiting list. Hidden on those pages. The step marker is a labelled progress bar. The payment error (for example "stripe.js did not load") was plain text and is now styled and announced as an alert. Total to pay is emphasised. The hold countdown is prominent and turns red when it runs out. On phones the side panels have room above them. The confirmation heading no longer shows a black focus box.
- Phone footer: the columns ran into each other. Spaced.

### Not covered
- Waiting list, Results and Users tabs, the lifting order builder's internals, and the News, Records, FAQ, Footer and Organisation editors beyond the arrows and button changes above.
- The Stripe embedded checkout itself (it renders from Stripe, not from this site).
- A real phone: everything here was checked with a browser at 390px wide, not on a device.

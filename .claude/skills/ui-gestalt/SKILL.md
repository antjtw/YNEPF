---
name: ui-gestalt
description: Review or build layouts for the YNEPF site and editor using Gestalt principles (proximity, common region, similarity, continuity and alignment, hierarchy, closure) with this project's spacing tokens and components. Use when asked to audit, tidy or build UI in the CMS (admin) or the public pages, or when you see spacing, padding, grouping or alignment problems.
---

# Gestalt design for the YNEPF site and editor

People do not read a screen element by element. They see groups first. Spacing, boxes, alignment and
weight tell them what belongs together and what matters most. Most "spacing issues" are really grouping
issues: the screen is telling the wrong story about what goes with what.

Use this skill to **audit** a screen (find where the grouping story is wrong) and to **build** new
screens that tell it right the first time.

## The rule that fixes most problems

**Gaps inside a group are smaller than gaps between groups, by a visible step (at least 1.5 times).**
If a label, its help text and its field are 5px apart, and the next field is 15px away, that works. If
every gap is 15px, nothing is grouped and the page reads as one long list.

## Project tokens (assets/css/tokens.css)

Spacing steps, from tight to loose: `--space-1` 5px, `--space-2` 10px, `--space-3` 15px, `--space-4`,
`--space-5`, `--space-6`, `--space-7`, `--space-8`, `--space-9`. Never write raw `px` or `rem` margins or
padding. Always use a token. (The codebase already does this: no raw spacing in the JS.)

**Watch out on phones:** `--space-3`, `--space-4` and `--space-5` are all 15px below the tablet
breakpoint, so three different intentions look the same. When grouping depends on the difference between
those steps, check it at 390px wide, and reach for `--space-2` and `--space-6` or above to keep the step
visible.

### Working scale (use these roles, not ad-hoc numbers)

| Role | Token | Notes |
|---|---|---|
| Label to its help text or input | `--space-1` | Tightest: one unit |
| Items in a row (buttons, tags) | `--space-2` | Buttons side by side |
| Field to field inside one group | `--space-3` | Same group, same card |
| Group to group inside one card | `--space-5` or `--space-6` | Visible step up |
| Section to section on a page | `--space-7` or `--space-8` | With a heading, optionally a rule |
| Card inner padding | `--space-5` to `--space-6` | Same on every card |

## The principles, applied here

### 1. Proximity: near means related
- Put a control next to the thing it changes. A role's "Add place" belongs beside the role name, not
  700px away at the far edge.
- A message about a button (status, error, result) sits just under it, with `--space-3` above, never
  jammed against it.
- Help text hugs its label, not the previous field.
- **Check:** squint at the screen. Do the blobs match the real groups?

### 2. Common region: a box says "these go together"
- Use a card (`.card` or the panel surface) for each real group: the sign-up controls, one session, one
  step of a flow. Do not box everything: boxes inside boxes add padding twice and look heavy.
- Collapsible sections (`<details>`) must look like a region too: border or surface, padding, a clear
  chevron. A bare summary on the page background does not read as a section.
- **Check:** count nesting. More than two levels of border or background in one area is too many.

### 3. Similarity: same job, same look
- One primary button per region (the main thing to do). Secondary actions are outlined. Quiet
  actions are text-only. Do not make five things look equally loud, or equally quiet.
- Destructive actions (Delete, Remove) look different from neutral ones, and sit apart from them.
- Tags and status chips use one pattern. Lists of people or items use the shared item-row, not a plain
  bulleted list.
- **Check:** if two things look alike, would a user expect them to behave alike?

### 4. Continuity and alignment: lines the eye follows
- Left edges line up: headings, text, fields and buttons share one left edge. Text-only buttons carry
  padding, so a left-aligned one looks indented. Nudge it, or avoid left-aligned text buttons.
- Table columns that mean the same thing line up between tables (Upcoming and Past). Numbers are
  right-aligned. The Actions column header lines up with its buttons.
- Rows keep a steady height. A row that grows from 40px to 90px when one cell fills makes the list jitter.
- **Check:** drag a ruler down the left edge, and down each table column.

### 5. Hierarchy and focal point: one thing first
- Page title, section heading, label and body text each have a distinct size or weight, and the order
  matches importance. If a person's name is bigger than the role heading it sits under, the nesting is
  upside down.
- One clear focal point per screen: the primary action or the main result.
- Long intro paragraphs push the real controls down. Keep intros to two or three lines. Move details to
  help text near the control that needs it, or into a collapsible.
- **Check:** can you say what the screen is for after one second?

### 6. Closure and simplicity: fewer shapes
- Empty states should be calm and short, not a full row of chrome per empty slot. Twelve "No places
  yet" rows tell the user nothing twelve times.
- Repeating the same warning in a summary box and again in each row is noise. Pick one place.
- Group a long flat form (15 controls in one list) into labelled sub-groups of three to five.

### 7. Common fate and flow: things that change together move together
- Steps in a flow (ask for a code, enter it, choose, get the result) should read as a sequence: number
  them or reveal them in order, and fold or dim steps that are done.
- Related checkboxes (events, equipment) share a legend, like a fieldset.

## How to audit a screen (recipe)

1. Run the site locally (a static server on the repo root; see the audit notes in `docs/ui-audit.md`).
2. Screenshot each screen at 1280px and 390px wide, full page. Sign in as an editor for the admin tabs.
   Use realistic data: several rows, one empty state, one long name, one error.
3. For each screen walk the principles above. Write down: **what is wrong, which principle, where
   (selector or file), how bad (high / medium / low), the fix, and the effort.**
4. Check the two traps: the collapsed tokens on mobile, and any inline `style:` margin in the JS that
   should be a shared class.
5. Group the fixes into batches that can be shipped and checked together (see below).

### Severity guide
- **High:** a group is wrongly split or merged, or the hierarchy is inverted, on a screen people use
  every week.
- **Medium:** inconsistency or noise that slows people down or looks unfinished.
- **Low:** polish.

## How to build or fix

- Prefer shared classes over inline styles. If you are about to write the same `style: "margin:..."` a
  third time, make it a class (for example a vertical stack, a section, a card header).
- Standard patterns in this project:
  - **Page head:** title on the left, the one primary action on the right, a short intro below.
  - **Section head:** `h2` with its action on the same row, a short intro below, then the content.
  - **Card:** padding `--space-5` or `--space-6`, content gaps `--space-3`, group gaps `--space-5`.
  - **Item row** (`.item-row`): main text on the left, actions grouped on the right, a hairline
    between rows.
  - **Table:** fixed column widths, numbers right-aligned, actions right-aligned.
  - **Form group:** a legend or heading, fields `--space-3` apart, `--space-6` between groups.
- Use the existing form controls (`.control`, `.field`). Do not restyle a native input from scratch.
- After a change, re-shoot the screen at 1280 and 390 and compare. Run the project tests and the
  accessibility checker: contrast and focus states must survive any restyle.

## Do not
- Add a box just to add a box.
- Fix grouping by adding more space everywhere. Space only groups when it varies.
- Rely on colour alone to group or to signal state.
- Change a shared token without checking every page that uses it: the public site and the editor share
  `tokens.css`.

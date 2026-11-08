# YNEPF website: the editor's guide

This guide is for anyone who looks after the content on the Yorkshire & North East Powerlifting Federation website. You do not need to be technical. If you can use Google Sheets and fill in a form, you can run this site.

It covers, in order:

1. [The big picture](#1-the-big-picture)
2. [Getting access (and how admins give it)](#2-getting-access-and-how-admins-give-it)
3. [Finding your way around the editor](#3-finding-your-way-around-the-editor)
4. [Calendar: competitions](#4-calendar-competitions)
5. [Calendar: other events (AGMs, referee courses)](#5-calendar-other-events-agms-referee-courses)
6. [Lifting orders: the full guide to the spreadsheet](#6-lifting-orders-the-full-guide-to-the-spreadsheet)
7. [Records: the full guide to the spreadsheets](#7-records-the-full-guide-to-the-spreadsheets)
8. [News posts](#8-news-posts)
9. [Organisation (the Committee page)](#9-organisation-the-committee-page)
10. [FAQs](#10-faqs)
11. [Footer links](#11-footer-links)
12. [The Contact form](#12-the-contact-form)
13. [Your account](#13-your-account)
14. [Users (admins only)](#14-users-admins-only)
15. [Things that are not edited in the editor](#15-things-that-are-not-edited-in-the-editor)
16. [Troubleshooting](#16-troubleshooting)
17. [Quick checklists](#17-quick-checklists)
18. [For whoever looks after the technical side](#18-for-whoever-looks-after-the-technical-side)

---

## 1. The big picture

The website has two halves.

- **The public site.** What members and visitors see: the home page, Calendar, Records, News, Committee, FAQs, Contact and the rules pages.
- **The editor.** A private area at `/admin` (for example `https://your-site-address/admin`) where signed-in editors change the content. Nothing here needs code.

When you save something in the editor, it is stored in the site's database and the public pages read it straight away. There is no "publish" step to wait for, apart from small delays that are mentioned where they apply (for example, Google Sheets can take a few minutes to update).

Two kinds of spreadsheet feed the site. Both are normal **Google Sheets**, published to the web:

| Spreadsheet | Used for | Where you paste the link |
|---|---|---|
| Lifting order | One per competition. Shows who is lifting, in which session and flight. | Calendar tab > edit the competition > *Lifting order sheet* |
| Records | One per record table (for example Men's classic). | Records tab |

The site never writes to your spreadsheets. It only reads them. Editing a sheet changes the site; deleting a link from the editor never deletes the sheet.

### Words used on the site

- Always say **competition**, never "meet".
- Referees are **referees**. Do not call them judges.
- **Event** means a calendar entry that is not a competition (an AGM, a referee course and so on).

---

## 2. Getting access (and how admins give it)

### The two roles

| Role | Can do |
|---|---|
| **Editor** | Everything in this guide except managing users: Calendar, News, Organisation, Records, FAQs, Footer and their own Account. |
| **Admin** | Everything an editor can, plus the **Users** tab: add people, change roles, remove people. |

There must always be at least one admin. The system refuses to remove or demote the last one.

### What happens when an admin adds a user

This is the part that surprises people, so read it carefully.

**Adding someone on the Users tab does not send them an email or an invitation.** It only puts their email address on the list of people allowed in. Nothing else happens until that person signs in.

Think of it as writing a name on a guest list. The person still has to turn up at the door.

### What the new person must do

1. Go to the editor address (`/admin`).
2. Sign in using **the same email address the admin added**. There are two ways:
   - **Continue with Google.** Easiest. They pick the Google account with that email.
   - **Create your login.** They enter that email, their name and a password. The site then **emails them a confirmation link**. They must click it before they can sign in. (Check spam if it does not arrive; the email can take a few minutes.)
3. They land in the editor with the role the admin chose.

What can go wrong:

| What the person sees | Why | Fix |
|---|---|---|
| **"No access yet"** screen | They signed in with an email that is not on the list (a different Google account, or a typo) | An admin checks the Users tab and adds the exact address they used |
| No confirmation email | Spam folder, delay, or a typo in the address | Wait a few minutes, check spam, or use Continue with Google instead |
| Google button fails | Google sign-in is not switched on for the site | See [section 18](#18-for-whoever-looks-after-the-technical-side) |
| "Forgotten your password?" | They forgot it | See [section 13](#13-your-account) |

Tip for admins: after adding someone, message them yourself with the address to visit and which email to use. The site will not do that for you.

### Testing it yourself

To check the process works, add your own personal email as an Editor, then open `/admin` in a private or incognito window, sign in with that email (Google, or Create your login), and confirm you see the editor. Remove the test user afterwards if you no longer need it.

---

## 3. Finding your way around the editor

After signing in you see a row of tabs:

| Tab | What it controls |
|---|---|
| **Calendar** | Competitions and other events, shown on the Calendar page and the home page |
| **News** | Posts on the News page |
| **Organisation** | People on the Committee page |
| **Records** | The record tables on the Records page |
| **FAQs** | Questions and answers on the FAQs page |
| **Footer** | The links at the bottom of every page |
| **Users** | Who is allowed in (admins only) |
| **Account** | Your display name and password |

Things that work the same everywhere:

- **Forms open in a pop-up.** Press **Cancel** to close without saving.
- **Red messages** at the top of a form tell you what to fix before it will save.
- **Delete** always asks you to confirm. Deleting cannot be undone.
- **Arrows (↑ ↓)** reorder things where order matters (Organisation, FAQs, Footer, Records).
- **Times you type are UK time.** The site handles the change between GMT (winter) and BST (summer) for you.
- **Tab addresses can be bookmarked**, for example `/admin#news`.
- **Sign out** is at the top right.

---

## 4. Calendar: competitions

Open the **Calendar** tab. The page lists **Upcoming** and **Past** entries. Press **Add competition** to create one, or **Edit** on an existing row.

A competition moves from Upcoming to Past **automatically** after its last day. You never need to archive anything.

### Every field explained

| Field | What it does |
|---|---|
| **Name** | The title shown everywhere. Required. Example: "Yorkshire Open". |
| **Web address ending** | The last part of the lifting order link: `/lifting-order/<this>`. Filled in for you from the year and name (for example `2027-yorkshire-open`). Lower case letters, numbers and hyphens only. You can leave it alone. Changing it later breaks old links, so avoid that once the lifting order is shared. |
| **Tag (optional)** | A small coloured label next to the name, such as "Sponsor TBD". |
| **Number of spaces (optional)** | Shows "100 spaces" on the card. |
| **Description** | Short text under the name. Plain text with light formatting (see below). |
| **First day** | Required. The competition date. |
| **Last day** | Only for competitions over more than one day. Must not be before the first day. |
| **Venue** | Shown on the card and linked to Google Maps. |
| **Address or postcode (optional)** | Makes the Maps link more accurate. |
| **Custom map link (optional)** | Only if the automatic Maps link points to the wrong place. Must start with `https://`. |
| **OpenIPF results link (optional)** | Add after the competition, once results are on OpenIPF. Past competitions then show a "View results on OpenIPF" button that opens in a new tab. Must start with `https://`. |
| **Entry link** | Your entry form address (for example a Google Form or other entry system). See the next section. |
| **Entry opens / Entry closes (UK time)** | When the entry link goes live and disappears. See the next section. |
| **Entries full** | Tick when the competition fills before entry closes. See below. |
| **Waiting list link (Google Form)** | Where people join the waiting list while entries are full. |
| **Lifting order sheet (optional)** | The published Google Sheet link. See [section 6](#6-lifting-orders-the-full-guide-to-the-spreadsheet). |
| **Show on the website** | Untick to keep it as a **Draft** that the public cannot see. |

### Formatting in descriptions

The description box is plain text with a few simple extras:

- Start a line with `- ` (dash then space) for a bullet point.
- Make a link like this: `[words to click](https://example.com)`.
- Leave a blank line between paragraphs.

### How entry works (the timed link)

This is the most important feature to understand.

1. Paste your entry form address into **Entry link**.
2. Set **Entry opens** and **Entry closes** (UK time).
3. **Before entry opens**, the competition shows "Entry not open yet" and there is **no Enter now button**. The link is hidden by the database itself, so it cannot be found by looking at the page's code.
4. **At the opening time**, an **Enter now** button appears automatically.
5. **At the closing time**, the button disappears and the competition shows "Entry closed".

When you choose the first day, the site **suggests** an entry window: opens **8 weeks before at 9am**, closes **3 weeks before at noon**. Change either if your competition is different. If you type your own times first, the suggestion will not overwrite them.

Checks the form makes for you: entry must close after it opens, and links must start with `https://`.

### When entries fill up

Two ways to mark a competition full:

- In the Calendar list, press **Mark entries full** on its row, or
- Edit it and tick **Entries full**.

What visitors see then: the Enter now button is replaced by a message that all places are taken, and, **if you added a waiting list link**, a **Join the waiting list** button. The waiting list link is only shown while entries are marked full.

If a place opens up, press **Entries not full** on the row to reopen entries.

### The row of buttons on a competition

Visitors can see up to four buttons on a competition card:

1. **Enter now** (only while entry is open)
2. **Join the waiting list** (only while entries are full)
3. **View lifting order** (only once you have added a lifting order sheet)
4. After the competition, **View results on OpenIPF** (only once you add the OpenIPF link)

### A typical competition timeline

| When | What you do |
|---|---|
| As soon as it is confirmed | Add the competition: name, dates, venue, description. Paste the entry link and check the suggested entry times. |
| Entry opens | Nothing. The button appears by itself. |
| Entries fill | Mark entries full. Paste the waiting list link if you have one. |
| A few days after entry opens | Create the lifting order sheet and paste its link (section 6). |
| Update as lifters change | Edit the Google Sheet. The site follows it. |
| After the competition | Paste the OpenIPF results link. It moves to Past automatically. |

### Draft, edit and delete

- A **Draft** shows a pink "Draft" tag in the editor and does not appear on the public site.
- **Edit** changes anything. Saving is immediate.
- **Delete** removes it for good, after a confirmation.

---

## 5. Calendar: other events (AGMs, referee courses)

Not everything on the calendar is a competition. Use **Add another event** (next to *Add competition*) for AGMs, EGMs, referee courses, committee meetings open to members, and similar.

Events appear in the **same lists** as competitions, in date order, with a small **Event** tag, and archive themselves after their last day just like competitions.

### Event fields

| Field | What it does |
|---|---|
| **Title** | Required. For example "AGM 2027" or "Referee course". |
| **Tag (optional)** | Small label, for example "Members only". |
| **Description** | Same light formatting as competitions. Good place for agenda, who it is for, what to bring. |
| **Date** | Required. |
| **Last day** | Only if it runs over several days. |
| **Start time (UK time)** | Optional. Shown on the card, for example "7pm". |
| **End time (optional)** | Shown as "7pm to 8:30pm". Leave blank if open ended. |
| **Location** | Linked to Google Maps. Type "Online" for a video call. |
| **Address or postcode (optional)** | Sharpens the Maps link. |
| **Custom map link (optional)** | Only if the automatic link is wrong. |
| **Show on the website** | Untick for a draft. |

Rules the form checks: the end time must be after the start time on a single-day event, and you cannot give an end time without a start time.

Events have **no** entry window, waiting list, lifting order, spaces count or results link. If you need any of those, add it as a competition instead.

Put the joining link for an online event in the **description**, like this:

```
Join on Zoom: [click here](https://zoom.us/j/123456789)
```

---

## 6. Lifting orders: the full guide to the spreadsheet

A lifting order is the list of who lifts when. The website builds a clean public page from a Google Sheet that you keep up to date. Each competition has its own sheet and its own page at `/lifting-order/<web-address-ending>`.

### The big idea

- One **row per lifter**.
- The sheet is the master copy. Edit the sheet and the page follows (after Google refreshes the published copy, usually within a few minutes).
- The page only shows columns that have something in them, so you can use a simple sheet or a detailed one.

### Step 1: create the sheet and name the columns

Make a new Google Sheet. Put these headings in **row 1** (spelling and order of columns do not matter; capital letters do not matter).

**Required columns** (the page will not build without these four):

| Heading | What goes in it |
|---|---|
| **Day** | A number: `1` for the first day, `2` for the second, and so on |
| **Session** | A number: `1`, `2`, `3`... Numbered within the day |
| **Flight** | A letter or short label: `A`, `B`, `C`... |
| **Name** | The lifter's name |

**Optional columns** (add only the ones you want):

| Heading | What it does |
|---|---|
| **Club** | Also accepted: `Team` or `Gym`. Shown in small text under the lifter's name. |
| **Instagram** | A handle (`@name` or `name`) or a full profile link. The page shows **only the Instagram icon**, next to the name, never the handle itself. If the handle is not valid (letters, numbers, full stops and underscores, up to 30), no icon is shown and the editor warns you when you save the competition. |
| **Age class** | **Leave blank for Open.** Otherwise `J` (junior), `SJ` (sub-junior), `M1`, `M2`, `M3` or `M4` (masters 1 to 4). Spelt-out forms such as `Masters 2` are tidied up to `M2`. Anything else is shown as typed and flagged when you save. The column only appears if at least one lifter is not Open. Also accepted as the heading: `Age category`, `Division`. Do **not** put years of age here. |
| **Class** | Weight class with the sex prefix, for example `M66` or `F57`, `M120+`. Also accepted: `Weight class`. |
| **GLP** | The lifter's GL (good lift) points score. A number, shown without trailing zeros. |
| **Total** | Their best total in the last 24 months, in kg. Shown as "Total (kg)". Also accepted as the heading: `KG`, `Total (kg)`, `Best total`. Use GLP, Total or both, whichever the competition uses. |
| **Open IPF** | A full `https://` OpenIPF profile link. **Clicking the lifter's name then opens their OpenIPF profile.** Leave blank for lifters without one (novices, usually) and the name is plain text. |
| **Weigh-in** | A time for the session, for example `8:00am`. Also accepted: `Weigh in`, `Weighin` |
| **Lift off** | A time for the session, for example `10:30am`. Also accepted: `Lift-off`, `Liftoff` |
| **Session name** | A label for the session, for example `Morning` or `Prime Time`. Also accepted: `Session label` |

### Step 2: fill in the rows

Example:

| Day | Session | Flight | Name | Club | Instagram | Age class | Class | GLP | Total | Open IPF | Weigh-in | Lift off | Session name |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | A | Jo Smith | Leeds PL | @josmith | J | F57 | 78.2 | 345 | https://www.openipf.org/... | 8:00am | 10:30am | Morning |
| 1 | 1 | A | Pat Jones | York Barbell | @patj | | M66 | 82.5 | 410 | | | | |
| 1 | 1 | B | Sam Lee | Hull Strength | | M2 | M74 | 85 | 520 | | | | |
| 1 | 2 | A | Alex Kay | Leeds PL | | | M83 | 88.1 | 610 | | 12:30pm | 2:00pm | Afternoon |

A ready-made example is in `docs/mockups/sample-lifting-order.csv`. Import it into Google Sheets to use as a template.

On the page each lifter's **name cell** holds everything about the person: the name (a link to OpenIPF if you gave one), the Instagram icon (if valid) and the club underneath. Then come their age class, weight class, GLP and total. Lifters are grouped by day, then session, then flight, with the weigh-in and lift off times above each session.

Things worth knowing:

- **A row is ignored** if it is missing a name, a number in Day, a number in Session or a Flight. Blank rows are fine.
- **Day numbers become real dates.** Day 1 is the competition's *First day*, day 2 the next, and so on. The page prints "Day 1: Saturday 13 March 2027" for you. This is why the competition's dates must be right.
- **Session times and name only need to be on one row of the session.** The first non-empty value in that session is used.
- If there is **no Session name**, the page calls it "Session 1", "Session 2" and so on.
- **Order within a flight.** Normally lifters are shown by **weight class (lightest first), then GLP (highest first)**. If a session is named exactly **Prime Time**, the sheet's own row order is kept instead, so you can set the running order by hand.
- **Flight labels are sorted as text.** Use letters (`A`, `B`, `C`) rather than numbers. Numbers sort as text, so `10` would appear before `2`.
- Keep the data in **one tab** and keep row 1 as the headings. Extra notes elsewhere in the sheet are not read if you publish only that tab.
- Do not merge cells.

### Step 3: publish the sheet to the web

The site needs a public CSV link to read the sheet. This does **not** make the sheet editable by the public. It makes a read-only copy available.

1. In Google Sheets choose **File > Share > Publish to web**.
2. In the first drop-down, choose **the specific tab** that holds the lifting order (not "Entire document").
3. In the second drop-down, choose **Comma-separated values (.csv)**.
4. Press **Publish** and confirm.
5. **Copy the link** Google gives you. It looks like `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv`.

Leave "Automatically republish when changes are made" ticked so edits keep flowing through.

### Step 4: add the link to the competition

1. Editor > **Calendar** > **Edit** the competition.
2. Paste the link into **Lifting order sheet (optional)**.
3. Press **Save changes**.

After saving, the editor **checks the sheet straight away** and tells you, for example: "Lifting order read fine: 74 lifters in 9 flights." If something is wrong it tells you what ("The sheet needs columns called Day, Session, Flight and Name", or "That link returned a web page, not data. Publish the sheet to the web as CSV.").

A **View lifting order** button now appears on the competition, beside Enter now.

A normal share link also works if the sheet is shared with "anyone with the link", but the **Publish to web** link is the most reliable.

### Step 5: keep it up to date

Edit the Google Sheet whenever lifters move or withdraw. The public page follows it. There is a short delay while Google refreshes the published copy (usually a few minutes), so do not worry if a change is not instant.

### Lifting order checklist

- [ ] Row 1 has Day, Session, Flight and Name
- [ ] Day and Session are numbers; Flight is a letter
- [ ] The competition's First day (and Last day) are correct
- [ ] Published the correct **tab** as **CSV**
- [ ] Pasted the link in the competition and saw the green "read fine" message
- [ ] Opened `/lifting-order/<ending>` and looked it over on a phone

---

## 7. Records: the full guide to the spreadsheets

The Records page shows one section per record sheet (for example Men's equipped, Men's classic, Women's equipped, Women's classic). Each section is read live from its own Google Sheet.

### Two kinds of sheet

The site recognises two layouts and picks the right one by itself. You never choose.

**1. The divisional records layout (what YNEPF uses).** This is the working sheet with one block per weight class. The page turns it into a clear grid for each class, with the lifts down the side (Squat, Bench press, Deadlift, Total, Bench (A/C)) and the age classes across the top. Each box shows the **weight in bold, the record holder and the date**. Where nobody has beaten the qualifying standard yet, the box shows the weight with a small **Standard** tag. Where there is no record and no standard, it shows a dash.

How the sheet must be laid out for this to work:

- **Row 1** is the title, for example `BP - Yorkshire North East Divisional Records - WOMEN - CLASSIC - updated 1st November 2026`. If it contains the words "updated ...", the page shows "Updated 1st November 2026" above the grids.
- **A weight class starts** on a row with the class in **column A** (for example `-66kg`, `84kg+`) and the age classes across the same row (`u16`, `u18`, `u23`, `open`, `m1` to `m4`). A class can have fewer age classes than the others (the lightest class often has only u18 and u23).
- **Each lift** has its history and then the **current record**, which sits on a row with the lift's name in **column B** (`SQUAT`, `BENCH`, `DEADLIFT`, `TOTAL`, or `BENCH (A/C)`) and uses **three rows**: the weight on the lift's row, the **holder's name** on the next row, and the **date** on the row after. In the name row, `standard` means nobody has beaten the standard yet.
- The **last** row carrying a lift's name before the next lift starts is read as the current record. Everything above it (the standards and the history of who held the record before) is ignored, so keep that history in the sheet as much as you like.
- Dates such as `5/4/2017` are shown as `05/04/2017`.
- Everything else is shown as typed. Names such as `Jo Smith (U)` appear exactly like that.

A small example in the same layout is in `docs/mockups/sample-records.csv`.

**2. Any other sheet.** If the layout is not recognised, the sheet is shown as a plain table instead:

- **Row 1 is the table heading row.** Whatever you type there becomes the column headings.
- **Every other row is a record**, shown in the order they appear in the sheet.
- The **first column becomes the row label** (it is shown in bold, and is what screen readers announce first).
- Everything is shown **exactly as typed**. **Blank rows are skipped.** Empty columns at the right-hand side are trimmed.

### Tabs, searching and jumping around

Each record sheet you add in the editor becomes a **tab** on the Records page, in the order you set with the ↑ ↓ arrows. The first one is open when the page loads, and visitors switch with a click or the left and right arrow keys. A link such as `/records#women-s-classic` opens a particular tab.

Visitors can **search across every tab** at once (by name, class, lift or weight). While they search, each tab shows how many matches it has, and the page moves to a tab that has some. Within the grids, classes with no match are hidden and matching boxes are highlighted. Under the tabs, each sheet has a row of weight class buttons to jump straight to a class.

### Publish the sheet and add it to the site

1. Open the Google Sheet tab for that table (one tab per table, for example Women's classic).
2. **File > Share > Publish to web**.
3. Pick **the specific tab** (not "Entire document").
4. Pick **Comma-separated values (.csv)**.
5. Press **Publish** and **copy the link**.
6. In the editor go to **Records** and press **Add record sheet**.
7. In **Heading on the page**, type the title, for example `Men's classic`.
8. Paste the link into **Google Sheets link** and press **Add**.

Reload the Records page to check the grids appear and a few of the numbers match your sheet. The page always reads the sheet itself, so there is nothing to copy in: **update the sheet and the site follows within a few minutes.**

### The "Submit a record" button

At the top of the Records page, above the search box, there is a **Submit a record** button. It opens your record submission form (a Google Form) in a new tab, so lifters can send in a new divisional record.

To change where it goes: open the **Records** tab in the editor. The "Submit a record" form card sits above the list of tables. Press **Edit**, paste the new Google Form link and save. The link must start with `https://`. **Leave it blank to hide the button.**

Use the form's normal link (the one ending `/viewform`) from the Google Form's **Send** button. If the Edit button is missing and the card says to run the latest `schema.sql`, ask your technical admin to do that first. Until then the button uses the standard form.

### Managing record tables

- **Order:** use the ↑ ↓ arrows to reorder tables on the page.
- **Edit:** change the heading or paste a new link (this is how you move records to a different spreadsheet later; nothing else needs touching).
- **Hide a table without deleting it:** edit it and clear the link. Entries with no link are hidden from the public page.
- **Delete:** removes the table from the Records page only. **Your Google Sheet is not touched.**
- Changes you make in the sheet appear on the site within a few minutes.

If a table fails to load, the page shows "We could not load these records just now" and a link to open the sheet directly. The usual cause is the sheet not being published as CSV.

---

## 8. News posts

Open the **News** tab and press **New post**.

| Field | What it does |
|---|---|
| **Title** | Required. |
| **Post date (UK time)** | Required. Defaults to now. See scheduling below. |
| **Web address ending** | Made from the title for you (letters, numbers, hyphens). Used in the post's link. |
| **Post** | The body, written in a visual editor. |
| **Published** | Untick to save as a **draft** that only editors can see. |

The **author** is filled in automatically from the editor's display name. You do not choose it, which is why it is worth setting your name properly under [Account](#13-your-account).

### Writing the post

- The editor works like a word processor. Use the toolbar for **headings, bold, italic, lists, quotes, tables and links**.
- **Links:** select text and press the link button.
- **Pictures** can be added to posts (see the next section). They are not available in FAQ answers or event descriptions.
- If you prefer, you can switch to **Markdown** at the bottom of the editor.

### Adding a picture to a post

1. In the post editor, put the cursor on an **empty line between paragraphs**. That is where the picture will sit.
2. Press the **picture button** in the toolbar. (You can also paste a picture or drag one into the editor, which opens the same step.)
3. **Choose a picture** from your computer (or drop one into the box). It appears as a preview, with a note such as "shrunk from 4.2 MB to 180 KB". The site shrinks every picture for you, so there is no need to resize anything first.
4. **Describe the picture** in a few words, for example "Lifters warming up before the first flight". This is required. It is read out to people using screen readers and shown if the picture cannot load.
5. Press **Add image**. It uploads and appears in the post.

How pictures look: each one runs the **full width of the text**, on its own line between the paragraphs above and below. There are no side-by-side pictures and no text wrapping. A very tall picture is capped at a sensible height (with the whole picture still shown), so it never takes over the page.

Good to know:
- Use JPG, PNG or WebP pictures. iPhone HEIC pictures may not open: export them as JPG first, or take the picture with "Most Compatible" in the camera settings.
- Camera details such as the location are removed when the picture is shrunk.
- To remove a picture, select it in the editor and delete it, like any text. The file stays in storage, which is harmless.
- Only pictures added through this button are shown on the site. Pictures linked from other websites are ignored.

### Scheduling

A post dated in the **future** appears automatically on that date and time. You do not need to come back and press anything. Post dates also decide the order: newest first.

### Statuses in the list

| Status | Meaning |
|---|---|
| Published | Live now |
| Scheduled | Published, but dated in the future, so not visible yet |
| Draft | Not published |

The **View** button in the list opens the post as visitors see it.

The latest three posts appear on the home page.

---

## 9. Organisation (the Committee page)

The **Organisation** tab controls the Committee page. It has **sections** (for example Committee, Referees, Regional contacts) and **people** inside each section.

- Sections run **top to bottom**; people run **left to right**.
- Use **Add section** to make a new group. Give it a title and an optional short description.
- Inside a section, **Add person**.

### Person fields

| Field | What it does |
|---|---|
| **Name** | Required. |
| **Role** | Required. For example "Finance Director" or "IPF Category I". |
| **Instagram (optional)** | A handle (`name` or `@name`) or a profile link. Shown as a link. |
| **What they do (optional)** | A short description. |

People without a photo get a circle with their initials.

### Reordering and removing

Use the ↑ ↓ arrows to reorder sections and people. **Edit** and **Delete** are on each row. Deleting a section deletes the people in it, after a confirmation.

---

## 10. FAQs

The **FAQs** tab controls the FAQs page. Questions sit under **category headings** (for example "Entering a competition", "Equipment").

- **Add category** to create a heading.
- Inside a category, **Add FAQ**.
- Each FAQ has a **Question** and an **Answer**. The answer uses the same visual editor as news posts, so links, lists and tables all work.
- Reorder categories and questions with the ↑ ↓ arrows.

### Linking to a category or a single question

Every category heading and every question has its own web address, made from its title, so you can link straight to it from news posts, emails or social media:

- A category: `faqs#yne-worlds` (the page scrolls to that heading). The editor shows each category's link under its name.
- A single question: `faqs#how-do-i-enter` (the page scrolls to it and opens the answer).

The address is the title in lower case with spaces and symbols turned into hyphens, so "YNE Worlds" becomes `yne-worlds` and "Entry & rules" becomes `entry-and-rules`. **If you rename a category or question, its address changes**, so old links to it will stop jumping to it (the page itself still opens). If two titles are the same, the second gets `-2` on the end.

Good FAQ habits:

- Write the question the way a lifter would ask it.
- Keep answers short, and link to the rules page for detail.
- The Contact form asks people to confirm they have read the FAQs first. Every time you answer the same email twice, add it here.

---

## 11. Footer links

The **Footer** tab controls the links at the bottom of every page. It is organised into **groups**. Each group has a **Where it appears** setting:

| Placement | Where it shows |
|---|---|
| **A column of links** | A headed column in the footer. The group title is the column heading. |
| **The bottom row** | The small row at the very bottom: privacy policy, franchise agreements, site editor and so on. These also appear in the slide-out menu. |
| **Social links under the logo** | Instagram, Facebook and similar. Here the group title is just a name for you. |

Each **link** has **Link text** and **Address**. An address can be:

- a full `https://` address (for example a **Google Doc** for the privacy policy or franchise agreements),
- a page on this site, such as `faqs.html`,
- an email link such as `mailto:entries@example.com`, or
- `#` as a **placeholder** until you have the real address. The list will remind you "# (placeholder: add the real address)".

Anything else is refused.

### Adding a Google Doc (privacy policy, franchise agreements)

1. In the Google Doc, choose **Share** and set **General access** to **Anyone with the link** (Viewer).
2. Copy the link.
3. Footer tab > find the link (or add one) > **Edit** > paste the link into **Address** > **Save**.

Footer changes show within about a minute.

---

## 12. The Contact form

There is nothing to manage in the editor for the Contact page. When someone uses the form, it is **emailed straight to the federation entries inbox** (ynepfentries@gmail.com unless your technical admin has chosen another address).

- The email's subject starts with **[Website]**, followed by the subject they wrote.
- It is sent so that **pressing Reply goes to the person who wrote in**, not to a no-reply address. Whoever looks after the inbox simply replies as normal.
- Nothing is stored on the website, so the inbox is the only record. Use your email app's labels or stars to track what still needs an answer.
- The form asks people to confirm they have read the FAQs first. If the same question arrives twice, add it to the [FAQs](#10-faqs).
- If email is not set up yet, visitors see "Sorry, your message could not be sent" with the inbox address to write to instead. See [section 18](#18-for-whoever-looks-after-the-technical-side).

---

## 13. Your account

The **Account** tab lets you change:

- **Display name.** This is the name shown as the **author on news posts**.
- **Password.** At least 8 characters. (If you only ever sign in with Google, you may not need one.)

### Forgotten password

1. Go to `/admin`.
2. Type your email in the sign-in form.
3. Choose **Forgotten your password?**
4. Open the email you are sent and click the link. It brings you back to the editor to choose a new password.

If you cannot get at that inbox, sign in with **Continue with Google** using the same email instead, or ask an admin.

---

## 14. Users (admins only)

The **Users** tab is visible only to admins.

### Adding a user

1. Press **Add user**.
2. Type their **email address**. It must match the address they will sign in with (their Google account, or the address they create a login with).
3. Choose **Editor** or **Admin**.
4. Save.

**This does not email them.** The site shows a reminder ("Ask them to sign in at this page with ...") but that is all. Tell them yourself to visit `/admin`, and which email to use. Section 2 has the full explanation of what they then do and what they will see.

### Changing a role

Use **Make admin** or **Make editor** on the user's row. You are asked to confirm. You cannot change your own role; your own row says "This is you".

### Removing a user

Press **Remove**. They lose access **immediately**. Their login still exists, but it can do nothing. If you add the same email again later, they get access again.

### Safety rules built in

- You cannot remove or demote **the last admin**.
- Someone who signs in with an email that is **not on the list** sees "No access yet" and can do nothing.
- Created logins must **confirm their email**, so nobody can sign in as someone else's address.

---

## 15. Things that are not edited in the editor

A few parts of the site are ordinary pages that a developer changes:

- The **home page** wording and the three cards.
- The **rules pages** (`/rules` and everything under it).
- The **Chairperson** page and other fixed pages.
- Colours, fonts, and layout.
- The **hero photo** on the home page.

If you need one of these changed, ask whoever maintains the site code. The repository `README.md` has an "Editing the rest of the site" section that explains how.

---

## 16. Troubleshooting

| Problem | Likely cause | What to do |
|---|---|---|
| I can see the editor but nothing loads | Database not connected, or you were signed out | Refresh. Sign out and back in. |
| "No access yet" after signing in | The email is not on the Users list | Ask an admin to add exactly the email you signed in with |
| Enter now button is missing | Entry is not open yet, has closed, or entries are marked full | Check Entry opens/closes (UK time) and the Entries full box |
| Enter now appears too early or late | Times were entered in the wrong hour | Check the times. They are UK time and the site handles BST |
| Lifting order says "needs columns called Day, Session, Flight and Name" | A heading is misspelt or in the wrong row | Check row 1 spelling. Headings can be in any column order |
| "That link returned a web page, not data" | The sheet was copied as a normal link rather than published | Redo **File > Share > Publish to web**, choose the tab and **CSV** |
| "The sheet could not be read" | The sheet is not published or sharing was switched off | Publish it again and paste the new link |
| Lifting order shows nobody | Rows are missing Day, Session, Flight or Name, or the wrong tab was published | Check each row and which tab you published |
| Lifters appear in the wrong order | Order is class then GLP, unless the session is named exactly "Prime Time" | Name the session "Prime Time" to keep your sheet order |
| Flights appear in strange order | Flight labels such as 10 and 2 sort as text | Use letters (A, B, C) |
| Records table says it could not load | Sheet is not published as CSV | Re-publish and edit the entry with the new link |
| A change in Google Sheets is not showing | Google takes a few minutes to refresh the published copy | Wait a few minutes and refresh |
| A news post is not showing | It is a draft, or dated in the future | Tick Published and check the post date |
| Footer link refused | Address is not https, a site page or `#` | Use a full `https://` address |
| Cannot find the Users tab | You are an editor, not an admin | Ask an admin |

---

## 17. Quick checklists

### Add a competition

- [ ] Calendar > **Add competition**
- [ ] Name, First day (and Last day if longer than one day)
- [ ] Venue (and postcode)
- [ ] Short description
- [ ] Entry link, then check the suggested **Entry opens / closes** times
- [ ] Leave **Show on the website** ticked, or untick to keep a draft
- [ ] Save, then look at the public Calendar page

### Add an event (AGM, referee course)

- [ ] Calendar > **Add another event**
- [ ] Title, date, start time (and end time), location
- [ ] Description, including any joining link or agenda
- [ ] Save, then check the Calendar page

### Publish a lifting order

- [ ] Sheet with Day, Session, Flight, Name (plus any optional columns)
- [ ] File > Share > Publish to web > the tab > CSV > Publish
- [ ] Paste the link into the competition's **Lifting order sheet**
- [ ] Confirm the "read fine" message
- [ ] Open `/lifting-order/<ending>` to check it

### Add a record table

- [ ] Sheet with headings in row 1 and the lookup column first
- [ ] Publish the tab as CSV
- [ ] Records > **Add record sheet**, enter heading and paste link
- [ ] Check the Records page

### Post a news item

- [ ] News > **New post**
- [ ] Title and date (future date = scheduled)
- [ ] Write the post, add links
- [ ] Keep **Published** ticked, then check the News page

### Add a new editor (admins)

- [ ] Users > **Add user**, enter email, choose role
- [ ] Tell them to go to `/admin` and sign in with that exact email (Google, or Create your login then confirm by email)
- [ ] Check they can see the tabs

---

## 18. For whoever looks after the technical side

Editors do not need this section.

- **Hosting:** the site is a static site on Vercel. The content database and sign-in are on Supabase.
- **Database:** the structure lives in `supabase/schema.sql` and the starting content in `supabase/seed.sql`. **When either changes, re-run `schema.sql` first and then `seed.sql`** in the Supabase SQL editor. Running `schema.sql` is safe on an existing database. It upgrades what is there and keeps your content.
- **Connection:** `assets/js/config.js` holds the Supabase project address and the **publishable** key, which is designed to be public. **Never put a secret key (`sb_secret_...` or `service_role`) in the repository.**
- **Google sign-in:** create a Web OAuth client in Google Cloud Console with the redirect address shown in Supabase under Authentication > Providers > Google, and paste the client ID and secret into Supabase. Free. Apple sign-in is possible but needs a paid Apple Developer account and yearly upkeep, so only add it if people ask. Only list a provider in `authProviders` in `config.js` once it is switched on in Supabase.
- **Sign-in addresses:** in Supabase, Authentication > URL Configuration, the Site URL and Redirect URLs must include the live site address (and any preview address you use).
- **First admin:** the first admin address is created by `schema.sql`. After that, admins manage users from the Users tab.
- **Contact form email:** the Contact page posts to the Edge Function in `supabase/functions/send-contact`, which emails the entries inbox through Resend with the sender as reply-to. Nothing is stored. Deploy it with Verify JWT off and add `RESEND_API_KEY` as a Supabase secret (never in the repository). Steps are in `README.md` under Contact form. Re-running `schema.sql` removes the old `contact_messages` table.
- **Rest of the site, design system, images, favicon, accessibility checks:** see `README.md`.
- **Build step:** `node build.js` inlines the shared header and footer into each page. Run it after changing `assets/partials/` and commit the result.
- **News pictures:** stored in a public Supabase Storage bucket called `news-images`, created by `schema.sql` (re-run it; if your project has no Storage the step is skipped, and you can make a public bucket of that name in the dashboard). Only editors can add or remove files; the bucket accepts only WebP or JPEG up to 2 MB, which is what the editor produces. Storage and bandwidth use the project's plan limits.
- **Pushing changes:** work on a branch and merge when ready. Vercel builds a preview for each branch.

---

*Keep this guide up to date. If you change how something works in the editor, change the matching section here.*

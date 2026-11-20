# Setup guide: the one-off steps

Every step you have to do yourself, in the order you will need them, written so the next person can follow it without help. Each step says where to click, what to copy, where to paste it, and **what you should see when it has worked**.

**Never paste a secret key into a chat, an email or a document.** Each step says where a key goes. Anything marked "secret" goes only into the box named in the step.

This guide grows as the entry system is built. Parts marked **(to be written)** are filled in just before they are needed.

**How we are testing:** on the `entry-system` branch, using your live Supabase project but only with unpublished **TEST** competitions and Stripe **test mode**. The branch's pages sit behind your Vercel login. No real money can move until Part 8.

| Part | What | Who | Needed for |
|---|---|---|---|
| 1 | Back up, then add the entry tables to Supabase | You | Everything else |
| 2 | A Stripe account and test keys | Treasurer | Testing payments |
| 3 | Putting the payment functions into Supabase | You | Taking a test payment |
| 4 | The Stripe webhook | You and treasurer | The system learning that a payment worked |
| 5 | `@ynepf.co.uk` email | You | Sending emails. See [email-setup-guide.md](email-setup-guide.md) |
| 5b | The club list | You | Lifters choosing their club (see below) |
| 6 | Making a TEST competition and entering it | You | Trying it end to end |
| 7 | Apple Pay domain **(to be written)** | Treasurer | Apple Pay and Google Pay |
| 8 | Going live **(to be written)** | Treasurer and you | Real money |

---

## Part 1: Back up, then add the entry tables

**Time:** about 10 minutes. Do this **before** anything else in Supabase.

**A. Back up.** In Supabase, open **Table Editor**. For these tables press the **...** menu then **Export** (CSV): `editors`, `competitions`, `posts`, `site_settings`. Keep the files somewhere safe. (If your project has **Database > Backups**, note the latest backup date too.)

**B. Run the two files.** In Supabase press **SQL Editor** then **New query**.

1. Open `supabase/schema.sql` in GitHub (branch `entry-system`), press **Raw**, select everything, copy. Paste into the SQL editor and press **Run**. It is safe to run again. It now includes the new roles.
   **What you should see:** "Success. No rows returned".
2. New query. Do the same with `supabase/entry-system.sql`.
   **What you should see:** "Success. No rows returned".

**C. Check you and Sabrina still have full access.** Open the site editor at `/admin`. You should still see every tab, including **Users** and the new **Entries** tab. If you ever see "no access", tell me straight away.

**D. Give the right people the right role.** In the editor, **Users**, press **Change role**:
- **Admin**: you, and anyone who adds or removes users.
- **Competitions team** (called Entries team in the database): whoever runs entries and volunteers.
- **Editor**: site content only. **Contributor**: news posts only.

---

## Part 2: A Stripe account and test keys

**Who:** your treasurer. Create the account under **the treasurer's own work email**, not a personal one. A second named person should be added later (Part 8).

**Time:** about 15 minutes. You do **not** need to finish Stripe's business verification to test.

1. Go to **dashboard.stripe.com/register** and create an account.
2. Switch **Test mode** (or a **Sandbox**) **on**. You should see an orange "Test mode" label.
3. Go to **Developers**, then **API keys**.
4. You will see two keys:
   - **Publishable key** (starts `pk_test_`): safe to share with me.
   - **Secret key** (starts `sk_test_`): **secret. Do not share it with anyone, not even me.** It goes only into Supabase (Part 3).

Useful to know: in test mode you pay with fake cards, for example `4242 4242 4242 4242` with any future date and any 3 digit code. No real money moves.

---

## Part 3: Putting the payment functions into Supabase

**Time:** about 20 minutes.

**A. Add the secrets.** In Supabase open **Edge Functions**, then **Secrets** (or **Project Settings > Edge Functions**). Add each of these, one at a time (name on the left, value on the right):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_test_...` key from Part 2 (**secret**) |
| `STRIPE_PUBLISHABLE_KEY` | the `pk_test_...` key |
| `SITE_URL` | the address of the test pages, with no slash at the end. In Vercel, open the project, **Deployments**, find the `entry-system` branch deployment and copy its address, for example `https://ynepf-micro-site-git-entry-system-yourname.vercel.app` |
| `RESEND_API_KEY` | already there from the contact form |
| `NOTIFY_TO` | `competitions@ynepf.co.uk` (copies of entry emails, and where replies go) |
| `MAIL_FROM` | `YNEPF Competitions <competitions@ynepf.co.uk>` (once the domain shows Verified in Resend) |
| `CONTACT_TO` | optional. Where contact form messages go. It defaults to `info@ynepf.co.uk`, so you do not need to add it |

**B. Create the two functions.** Under **Edge Functions** press **Deploy a new function** > **Via editor**, and do this twice:

1. Name `entry-checkout`. Replace the example code with everything in `supabase/functions/entry-checkout/index.ts` (GitHub, branch `entry-system`, **Raw**). Switch **Verify JWT** **off**. Deploy.
2. Name `stripe-webhook`. Same, with `supabase/functions/stripe-webhook/index.ts`. **Verify JWT off**. Deploy.

**What you should see:** both functions listed as **Active**.

---

## Part 4: The Stripe webhook

This is how Stripe tells us "that payment worked".

1. In Stripe (test mode): **Developers > Webhooks > Add endpoint**.
2. **Endpoint URL:** your Supabase project URL, then `/functions/v1/stripe-webhook`. For example `https://abcdefgh.supabase.co/functions/v1/stripe-webhook`.
3. **Events:** choose `checkout.session.completed` and `checkout.session.expired`. Add the endpoint.
4. Open the new endpoint and press **Reveal** under **Signing secret** (starts `whsec_`). **Secret.**
5. Back in Supabase, add one more secret: `STRIPE_WEBHOOK_SECRET` with that value.

---

## Part 5: Email

Follow [email-setup-guide.md](email-setup-guide.md). Until then, Resend's starter sender can only deliver to the email address the Resend account was created with, so use that address when you test.

---

## Part 5a: The confirmation page check

The page people land on after paying only says "You're in" once the payment is really confirmed. It asks a small function, `entry-status`, which returns a single word (paid, pending, refunded or unknown) and nothing personal.

1. In Supabase, **Edge Functions > Deploy a new function > Via editor**. Name it `entry-status`, paste in `supabase/functions/entry-status/index.ts`, switch **Verify JWT** **off**, and **Deploy**.

Until it is deployed, the confirmation page shows "Still confirming" after about a minute, so do deploy it before testing a payment.

---

## Part 5c: Cancelling and refunding entries

The **Cancel or refund** button on each entry in the editor uses a function, `entry-refund`. It checks the person is signed in and on the entries team before anything happens, sends the refund to Stripe, records who did it and why, frees the place, and emails the lifter.

1. In Supabase, **Edge Functions > Deploy a new function > Via editor**. Name it `entry-refund`, paste in `supabase/functions/entry-refund/index.ts`, switch **Verify JWT** **off** (it checks the login itself), and **Deploy**.
2. Replace `stripe-webhook` with the newest file from the branch (it now also notices refunds made inside Stripe).
3. In Stripe (test mode first): **Developers > Webhooks**, open your destination, and add the event **`charge.refunded`** to the ones it listens for.

Stripe keeps its processing fee on a refund, so the federation bears that cost (it is already counted in the money report). A refund can be made after entries close: the entry form tells lifters refunds stop at closing, so it is the entries team's call.

---

## Part 5d: Discount codes

Codes are made in the editor: open a competition, then the **Codes and links** tab, then **Make a discount code**. Each code has **Copy** and **Delete**. Delete removes a code nobody has used; a code that has been used (even by a cancelled entry) is switched off instead and kept, so its entries keep their record. Nothing else needs setting up in Stripe. Update these two functions so codes work on the entry form: **`entry-checkout`** (it now checks codes, and confirms a free entry itself and emails the lifter) and **`entry-status`** (it now also recognises a free entry). Run the newest all-in-one SQL first.

---

## Part 5e: The money tab

After a competition, open its **Results** tab and paste the link to its page on OpenIPF. A "View results" button then appears on the calendar. Clear the box to take it off.

To delete a competition, open it and scroll to the bottom of its **Details** tab: the red **Delete this competition** button asks you to confirm. A competition that has entries cannot be deleted, because entries and payments are records we keep; the dialog says so and offers to hide it from the website instead.

On the competition's **Details** tab, tick **This is a franchise competition** when a host runs it. Leave it unticked for a competition the federation runs itself: the federation then keeps the whole entry fee and there is no host to pay.

The **Extras** tab is where you add the photo package and any merchandise (name, price, optional stock and sizes). They appear on the entry form and are paid with the entry. Discounts never apply to them.

Each competition has a **Money** tab (entries team and admins). Press **Set who gets paid** to name the host; the host is paid the entry fee less the federation's fixed amount (£12 full power, £7.50 bench only, £4.50 sub-junior (full power; sub-junior bench only pays the bench amount), changed for that competition with **Change this competition's amounts**; the amounts new competitions start with are on the Calendar page under **What the federation keeps from each entry**, and changing those never alters competitions that already exist). The federation absorbs discounts, free places and Stripe's fees. The report shows what each person is owed and what is still to send; **Record a payment sent** notes when you have paid someone. It needs the newest all-in-one SQL (the report refuses anyone who is not on the entries team).

---

## Part 5f: The waiting list

When a competition has no places left, the waiting list opens by itself: the entry page and the calendar switch to "Join the waiting list" (name and email). When a place frees up, because of a cancellation, a refund, or a place nobody paid for, the person who has waited longest is emailed a personal link and the place is held for them for 48 hours (you can change this on the competition's Details tab). They get one reminder, and if they do not take it the place passes to the next person. Nothing needs doing by hand: the **Waiting list** tab on each competition shows who is waiting, who has been offered a place and until when, and lets you take someone off the list or withdraw an offer.

To set it up (once):
1. In Supabase, **Edge Functions > Deploy a new function > Via editor**. Name it `waitlist`, paste in `supabase/functions/waitlist/index.ts`, switch **Verify JWT** **off**, and **Deploy**.
2. Under **Edge Functions > Secrets**, add one new secret, `CRON_SECRET`, with any long random text (for example, mash the keyboard for 30 characters). Keep a copy.
3. In **Database > Extensions**, make sure `pg_cron` and `pg_net` are switched on.
4. Open `docs/entry-system/schedule-waitlist.sql`, replace `YOUR-CRON-SECRET` with the text from step 2, and run it in the SQL editor. It makes the list check itself every 5 minutes.
5. To test without waiting, press **Check the list now** on the Waiting list tab.

It needs the newest all-in-one SQL.

## Part 5g: Priority entry

On a competition's **Codes and links** tab, **Priority entry** is a list of people who can enter before everyone else. Press **Add people** and paste the list once, one person per line: an email address, with a name before it if you like (for example `Sam Smith, sam@example.com`). Pasting two columns from a spreadsheet works too. You can do this weeks ahead and add people again later.

Nothing is sent when you add them. When the priority window opens (24 hours before general entry opens, and you can change the number of hours on the Details tab), the site emails each person their own personal link automatically, using the same 5-minute timer as the waiting list. Each person's row shows whether their link is waiting, sent, or used. **Send now** emails one person at once, **Send again** gives someone a fresh link (the old one stops working), and **Send to everyone waiting now** does the lot early if you want to.

A link only works with the email address it was sent to, and only once. People on the list who miss the window can still enter when general entry opens.

This needs the newest all-in-one SQL, and the updated `waitlist` function pasted over the old one in Supabase (it now sends the priority emails too). The timer from Part 5f is the same one: nothing new to set up.

## Part 5h: The OpenIPF lookup

When someone enters a competition and gives their OpenIPF link, the site checks it for you. Within a few minutes of the entry being confirmed, it reads that lifter's results from openipf.org and stores their best total and best GL points over the 12 months before the competition, for the same event (full power or bench only) and kit (classic or equipped). You see it on the entry, on the Entries tab: open the entry and look under **Lifting**. It also shows the name on the OpenIPF profile, and tells you if it doesn't look like the same person.

On a competition's **Details** tab, **Qualifying standard** sets what is checked:
- **None:** the OpenIPF link is optional, and nothing is checked.
- **OpenIPF link required, nothing checked:** the link is mandatory, and you check the results yourself.
- **A minimum GL score:** enter the points, for example 100.
- **A qualifying total for each weight class:** one line each, such as `M 83: 450` and `F 63: 300`. A class you leave out is not checked.

Entries below the standard get a **Below qualifying standard** tag and are counted at the top of the Entries tab. The site never refuses an entry for this, because a lifter can have results on OpenIPF under another profile, so you decide. Changing the standard re-checks every entry straight away. **Check OpenIPF again** on an entry asks for a fresh lookup, which is useful after a lifter corrects their link.

It uses the same function and timer as the waiting list, so there is nothing new to set up: paste the updated `waitlist` function over the old one in Supabase, and run the newest all-in-one SQL.

## Part 5i: Real payments and entry notifications

To switch from Stripe's test mode to real money, and test it with a £1 entry and refunds, follow [stripe-live-guide.md](stripe-live-guide.md).

Each time someone's entry is confirmed, `competitions@ynepf.co.uk` (the `NOTIFY_TO` address) gets a short "New entry" note: who, which event and weight class, what they paid, extras, any guest or under-18 flag, how many places are taken, and a link to the entries desk. The lifter gets only their own confirmation. Refunds work the same way: the lifter gets their refund or cancellation email, and `competitions@` gets a separate note saying who did it, how much, why, and how many places are now taken. That covers refunds from the entries desk, refunds made in Stripe's own dashboard, and the automatic refund when someone pays after their place was released. This needs the updated `stripe-webhook`, `entry-checkout` and `entry-refund` functions pasted into Supabase.

## Part 5k: The lifting order (builder)

Every online-entry competition has a **Lifting order** tab (entries team and admins). It takes the competition's real entered lifters (paid or free) and:
- **Sort the entries** runs the auto sort: days, sessions and flights, with women and men apart, at most 14 full power / 20 in all per flight, optional prime time, classes running up, and lifters with no best total first. Set the days, sessions and prime time above the button first, if you want to. The flight limits are the federation's rules and can't be changed here.
- **Drag a lifter by the handle** (the six dots on the left of their row) to move them: up or down in their flight, into another flight or session, or into the **Not in the lifting order** box to take them out. A line shows where they will land. On a touch screen, drag with a finger. Without a mouse: tab to the handle, press space to pick the lifter up, use the up and down arrow keys to move them through the order (the screen reader announces each move), then press space to drop them. Delete takes them out and Escape puts them back. A flight that breaks a rule (women and men mixed, or over the limits) is flagged.
- Lifters who enter after you've sorted appear in the **Not in the lifting order** box: drag them into a flight. Lifters who have cancelled are taken out for you.
- **Save** keeps the arrangement (nothing is lost if you leave and come back). Sorting again replaces everything, and asks first.

Best totals come from the OpenIPF check on each entry. Nothing here is public yet: publishing, locks, timings, lot numbers and the OpenLifter export come next. It needs the newest all-in-one SQL.

## Part 5b: The club list

Lifters in English divisions can choose their club (it is optional) from the English Powerlifting Association's list of approved clubs, copied from the EPA website. Only club **names** are copied, never contact details. Lifters from other nations have no club question, and clubs from other bodies are not included.

1. In Supabase, **Edge Functions > Deploy a new function > Via editor**. Name it `sync-clubs`, paste in `supabase/functions/sync-clubs/index.ts`, switch **Verify JWT** **off**, and **Deploy**.
2. In the site editor, **Calendar**, scroll to **Club list** (entries team and admins) and press **Refresh club list**. You should see "Club list refreshed: 64 clubs" (the number changes as the EPA adds clubs).
3. Optional, to keep it fresh: run `docs/entry-system/schedule-club-sync.sql` once in the Supabase SQL editor. It refreshes on the 1st and 15th of each month.

If the EPA website changes shape, the import stops and leaves the list as it was, and the Club list box says the last check did not work. Tell me and I will adjust it. A club that is not on the EPA list cannot be chosen: the lifter simply leaves the club blank.

---

## Part 6: Making a TEST competition and entering it

Everything for a competition is set up once, on one page in the **Calendar** tab. There is no separate Entries tab: a competition's page has **Details** (everything you set up) and **Entries** (who has entered).

1. In the editor, **Calendar > Add competition**. A full page opens. Fill in:
   - **The competition:** name (for example `TEST Spring Open`), description.
   - **When and where:** the dates and venue.
   - **Entry:** choose **On this website, paid by card**, set the **Number of spaces**, and leave **Entry opens** and **Entry closes** on the usual settings (8 weeks before at 9am, 3 weeks before at noon) or choose your own. A line under each shows exactly when it will happen, and when priority entry opens (a day earlier).
   - **Online entry:** the events and equipment you offer, the prices, and how many days after entry opens guests (anyone outside the Yorkshire & North East division) can enter. It is 14 by default.
   - Leave **Show on the website** unticked while you test. New items start as drafts.
2. Press **Add competition**. You stay on the page, which now also has an **Entries** tab.
3. Enter it:
   - **Unpublished (testing):** sign in at `/admin` on the test address first, then go to `/enter?c=` followed by the web address ending, for example `2027-test-spring-open` (shown on the page under "Web address ending"). You will see a "Preview" notice.
   - **Published:** the competition's card on the public Calendar gets an **Enter now** button.
4. Fill in the form. Pay with the test card `4242 4242 4242 4242`.

**What you should see:** a thank-you page, the entry in the competition's **Entries** tab marked **Paid**, and a confirmation email.

**Why unpublished works:** an unpublished competition is hidden from the public, but you can still open its entry form **if you are signed in to the site editor on the same address**. Everyone else gets "Competition not found".

**Clearing a test competition:** the editor will not delete a competition that has entries, because the payment records must be kept. For a TEST competition, an administrator opens `docs/entry-system/clear-test-competition.sql`, changes the name on the marked line, and runs it in the Supabase SQL editor. It only accepts names containing the word TEST. To simply take a competition off the website, untick **Show on the website**.

**Who can change what:** editors change the competition itself (details, places, entry times, links). The entries team changes the online entry settings (how entries are taken, events, prices) and sees the Entries tab. Admins do both.

---

## Parts 7 and 8

**(to be written)**, each just before it is needed.

### Lot numbers and exports (Lifting order tab)

- **Draw lot numbers** gives each flight its own block of consecutive numbers, in flight order (flight A has 1 to 10, flight B 11 to 20, and so on). Inside a flight the women come first, then the men, and each group is shuffled with the browser's cryptographic random generator, so a number never leaves its flight. Drawing again asks you first, because the old numbers may already have been used. Lot numbers are hidden until you tick **Show lot numbers**, are never public, and are kept when you press **Save** (the audit log records the save).
- If you move a lifter after the draw, the page warns that the blocks no longer line up. Draw again once the order is settled.
- **Weigh-in sheet** (lot order), **Score sheets** (one landscape page per flight), **Rack heights** and **Kit check** (one page per session, in lifting order) copy the federation's own layouts. Each opens in a new tab to print or save as PDF (turn off headers and footers).
- **Publish** (top of the tab) makes the order public without lot numbers, and the calendar swaps *View entries* for *View lifting order*. It is labelled Provisional until entry closes, Final after. **Unpublish** puts the calendar back. Save before publishing; saving later updates the public page straight away. This needs the latest all-in-one SQL run once.
- **OpenLifter file** downloads a CSV (with the Session, Novice and CanBreakRecords columns that our own OpenLifter build accepts; tick *Use the public OpenLifter's columns* in OpenLifter settings to leave them out for the public build) with the reference header and runs the importer's checks first. Open **OpenLifter settings** to set the division codes (they must match the divisions in your OpenLifter meet exactly), the equipment names and whether the competition is a novice one.
- The division codes start as `MR-O` and `FR-O` (sex, R for raw/classic or E for equipped, then O for Open), as in the YNE Worlds 2026 file. Guests get a note: "Divisional Guest" when they can break records, otherwise their own division, such as "North West Guest".
- Tests: `node docs/entry-system/lifting-sort.test.mjs` and `node docs/entry-system/lifting-export.test.mjs`.

### Session times and settings (Lifting order tab)

Each session has a card showing **Weigh-in**, **Lift-off** and **Awards**, with an **Edit times** button that opens an overlay. The usual times are filled in for you: weigh-in 08:00 for session 1 and 13:00 for session 2, lift-off two hours after weigh-in, and the finish (awards) estimated from the attempts (full power lifters have 9, bench only 3, at the *Seconds per attempt* setting, plus 10 minutes between flights and 10 before awards). Type any time in the overlay (UK time, like `09:30`) to override it, or leave a box empty to use the usual time. If you type only a lift-off, the weigh-in moves to two hours before it. The times show on the public lifting order once published, and are kept when you sort again.

**Settings** (the last section, below Exports) holds *Seconds per attempt*, 45 by default (about 3.5 hours for two full flights). Run the latest all-in-one SQL once for this setting.

**Preview:** the **Preview** button (next to Publish) opens the lifting order page as the public will see it, from the saved order, before it is published. Only a signed-in entries team member can see it (sign in to the admin area first, in the same browser). The link is `/lifting/?c=<slug>&preview=1`. It is hidden from search engines. Save first, because it shows what is saved, not what is on screen. Run the latest all-in-one SQL once for this.

**Public lifting order columns:** Name, Club, Age class, Class, GLP, Total. Club sits in its own column beside the name (hidden if nobody has a club). In **Settings** (bottom of the Lifting order tab) you can untick *Show GL points* and *Show best totals* to hide those columns on the public page. Run the latest all-in-one SQL once for these.

### Building the order: sort once, then arrange by hand

**Sort the entries** is used once, to make the first lifting order. After that the button is replaced by **Clear the order** (starts again, after a warning). Lifters who enter later appear in *Not in the lifting order*, ready to drag into a flight. Each session and flight has ghost buttons on its heading line: **Remove flight** and **Remove session** send their lifters to *Not in the lifting order*, **Add flight** adds an empty flight to a session, and **Add session** is at the bottom. Flight letters start again at A each day and session numbers from 1 each day, so they renumber when you add or remove.

**Share with lifters** (next to Publish) emails everyone in the order, from the competitions address, with a link. It is sent as *provisional* while entry is open and as *final* once entry has closed (by date or by hand). It needs the order to be published and saved, asks you to confirm, and the page remembers when it was last shared. The competitions address gets a note of how many were sent. This needs the updated `waitlist` Edge Function deployed (paste the new `supabase/functions/waitlist/index.ts`) and the latest all-in-one SQL run once.

The *Lifting order sheet* field on the competition has gone: the order now comes only from the builder.

### How the Lifting order tab is laid out

Top to bottom: the sort settings, then **Build and save** (Sort the entries or Clear the order, Save, Preview), the arrangement itself, **Sharing** (Publish, then Share with lifters and Unpublish once it is published), **Lot numbers** (Draw, then Show, Redraw and Remove once drawn), **Exports** (print sheets and the OpenLifter file, as small tertiary buttons with icons) and **Settings**. Only the buttons that apply right now are shown, so there are no greyed-out buttons.

### The privacy policy page

The page is at `/privacy` and is linked from the footer. Its text is edited in the site editor: **Footer**, find **Privacy policy** in the Legal group, press **Edit page** (or **Edit**, then **Edit the privacy policy page**). The page editor is a what-you-see-is-what-you-get editor with a **Last updated** date. Saving updates the page straight away. The footer link's address is fixed and it cannot be deleted, only its link text can be changed. The first version (`docs/privacy-policy-default.md`) is loaded once by the all-in-one SQL and never overwrites later edits. Run the latest all-in-one SQL once to get it, and to point the footer's Privacy policy link at the new page.

### Audit trail: priority links and discount codes

- **Priority entry:** when links are emailed (automatically 24 hours before entry opens, or when you press Send now), the competitions inbox gets a note listing who was sent a link and who could not be reached. On a competition's **Codes and links** tab, the priority list shows for each person when their link was sent and when (and as whom) it was used.
- **Discount codes:** each time a code is used, whether the person paid or the code made the entry free, the competitions inbox gets a note with the code, who used it, the discount and what they paid. Under the codes on the same tab, **Who has used a code** lists every entry that used one, newest first.
- This needs the updated `stripe-webhook`, `entry-checkout` and `waitlist` Edge Functions deployed (paste each `index.ts`).

### Volunteers: sign-up and the rota (a competition's Volunteers tab)

1. **Create the rota:** say how many lifting sessions need staffing, and whether to include set up and tear down. The usual roles and numbers are filled in: chief referee 1, side referees 2, technical controller 1, session manager 1, table 2, MC 1, platform manager 1, platform crew 4, warm-up / runner 1, ad-hoc 2; set up and tear down have a co-ordinator and six crew.
2. **Open sign-up** when you are ready (usually about two weeks after entry opens). Share the link shown (`/volunteer?c=<address>`). Volunteers give their name, email, an optional mobile number (for WhatsApp groups) and a unisex T-shirt size (XS to 5XL, which you can turn off), confirm they are 18 or over, and tick the roles they could do in each session. The form says plainly that not turning up without telling us loses their points. Signing up again with the same email replaces earlier answers. **Download sign-ups (CSV)** gives you the mobile numbers and T-shirt sizes.
3. **Choose who does what:** each place has a dropdown. A volunteer role (table, MC, platform crew, warm-up, set up, tear down) lists **only the people who ticked that role in that session**. Platform manager, session manager, ad-hoc and the co-ordinators list everyone who signed up. **Referees, the technical controller and the jury** come from the **referee roster** (grouped by level), and their level is shown on the rota; **Add a referee…** adds someone new with a required level (IPF Category 1 or 2, British Powerlifting National or Divisional, YNEPF Divisional). **Someone else…** lets you choose anyone (or add a new person with an optional email) for a role they did not tick: that is your choice, so they are not flagged. If a volunteer later **changes their answers** and is no longer available for the role they were given, the place turns red with "no longer available. Please amend this." and a summary appears at the top. A person in two places in the same session is flagged. **Add place** and **Remove place** change the numbers, **Edit session** renames it, sets the times shown on the rota, and has a **jury** tick (adds three places) and **Remove session**. **Add session** is at the bottom.
4. **Publish** the rota: it goes on a public page (`/rota?c=<address>`) showing names and roles only, never emails or mobile numbers. **Preview** shows it to the entries team first.

Needs the latest all-in-one SQL (new `vol_` tables, the sign-up functions and the rota view) and the privacy policy update (`docs/privacy-policy-update.sql`) which mentions mobile numbers and T-shirt sizes. Franchise competitions have no sign-up; points for their helpers come in a later stage.

### Volunteer points (the Volunteers tab at the top of the editor)

- **How points work:** every point is a line in a ledger that nobody can edit or delete, only add to. Points expire 24 months after they were earned, and a spend uses the oldest points first. Balances are worked out from the ledger, never typed in.
- **On the day:** each person in a place has buttons beside their name on the competition's Volunteers tab. **Arrived** gives them the role's points straight away (1 for each session role, set up or tear down). **No show** (did not turn up and did not tell us) takes away all their points. **Told us** is for someone who let us know in advance: no points lost. **Undo** reverses any of them. **Edit** brings the dropdown back to change the person, and **Remove place** takes the place away. A person can only do one job in a session, so anyone already placed is greyed out in that session's other dropdowns. Someone with no email gets no points.
- **The points list:** search everyone, see what is about to expire, and open a person's **History** to see every earn and spend with who made it. On a person's **Edit** screen (find them in the list first, and their email is already filled in), **Add points** is for a thank you, a correction or a retroactive award (give the date: the points expire 24 months from it), and **Take points away** is for a spend (priority entry 1, £20 off 4, £40 off 8, half price BP membership 5, free membership 10) and cannot go below zero. Memberships are still claimed by email: take the points off here once the treasurer has paid. **Add someone new** at the top of the page sets up a person who is not in the list yet (name, email, committee) and can give them their first points in the same step.
- **Import the old sheet:** open the Master database tab of the points sheet and download it as CSV (File, Download, CSV). Choose it under **Import the old points sheet**. It reports the people, points earned and spent, rows with no email address (they cannot be imported), cells that are not numbers, and any person whose columns do not add up to the sheet's own total. Press Import to load it; importing the same file twice changes nothing. Afterwards it compares every balance with the sheet.
- **Edit a volunteer:** press **Edit** on their row in the points list, or open **Who has signed up** on a competition's Volunteers tab. You can change their name, email, mobile and T-shirt size. A new name shows everywhere, including the rota and the referee roster. A new email address takes their points (and history), sign-ups, rota places, and any unused priority link or discount code with it, and the change is recorded in the audit log with your name. If the new address already belongs to someone else it is refused, because that means two people to merge. Needs the latest all-in-one SQL.
- **Committee and executive points:** tick **Part of the committee** when you edit a person (or when you press **Add a person**, for someone who has never volunteered). Everyone ticked gets 3 points at the end of every quarter (31 March, 30 June, 30 September, 31 December) if they are part of the committee on that day, starting with 31 December 2026. Untick the box when they step down: they keep what they earned but earn no more. Referees are not included unless they are also ticked. The points are added by the daily check (the same timer that sends priority links), dated the quarter end, once per person per quarter, and any missed quarter is caught up. competitions@ gets an email listing who was awarded points. Committee members show a **Committee** tag in the points list, even before their first award. Quarters already in the old sheet are not repeated: awards start after them. Needs the latest all-in-one SQL and the updated `waitlist` function.
- **Helpers at a franchise competition:** under **Points for helpers at another host's competition**, pick the competition and paste the host's list (name, email, optional points). Each person earns once per competition.
- **Public points list:** `/points` shows names and points only. The list is hidden until someone types in the search box, and then shows just the matches, so the "Spend your points" section sits near the top. Update the FAQ answer "How do I check my points?" to link to it, and add it to the footer under Footer in the editor if you want.
- Needs the latest all-in-one SQL (the ledger changes, balance and tick-off functions).

### Changing your answers, and the referee roster

- **Volunteers change their own answers.** After signing up they are emailed a confirmation with a personal link (`/volunteer?c=<address>&edit=<token>`) that shows what they ticked and lets them change it. On the form there is also **Already signed up? Change your answers**: they enter their email and we email them the link again. If that email has not signed up, the page says so and suggests signing up. Signing up again with an email that already has a sign-up is refused (so nobody can overwrite someone else's answers). The competitions inbox gets a note for every sign-up and every change.
- **Referee roster** (Volunteers tab at the top, **Referees**): add referees with a level, edit or remove them, or press **Add from the committee page** to copy the international and national referees already listed there (IPF Category 1 and 2 become IPF Category 1 and 2, national referees become British Powerlifting National; anyone whose role does not say a level is skipped). Add divisional referees with **Add a referee**.
- This needs the latest all-in-one SQL **and** the updated `waitlist` Edge Function deployed (the sign-up form now saves through it, so it can send the emails).


### Points at work: priority links, discount codes and memberships

- **Priority links come from the points.** When a competition's priority window opens (24 hours before general entry by default, set on the competition's Details tab), everyone with at least 1 unexpired point is added to the Priority list automatically and emailed their own personal link. Each link is tied to that email and can be tracked on the **Codes and links** tab: who was sent one, and who used it. You still get the audit email at competitions@. People you add by hand cost no points. To switch this off for a competition, untick **Priority links for volunteers** on its Details tab.
- **Testing it, or giving a costed link by hand:** on the Priority list, **Add people** has a **Costs 1 volunteer point** tickbox. Ticked, those links take a point when the entry is confirmed, like the automatic ones. Unticked, they are free (guests, sponsors, tests). To test on yourself: add only your own email with the box ticked, press **Send now** on your row, enter with the link and pay with the Stripe test card, then check your history for "Priority entry". Nobody else is emailed.
- **The point is taken when the entry is confirmed**, not when the link is sent. If someone does not use their link they keep the point.
- **Discounts are self-service.** On `/points`, a volunteer enters their email and we send a 6 digit code (it works for 15 minutes, once). They then see their points and what is free to spend, choose a competition and how many £20 discounts (4 points each, up to 5), and get a discount code made for that email and competition. It is also emailed to them and to competitions@, and shows on the **Codes and links** tab with the reason "Volunteer points". The points are set aside straight away so they cannot be spent twice, and come off the balance when an entry using the code is confirmed. A priority link and a discount can be used together.
- **What the history shows for a discount code.** When a volunteer makes a code, their History gets a line "Discount code made: ALYS-40OFF-… (8 points held for [competition])" with a dash in the Points column, because nothing has been deducted yet. When the entry using it is confirmed there is a second line, "Discount used: ALYS-40OFF-… ([competition])", with -8, and their total drops. If the code is given back, or you delete it, a "Discount code released" line says so. A code nobody uses frees its points by itself when entry closes, and the daily check then adds a "Discount code expired" line. Priority links work the same way: the "Priority entry" line appears when the entry is confirmed. Needs the latest all-in-one SQL.
- **Giving points back.** An unused discount code only holds its points, so nothing is spent until an entry using it is confirmed. A volunteer can press **Give the points back** next to the code on `/points` (after confirming their email with the emailed code), or you can press **Delete** on the code in the Codes and links tab (it says "holding 4 points until used"). Either way the points are free straight away. A code nobody uses frees its points by itself when entry closes. Once an entry using the code is confirmed the points are spent, and they are **not** returned if the lifter later withdraws: they get the entry fee back through the refund, nothing more. If you decide to make an exception, use **Add points** with a reason. A code that is on an entry in progress cannot be given back.
- **Memberships** stay manual. The volunteer emails you, the treasurer pays, and you take the points off with **Edit** on their row in the points list, then **Take points away**.
- **Calendar buttons and sign-up closing.** While sign-up is open, the competition's card on the calendar has a **Volunteer** button. Once the rota is published it has **View volunteer rota**. On the Volunteers tab you can set **Close sign-up automatically** to a date and time, and the button disappears then. Opening sign-up again clears a date that has passed.
- **FAQ wording:** run `docs/entry-system/faq-points-update.sql` once in the Supabase SQL editor to update the two FAQ answers ("How do I spend points?" and "How do I check my points?"). You can still edit them afterwards in the editor.
- Needs the latest all-in-one SQL, and the updated `waitlist` Edge Function deployed (it now creates the priority list from points and sends the one-time codes and discount emails).

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
- **Entries team**: whoever runs entries.
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
| `NOTIFY_TO` | `ynepfentries@gmail.com` (already there) |
| `MAIL_FROM` | leave as it is until Part 5 is done |

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

## Part 6: Making a TEST competition and entering it

1. In the editor, **Calendar > Add competition**. Name it `TEST Spring Open`, pick a date in the future, set a **web address ending** like `test-spring-open`, and **untick Published** so the public cannot see it. Save.
2. Open **Entries**, press **Entry settings** for it. Choose **Online on this website**, set the places, when entries open (a time in the past is fine), the prices (for example 60 and 25), and Save.
3. Visit `/enter?c=` followed by the competition's `slug` on the test pages. It is the competition's web address ending including the year, for example `2027-test-spring-open`. The Entries tab shows it under the competition name.
4. Fill in the form. Pay with the test card `4242 4242 4242 4242`.

**What you should see:** a thank-you page, the entry in **Entries > View entries** marked **Paid**, and a confirmation email.

**Why unpublished works:** an unpublished competition is hidden from the public, but you can still open its entry form **if you are signed in to the site editor on the same address**. Sign in at `/admin` on the test address first (the preview address from Part 3, then `/admin`), then open the entry form there. You will see a "Preview" notice at the top. Everyone else gets "Competition not found".

---

## Parts 7 and 8

**(to be written)**, each just before it is needed.

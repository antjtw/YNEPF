# Setup guide: the one-off steps

Every step you have to do yourself, in the order you will need them, written so the next person can follow it without help. Each step says where to click, what to copy, where to paste it, and **what you should see when it has worked**.

**Never paste a secret key into a chat, an email or a document.** Each step says where a key goes. Anything marked "secret" goes only into the box named in the step.

This guide grows as the entry system is built. Parts marked **(to be written)** are filled in just before they are needed.

| Part | What | Who | Needed for |
|---|---|---|---|
| 1 | A second Supabase project for testing | You | Trying things without touching live data |
| 2 | A Stripe account and test keys | Treasurer | Testing payments |
| 3 | Pointing Vercel previews at the test project | You | Clicking through each piece before it goes live |
| 4 | `@ynepf.co.uk` email | You | Sending emails. See [email-setup-guide.md](email-setup-guide.md) |
| 5 | Deploying the payment functions **(to be written)** | You, with steps | Taking a test payment |
| 6 | Stripe webhook **(to be written)** | Treasurer | The system learning that a payment worked |
| 7 | Apple Pay domain **(to be written)** | Treasurer | Apple Pay and Google Pay |
| 8 | Going live **(to be written)** | Treasurer and you | Real money |

---

## Part 1: A second Supabase project for testing

**Why:** so every experiment (and every pretend entry) happens in a copy, not in the live database.

**Time:** about 10 minutes.

1. Go to **supabase.com/dashboard** and sign in.
2. Press **New project**.
3. Choose the **organisation** you want it under.
   - **If it says you have reached the limit of free projects**, you have three options: put the test project under a different organisation or account (as you did for the live one), pause a project you no longer use, or upgrade. Tell me which and I will help.
4. Fill in:
   - **Name:** `ynepf-test`
   - **Database password:** press **Generate a password**, then **save it in your password manager**. You will rarely need it, but you cannot see it again.
   - **Region:** choose the **same region as the live project** (West EU).
5. Press **Create new project** and wait a minute or two.

**What you should see:** the project's home page, with the name `ynepf-test` at the top left.

6. Find its address and public key:
   - Click **Project Settings** (the cog, bottom left), then **API** (or **Data API**).
   - Copy the **Project URL** (it looks like `https://abcdefgh.supabase.co`).
   - Copy the **publishable key** (it starts `sb_publishable_`).
   - These two are **safe to share with me**. They are the same kind of values already in `assets/js/config.js`.
   - **Do not copy the "secret" key** anywhere.

**Tell me:** "test project is ready", plus the Project URL and the publishable key. I will then give you the file to paste into the test project's **SQL editor**.

---

## Part 2: A Stripe account and test keys

**Who:** your treasurer. Create the account under **the treasurer's own work email**, not a personal one, so the live account is theirs from the start. A second named person should be added later (Part 8).

**Time:** about 15 minutes. You do **not** need to finish Stripe's business verification to test; that is only needed to take real money.

1. Go to **dashboard.stripe.com/register** and create an account.
2. Once in, find the **Test mode** switch (or a **Sandbox**, if Stripe offers one). Switch it **on**. You should see an orange "Test mode" or "Sandbox" label.
3. Go to **Developers** (bottom left or the top bar), then **API keys**.
4. You will see two keys:
   - **Publishable key** (starts `pk_test_`): safe to share with me.
   - **Secret key** (starts `sk_test_`): **secret. Do not share it with anyone.** It goes only into Supabase (Part 5), and I will tell you exactly where.

**Tell me:** "Stripe test account is ready", plus the **publishable** key. Never the secret one.

Useful to know: in test mode you pay with fake cards, for example `4242 4242 4242 4242` with any future date and any 3 digit code. No real money moves.

---

## Part 3: Pointing Vercel previews at the test project

**(to be written)**, once I have added the build step. In outline: in the Vercel project, **Settings > Environment Variables**, add the test project's Project URL and publishable key for the **Preview** environment only. The live site is not touched.

---

## Parts 5 to 8

**(to be written)**, each just before it is needed.

# Setting up @ynepf.co.uk email

This guide gets you two things:

1. **A proper address for people to write to**, such as `entries@ynepf.co.uk`, instead of the Gmail address.
2. **The website sending email as that address** (entry confirmations, waiting list offers, the contact form), so it arrives in people's inboxes and not their spam folders.

You will not need to be technical. Every step says where to click and what you should see. If a screen does not look like the description, stop and ask.

**Time:** about an hour, plus waiting (DNS changes can take anywhere from a few minutes to a few hours to show up).
**Who:** whoever can log in to where the domain `ynepf.co.uk` is managed (see Step 1). Probably the person who connected it to the website.

---

## Why this is needed

Right now the contact form emails come "from" a Resend test address, and Resend only lets that address email the account owner. That is fine for one inbox, not for hundreds of lifters.

To send to everyone, the website must send as an address on a domain we own and have proved we own. Gmail addresses cannot be proved this way, so the sending address has to be on `ynepf.co.uk`.

Proving ownership means adding a few "DNS records" to the domain. Think of them as labels on the domain that tell the world "this service is allowed to send email for us".

---

## Step 1: Find out where the domain's settings live

The domain's DNS records live in one place only. You need to know which.

1. Open the Vercel dashboard, go to the project, then **Settings > Domains**.
2. Next to `ynepf.co.uk` look at what it says.
   - If it says **"Vercel DNS"** or shows nameservers ending in `vercel-dns.com`, your DNS records are managed **in Vercel**. Go to Vercel's **Domains** page (top menu), click `ynepf.co.uk`, and you will see a **DNS Records** section. This is where you will add records.
   - If it shows **"Invalid configuration"** or asks you to add an A or CNAME record at your registrar, or says the nameservers are elsewhere, your DNS records are managed **at the company you bought the domain from** (the registrar, for example GoDaddy, 123-reg, Namecheap, Google Domains/Squarespace, Cloudflare). Log in there and look for **DNS**, **DNS records** or **Advanced DNS**.

Write down which one it is. **Send it to Claude** so the next steps can be tailored. Everything below works the same wherever the records live.

> Do not delete or change records that are already there (especially the ones that make the website work). You are only ever **adding** new ones.

---

## Step 2: Decide how people will read and reply to email

Pick one. My recommendation depends on one question: **is the federation a registered charity or otherwise eligible for Google for Nonprofits?**

| | Option A: forwarding (free) | Option B: a real mailbox (Google Workspace) |
|---|---|---|
| What it is | `entries@ynepf.co.uk` forwards to your existing Gmail inbox. You reply from Gmail using "Send mail as". | `entries@ynepf.co.uk` is its own inbox, shared by the people who need it. |
| Cost | Free | Free if eligible for Google for Nonprofits, otherwise a few pounds per user per month |
| Good for | Getting started quickly | Several people sharing the entries inbox, clean history |
| Downside | Replies need a one-off Gmail setting; harder to share | Needs the eligibility check or a small monthly cost |

**If you are eligible for Google for Nonprofits, choose B. Otherwise start with A.** You can move from A to B later without anything breaking.

### Option A: forwarding

1. Check your registrar's help for **"email forwarding"**. Many include it free (GoDaddy, 123-reg, Namecheap, Squarespace/Google Domains all do). Create the forward `entries@ynepf.co.uk` to your Gmail address.
2. If your registrar does not offer it, use **Cloudflare Email Routing** (free). This needs the domain's nameservers on Cloudflare, so **ask Claude first** before doing this, because it changes where your DNS records live.
3. In Gmail: the cog, **See all settings**, **Accounts**, **Send mail as**, **Add another email address**. Enter `entries@ynepf.co.uk`. Gmail sends a confirmation email to that address (which forwards to you). Click the link in it.
4. Tick **Reply from the same address the message was sent to**, so replies come from `entries@`.

### Option B: Google Workspace

1. Go to the Google for Nonprofits page, check eligibility, and follow it to get Workspace. If you are not eligible, go to workspace.google.com and start a Business Starter trial.
2. Google asks you to prove you own `ynepf.co.uk` by adding a **TXT record**. Copy exactly what it shows into your DNS (Step 1 told you where).
3. Google also gives you **MX records**. Add them. These are what make email arrive in the Workspace inbox.
4. Create a user (or group) `entries@ynepf.co.uk` and give access to the people who need it.

**What you should see:** once the MX records have spread, sending a test email to `entries@ynepf.co.uk` from your personal address lands in the inbox (Option B) or in your Gmail (Option A).

---

## Step 3: Let the website send email as `entries@ynepf.co.uk` (Resend)

The website uses a service called **Resend** to send email. You made an account earlier for the contact form.

1. Log in at resend.com. Go to **Domains**, then **Add Domain**.
2. Enter `ynepf.co.uk`. Choose the region closest to the UK (Ireland or London if offered).
3. Resend now shows a **table of DNS records** to add. There are usually three or four: one or two **TXT** records (one is called DKIM and has a long value) and sometimes an **MX** record. The "Name" column is the first part of the record's name, and "Value" is the long text.
4. For each row, go to your DNS (Step 1) and add a new record with the **same type, name and value**. Copy and paste exactly. Do not retype.
   - Some DNS screens add `.ynepf.co.uk` to the name for you. If so, enter only the part before it, as Resend shows it.
   - Do not add quotation marks around the value unless your DNS screen asks you to.
5. Back in Resend, press **Verify DNS Records**. It may say "pending" for a while. Check again after ten minutes, then an hour.

**What you should see:** every record turns green and the domain says **Verified**.

### Optional but recommended: a DMARC record

DMARC tells email providers what to do with fake emails pretending to be us. It protects the federation's name. Add one **TXT** record:

- **Name:** `_dmarc`
- **Value:** `v=DMARC1; p=none; rua=mailto:entries@ynepf.co.uk`

`p=none` means "just report, don't block" and is the safe way to start. After a few weeks of clean reports we can tighten it.

---

## Step 4: Tell the website to use the new address

This needs one change in Supabase (where the contact form's email function lives). Do these steps one at a time:

1. In the Supabase dashboard, go to **Edge Functions**, then **Secrets**.
2. Add or change these secrets:
   - `MAIL_FROM` = `YNEPF Entries <entries@ynepf.co.uk>`
   - `NOTIFY_TO` = the address that should receive contact form messages (for example `entries@ynepf.co.uk`).
3. Send a test message from the Contact page on the website.

**What you should see:** the message arrives at the `NOTIFY_TO` address, "from" `YNEPF Entries`. Pressing Reply writes to the person who filled in the form.

---

## Step 5: Check it will not go to spam

1. Go to mail-tester.com. It shows a throwaway address.
2. Send an email to that address **from your new `entries@ynepf.co.uk` address** (or trigger a website email to it).
3. Press **Then check your score**.

**What you should see:** 9 or 10 out of 10. If it is lower, the page lists what is missing (usually a DNS record). Send Claude a screenshot.

---

## Things that commonly go wrong

| Problem | Likely cause | Fix |
|---|---|---|
| Resend stays on "pending" | A record is missing, mistyped, or the "name" has the domain added twice | Compare each row to Resend's table again. Wait an hour. |
| Verified, but test emails land in spam | No DMARC record yet, or the domain is brand new | Add the DMARC record. Warm up by sending a few real emails. |
| Replies from Gmail say "from" the wrong address | "Send mail as" not set up (Option A) | Redo Step 2A, point 3 and 4. |
| Contact form still fails | The function secrets were not saved, or the function was not redeployed | Check Step 4. Look at **Edge Functions > send-contact > Logs**. |
| You changed a record and the website broke | You edited an existing record instead of adding one | Put the old value back and ask Claude for help. |

---

## Free plan limits to know about

Resend's free plan allows **100 emails a day and 3,000 a month**, and Resend will not send more than that. That is enough for the contact form. It is **not** enough for entry confirmations on a busy entry day (96 entries is 96 confirmations, and if we also send ourselves a copy of each, that is 192). Before entries open, the entries team should move to Resend's paid plan, which is a small monthly cost. Ask your treasurer to budget for it.

---

## When you are done

Tell Claude: "email is set up" and which option you chose. The entry system will then use `entries@ynepf.co.uk` for every automatic email.

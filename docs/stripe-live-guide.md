# Taking real payments with Stripe

Until now the site has used Stripe's **test mode**: pretend cards, no real money. This guide switches it to real money, and tests it safely with a £1 entry you refund yourself.

**Read this first.** The three Stripe keys live in Supabase's Secrets, and there is one set for the whole project. The moment you put the live keys in, **every entry on the preview site takes real money**, including the TEST competition. That is safe while TEST Spring Open stays a draft (only a signed-in entries team member can enter it). Nobody else can enter it, so no stranger can pay. Do not publish it while the live keys are in.

Keep your test keys somewhere safe (a password manager), in case you want to switch back.

## Part 1: Activate the Stripe account (the treasurer does this)

1. Log in to Stripe and press **Activate payments** (top of the dashboard).
2. Fill in the business details Stripe asks for: what the organisation is, its address, a website (`https://www.ynepf.co.uk`) and a description (for example "Entry fees for powerlifting competitions run by the Yorkshire & North East Powerlifting Federation").
3. Add the person responsible for the account (the treasurer), with their ID details. Stripe checks this by law. A second named person can be added later under **Settings, Team**.
4. Add the **bank account** the money is paid out to. Use the federation's account, not a personal one.
5. Turn on two-step login for everyone with access: **Settings, Personal details, Security**.
6. Set the name on card statements: **Settings, Business, Public details, Statement descriptor**. Use `YNEPF` so entrants recognise the charge.

Stripe may take a day or two to approve. You can't take real payments until it says the account is active.

## Part 2: Get the live keys

1. In the Stripe dashboard you are probably in the **Sandbox**: there is a dark bar at the top saying "Sandbox" with a **Switch to live account** button. Press it, so that bar is gone and you are in the live account. (Everything in a Sandbox is pretend.)
2. **Developers, API keys.** Copy the **Publishable key** (starts `pk_live_`) and reveal and copy the **Secret key** (starts `sk_live_`). The secret key can only be revealed once, so save it straight into your password manager. Never paste it into a chat or an email.

## Part 3: The live webhook

The webhook is how Stripe tells the site that a payment worked. The live one is separate from the test one, with its own secret.

1. In live mode: **Developers, Webhooks, Add destination** (or **Add endpoint**).
2. **URL:** the same address as the test one: `https://<your-project>.supabase.co/functions/v1/stripe-webhook` (copy it from the test webhook).
3. **Events:** add exactly these three: `checkout.session.completed`, `checkout.session.expired` and `charge.refunded`.
4. Save, then copy the **Signing secret** (starts `whsec_`).

## Part 4: Switch the site over

In Supabase, **Edge Functions, Secrets**, change these three (they already exist, so you replace their values):

| Secret | New value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_live_` key |
| `STRIPE_PUBLISHABLE_KEY` | the `pk_live_` key |
| `STRIPE_WEBHOOK_SECRET` | the live `whsec_` secret |

Nothing else changes, and you don't need to redeploy anything.

## Part 5: Test with real money (£1, then refund it)

1. On TEST Spring Open's **Details** tab, set the **Full power price** to £1 and save. (Stripe's smallest charge is 30p.)
2. Sign in to `/admin` on the preview, then open the entry page:
   `https://ynepf-micro-site-git-entry-system-antjtws-projects.vercel.app/enter?c=2026-test-spring-open`
   (Raise the spaces if it says full.)
3. Enter with your own details and pay £1 with **your own real card**. Not a test card: those no longer work.
4. Check all of these:
   - the Stripe page took the payment and sent you back to the confirmation page,
   - **the entry shows as Paid** on the competition's Entries tab (that proves the webhook works),
   - you got the confirmation email, and `competitions@` got a "New entry" note,
   - the Money tab shows the £1, with Stripe's fee under it.
5. **Refund it.** On the Entries tab, open the entry, press **Cancel or refund…**, choose a full refund, and give a reason. Check that:
   - the entry shows as refunded and the place is free again,
   - the lifter gets the refund email,
   - in Stripe, **Payments** shows the £1 as refunded,
   - the money reaches your card statement in 5 to 10 working days.
6. Repeat once with a **partial refund** (enter at £1 again, refund 50p), and once with a **100% discount code** (the entry is free and Stripe isn't involved).
7. Last, refund something **from Stripe's own dashboard** (Payments, the payment, **Refund**) on a fresh £1 entry, and check the entry changes to refunded on the desk. This proves `charge.refunded` is working.
8. Put the price back to what it should be.

**What the tests cost you:** Stripe keeps its processing fee even when you refund, about 20p plus 1.5% on a UK card for each £1 test, so a few pence per test.

## Part 6: Before real lifters pay

- **Apple Pay and Google Pay:** in Stripe, **Settings, Payment methods**, register the domain `www.ynepf.co.uk` for Apple Pay. This only works once the site is live on that address, so it comes with the go-live merge.
- **Payouts:** **Settings, Business, Payouts.** Choose how often Stripe pays out (daily or weekly). The Money tab shows what is owed to each host, so you pay franchises yourselves.
- **Receipts:** Stripe can email its own receipt as well. We already send a confirmation, so leave Stripe's receipts off unless you want both.
- **Disputes:** a cardholder can dispute a charge with their bank. Stripe emails the account owner. Keep that email address one you read.
- **Switching back to test:** to test with fake cards again, put the test keys back in the three secrets.

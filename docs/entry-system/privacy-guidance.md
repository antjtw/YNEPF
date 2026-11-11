# Privacy guidance for the entry system

**This is guidance to take to whoever is responsible for data protection at the federation. It is not legal advice.** The aim is simple: collect only what we need, keep it safe, tell people what we do with it, and delete it when we no longer need it.

The entry system collects far more personal information than the site does today, including information about **children** and some that is **sensitive**. That is why it needs a little care up front.

---

## 1. What we will collect, why, who sees it, and for how long

"Suggested keep" is a starting point for the committee to agree. It is written into the system so that deletion is automatic.

| Information | Why we need it | Who can see it | Suggested keep |
|---|---|---|---|
| Name, email, club, Instagram handle | To run the entry and contact the lifter | Entries team. Name, club and handle also appear publicly on the entries list and lifting order | Entry records: **6 years** (payment records need keeping for accounts). Public lists stay as published |
| BP membership number | To check they can compete | Entries team | 6 years, with the entry |
| Date of birth | To work out age category and whether they are under 18 | Entries team. **Never published** | 6 years, with the entry |
| Men's or women's category, weight class, equipment, event | To enter them correctly | Entries team. Class and event are public on the lists | 6 years, with the entry |
| OpenIPF link, best total, GL points | To check qualification and build flights | Entries team. Best total is public. Already public on OpenIPF | 6 years, with the entry |
| Payment amount, Stripe fee, last four card digits, receipt link | Accounts and refunds | Entries team. **No card details are ever stored by us** | 6 years |
| Photo permission and "do not photograph me" | To respect their wishes | Entries team, and the photographer (names only, for the do-not-photograph list) | Until they change their mind, or one season |
| Parent or guardian name, phone, email, consent (**only** for lifters under 18 on the day) | They must be reachable, and a parent must consent | **Entries team only** | **30 days after the competition** |
| Access needs (**everyone is asked**: hearing, sight, anything else) | So we can help on the day, for example hand signals for someone hard of hearing | **Entries team only**, and a printable list for the day | **30 days after the competition**, unless the committee agrees a longer period and says so in the privacy notice |
| Eligibility note (if someone tells us something about their category) | To handle it privately | **Entries team only** | **30 days after the competition** |
| Waiting list name and email | To offer a place | Entries team. Name and position are public | Until the competition has happened |
| Emails we sent | To show what was sent and resend | Entries team | 12 months |
| Audit log (who changed what) | To prove what happened and when | Entries team | 6 years |
| Volunteer sign-ups and points (phase 3) | To run the points scheme | Entries team. Names appear on the public points list | Points expire after 24 months |

---

## 2. The parts that need most care

### Children (under 18 on the day)

- Collect a **named parent or guardian** with a contact number and email, and their consent, including consent for photos, **only** for lifters who are under 18 on the day. Adults are never asked for guardian details.
- Tell the lifter, on the form, on the check-your-answers page and in the confirmation email, that **a parent or guardian must be with them on the day**.
- Guardian details are in their own private table and are deleted automatically after the competition.
- A child's date of birth is never published.

### Sensitive information

Two questions touch sensitive ground, and I recommend we handle them carefully:

- **Access needs.** You have decided that **every lifter is asked**, and that we store the answers so we can help on the day. That is a good reason, and it is allowed, but because it can reveal health information (which the law calls "special category" data) it needs a little more:
  - The question is asked of everyone, but **answering is optional** ("nothing needed" is fine).
  - It carries a short explanation: why we ask, that the entries team can see it, how long we keep it, and that they can ask us to delete it.
  - When someone does enter something, a **tick-box** asks them to agree that we store it for this reason. That is the "explicit consent" the law expects for health information.
  - It goes in the **privacy policy**, as you suggested.
  - It is only ever seen by the entries team, and the **printable list for the day** is for the people who need it to help on the platform. It is never in a public list, an email or an export for others.
- **Eligibility for a category.** I recommend we do **not** have a free-text box for this. Instead the form says "if you need to talk to us about this, email us and we'll deal with it privately". That avoids us collecting sensitive details in a form, and avoids them being stored and exported by accident. (The design has a private place for a note in case the committee wants the box; my advice is to start without it.)
- Never collect medical details for the eligibility declaration. That goes to the IPF, not us.

### Photos and the photographer

- Two separate questions: "you can use photos and video of me in promotional material" (yes or no) and "I do **not** want to be photographed or filmed".
- Sharing the do-not-photograph list with White Lights Media means we are **passing personal data to another organisation**. It must be mentioned in the privacy notice, and a short written agreement with them about how they use and delete the list is sensible.

---

## 3. The organisations that handle the data for us

Each of these should be named in the privacy notice. For each, check where it stores data.

| Organisation | What they do | Check |
|---|---|---|
| Supabase | Holds the database | You think it is in EU West. Please check under Settings > General (it will say, for example, "West EU (Ireland)" or "West EU (London)"). Either is fine: the UK treats the EU as adequate for personal data, so no extra safeguards are needed. If it turns out to be somewhere else, tell me. |
| Stripe | Takes payments | Stripe is responsible for card data. Stripe's own cookies are used on the payment page. |
| Resend | Sends the emails | Based in the US. They provide the standard safeguards. |
| Vercel | Hosts the website | Keeps normal server logs. |
| White Lights Media | Photographer | See above. |

---

## 4. What to put on the form

- A short, plain **privacy line** on page 1 linking to the privacy notice: what we collect, why, who sees it, and how long we keep it.
- **Name on public lists:** "Your name, club and weight class will be shown on the entries list and the lifting order."
- **Consent boxes are never pre-ticked**, and each is separate (photos, do not photograph).
- The confirmation email says what we hold and how to ask for it to be changed or deleted (email the entries address).

---

## 5. People's rights

People can ask what we hold about them, ask for corrections, and ask for deletion (we can refuse where we must keep records, such as payments). The entries team should know how to respond. A simple rule: **reply within one month**.

In the system:
- "What do we hold about this person?" is a search by email in the entries view.
- "Delete this person's private details" is an action the entries team can take (logged in the audit log).

---

## 6. If something goes wrong

If personal data is lost or seen by someone it should not be, the federation may have to tell the **ICO within 72 hours** if people could be harmed. Agree now who decides and who reports. Keep the contact details for the ICO where the committee can find them.

---

## 7. A short list to take to your data protection lead

- [ ] Agree the "suggested keep" periods above (or change them).
- [ ] Decide whether the federation needs a **data protection impact assessment**. Because we hold data about children and some sensitive data, I recommend doing a short one.
- [ ] Check whether the federation needs to **pay the ICO data protection fee** or is exempt (the ICO has a short online checker).
- [ ] Confirm the **Supabase region** (expected: EU West, which is fine).
- [ ] Agree a **written agreement with White Lights Media** about the do-not-photograph list.
- [ ] Update `docs/privacy-policy-draft.md` and the live privacy policy. I will update the draft with each piece I build, so nothing is missed.
- [ ] Name a person responsible for answering requests and for breaches.

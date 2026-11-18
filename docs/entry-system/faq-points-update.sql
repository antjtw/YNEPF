-- Updates the two points FAQ answers for the new points system (priority links by email, self-service discount codes, memberships).
-- Run it once in the Supabase SQL editor. Safe to run again. You can still edit the wording afterwards in the site editor (FAQs).
update public.faqs set answer_md = $a$You can spend points in several ways, from early access to entries through to a free British Powerlifting membership:

- Priority entry: 1 point
- £20 off competition entry: 4 points
- £20 off, with priority entry: 5 points
- £40 off competition entry: 8 points
- £40 off, with priority entry: 9 points
- Half-price BP membership: 5 points
- Free BP membership: 10 points

Here is how each one works:

- **Priority entry:** if you have at least 1 point, your personal link is emailed to you automatically 24 hours before general entry opens. You do not need to ask. Do not pass your link on: it only works for your email address. The point is taken only when your entry is confirmed, so if you do not use the link you keep it.
- **Entry discounts:** go to [Volunteer points](/points), enter your email address and we will email you a code. Then choose how many £20 discounts you want and for which competition, and you get a discount code straight away. It is for you only and can be used once. The points are taken when your entry is confirmed. Points already set aside for a code or a priority link cannot be spent twice.
- **Memberships:** email [info@ynepf.co.uk](mailto:info@ynepf.co.uk) and say which membership you would like. The treasurer pays for it and the points are taken from your balance.

We are also looking at gift cards and discount codes with our federation partners.$a$
 where question = 'How do I spend points?';

update public.faqs set answer_md = $a$Go to [Volunteer points](/points) to see everyone's points, or enter your email address there and we will email you a code to see your own balance and spend it. Points last 24 months from the day they were earned.$a$
 where question = 'How do I check my points?';

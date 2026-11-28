-- Adds the FAQ "How do I change or cancel my entry?" (how to use Manage your entry, or email the team).
-- Run it once in the Supabase SQL editor. Safe to run again: it does nothing if that question is already there.
-- It goes into the first category with "enter" or "compet" in its name (or the first category if there is none).
-- Move or reword it afterwards in the site editor (FAQs).
--
-- Before you run it, you may want to look for an older FAQ about withdrawing or changing an entry that now needs updating:
--   select question from public.faqs where question ilike '%withdraw%' or question ilike '%cancel%' or question ilike '%change%' or question ilike '%refund%';
insert into public.faqs (category_id, question, answer_md, sort_order)
select c.id, 'How do I change or cancel my entry?', $a$You can change or cancel your entry until entries close, in two ways:

- **Online:** use the **Manage your entry** button in your order confirmation email. We will email you a code to check it is you. Then you can update your name, club or university, Instagram, OpenIPF link and membership number straight away, or ask the entries team for a different weight class or different equipment, or to cancel. The team approves those requests and emails you what they decide.
- **By email:** write to [competitions@ynepf.co.uk](mailto:competitions@ynepf.co.uk). Use this to change your event, date of birth or sex, or for anything to do with money.

Refunds are available until entries close. After that, entries cannot be changed, and if you cancel there is no refund.$a$,
  coalesce((select max(f.sort_order) from public.faqs f where f.category_id = c.id), 0) + 10
from public.faq_categories c
where not exists (select 1 from public.faqs where question = 'How do I change or cancel my entry?')
order by (c.title ilike '%enter%' or c.title ilike '%compet%') desc, c.sort_order, c.title
limit 1;

-- Adds the FAQ "How do gym day passes work?" and adds day passes to "How do I spend points?".
-- Run it once in the Supabase SQL editor. Safe to run again. The new FAQ goes into the first category with "volunteer" in its name,
-- straight after "How do I spend points?". Reword it afterwards in the site editor (FAQs).
insert into public.faqs (category_id, question, answer_md, sort_order)
select c.id, 'How do gym day passes work?', $a$Volunteers can spend **2 points** on a free day pass at one of our partner gyms.

- **How to get one:** go to [Volunteer points](/points), enter your email address and the code we email you, then choose a gym under **Gym day passes**.
- **What you get:** an email with a QR code, and a link to open it on your phone. We also email the gym to say you are coming.
- **At the gym:** show the QR code at reception. They scan it and mark it as used. A pass works once, so please do not share it.
- **How long you have:** 90 days from the day you claim it.
- **Changed your mind?** Give an unused pass back on the points page and your points return.
- **No email?** Check your junk folder, then email [competitions@ynepf.co.uk](mailto:competitions@ynepf.co.uk).$a$,
  coalesce((select f.sort_order from public.faqs f where f.category_id = c.id and f.question = 'How do I spend points?'), (select max(f2.sort_order) from public.faqs f2 where f2.category_id = c.id), 0) + 6
from public.faq_categories c
where not exists (select 1 from public.faqs where question = 'How do gym day passes work?')
order by (c.title ilike '%volunteer%') desc, c.sort_order, c.title
limit 1;

-- "How do I spend points?": the list of prices, and how a day pass works.
update public.faqs set answer_md = replace(answer_md, '- Free BP membership: 10 points', E'- Free BP membership: 10 points\n- Gym day pass: 2 points')
 where question = 'How do I spend points?' and answer_md not ilike '%gym day pass: 2 points%';
update public.faqs set answer_md = replace(answer_md, '- **Memberships:**', E'- **Gym day pass:** go to [Volunteer points](/points) and choose a gym. We email you a QR code to show at reception. See [How do gym day passes work?](/faqs#how-do-gym-day-passes-work).\n- **Memberships:**')
 where question = 'How do I spend points?' and answer_md not ilike '%how do gym day passes work%';

-- Check: select question, answer_md from public.faqs where answer_md ilike '%day pass%';

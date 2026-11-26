-- Adds the FAQ "What is priority entry?" and corrects the other points FAQs so they all say the same thing.
-- Run it once in the Supabase SQL editor. Safe to run again: each step does nothing if it has already been done.
-- The new FAQ goes into the first category with "volunteer" in its name (or the first category if there is none), straight after "How do I spend points?".
-- Wording changes use find-and-replace on the text as it was last written by our SQL files, so if you have edited those answers by hand
-- the change may not apply. Run the check at the bottom to see what is live.

insert into public.faqs (category_id, question, answer_md, sort_order)
select c.id, 'What is priority entry?', $a$Priority entry lets you enter a competition **before general entry opens**. It is one of the ways to spend volunteer points.

- **Who gets it:** everyone with at least 1 volunteer point. You do not need to ask.
- **When:** your personal link is emailed to you 24 hours before general entry opens. For example, if general entry opens at 9am on Saturday, your link arrives at around 9am on Friday. It normally lands between 9:00 and 9:10. The email tells you the exact time your link starts to work.
- **What to do:** open the email (check your junk folder too) and press **Enter with priority**. Enter using the email address the link was sent to.
- **What it costs:** 1 point, taken only once your entry is confirmed. If you do not use the link, you keep your point. You can still enter when general entry opens if you would rather wait.
- **Your link is yours:** it only works once, and only for your email address. Please do not pass it on.

If your link has not arrived by 9:30, check your junk folder and that we have the email address you volunteered with, then email [competitions@ynepf.co.uk](mailto:competitions@ynepf.co.uk).$a$,
  coalesce((select f.sort_order from public.faqs f where f.category_id = c.id and f.question = 'How do I spend points?'), (select max(f2.sort_order) from public.faqs f2 where f2.category_id = c.id), 0) + 5
from public.faq_categories c
where not exists (select 1 from public.faqs where question = 'What is priority entry?')
order by (c.title ilike '%volunteer%') desc, c.sort_order, c.title
limit 1;

-- "How do I spend points?": priority entry now points at the new answer and says "usually", since the time is set per competition.
update public.faqs set answer_md = replace(answer_md,
  'your personal link is emailed to you automatically 24 hours before general entry opens. You do not need to ask.',
  'your personal link is emailed to you automatically, usually 24 hours before general entry opens and at around 9am (see [What is priority entry?](/faqs#what-is-priority-entry)). You do not need to ask.')
 where question = 'How do I spend points?';

-- "How do I earn points?": the old sentence about 24 months said the same thing twice and read as 24 hours to some people.
update public.faqs set answer_md = replace(answer_md,
  'You can bank points for 24 months. After that, they expire 24 months after being earned.',
  'Points last 24 months from the day you earn them, then they expire. When you spend points, the oldest are used first.')
 where question = 'How do I earn points?';

-- "How do I find out when entries open?": mention the priority email.
update public.faqs set answer_md = answer_md || E'\n\nIf you have volunteer points, your priority link is emailed to you before general entry opens. See [What is priority entry?](/faqs#what-is-priority-entry).'
 where question = 'How do I find out when entries open?' and answer_md not ilike '%what is priority entry%';

-- Check: every answer that mentions priority entry or hours, so you can read them side by side.
-- select question, answer_md from public.faqs where answer_md ilike '%priority%' or answer_md ilike '%24 hours%' or answer_md ilike '%24 months%';

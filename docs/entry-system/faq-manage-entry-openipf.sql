-- Updates the live FAQ "How do I change or cancel my entry?" so it also says the OpenIPF link can be changed straight away.
-- Run it once in the Supabase SQL editor. Safe to run again. It does nothing if you have reworded that answer by hand.
update public.faqs set answer_md = replace(answer_md,
  'update your name, club or university, Instagram and membership number straight away',
  'update your name, club or university, Instagram, OpenIPF link and membership number straight away')
 where question = 'How do I change or cancel my entry?';
-- Check: select answer_md from public.faqs where question = 'How do I change or cancel my entry?';

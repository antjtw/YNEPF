-- Switches the old Gmail address for info@ynepf.co.uk in the wording you edit in the editor (FAQs, news posts, footer links, home page
-- blocks and settings). Run it once in the Supabase SQL editor. It only changes text that contains ynepfentries@gmail.com, and it is safe
-- to run again. Check the FAQs and news afterwards: anything about entries (withdrawing, discounts, photo choices) may read better
-- pointing at competitions@ynepf.co.uk instead, and you can change those by hand in the editor.
update public.faqs set answer_md = replace(answer_md, 'ynepfentries@gmail.com', 'info@ynepf.co.uk') where answer_md like '%ynepfentries@gmail.com%';
update public.posts set body_md = replace(body_md, 'ynepfentries@gmail.com', 'info@ynepf.co.uk') where body_md like '%ynepfentries@gmail.com%';
update public.footer_links set url = replace(url, 'ynepfentries@gmail.com', 'info@ynepf.co.uk') where url like '%ynepfentries@gmail.com%';
update public.site_settings set value = replace(value, 'ynepfentries@gmail.com', 'info@ynepf.co.uk') where value like '%ynepfentries@gmail.com%';

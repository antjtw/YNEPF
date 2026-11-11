-- Clears ONE test competition and everything entered into it (entries, payments, refunds, guardian and
-- access-needs details). Run it in the Supabase SQL editor. It cannot be undone.
--
-- Only competitions whose name contains the word TEST are accepted, so a real competition cannot be
-- removed by mistake. Change the name on the line marked  <<< and run it again for each one.
--
-- Why this is not a button in the editor: real entries carry payment records that must be kept for the
-- accounts, so the editor refuses to delete a competition that has entries.
do $$
declare
  v_name constant text := 'TEST Spring Open';      -- <<< the exact name of the test competition
  c uuid;
begin
  select id into c from public.competitions where name = v_name;
  if c is null then raise exception 'No competition is called "%"', v_name; end if;
  if position('TEST' in v_name) = 0 then raise exception 'Refusing: "%" does not look like a test competition', v_name; end if;
  delete from public.refunds  where payment_id in (select p.id from public.payments p join public.entries e on e.id = p.entry_id where e.competition_id = c);
  delete from public.payments where entry_id in (select id from public.entries where competition_id = c);
  delete from public.entries  where competition_id = c;      -- guardian and access-needs details go with them
  delete from public.competitions where id = c;
  raise notice 'Cleared "%"', v_name;
end $$;

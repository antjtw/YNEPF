-- Lets news posts carry PDF attachments: adds the attachments column to posts and the news-files storage bucket.
-- Run it once in the Supabase SQL editor. Safe to run again. (It is also part of supabase/schema.sql, so the all-in-one file includes it.)
-- Files attached to a post (PDFs): a list of { name, url, size }. At most 10. The files themselves live in the news-files bucket below.
alter table public.posts add column if not exists attachments jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_attachments_ok') then
    alter table public.posts add constraint posts_attachments_ok check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);
  end if;
end $$;

-- News attachments: PDFs, in a third bucket, news-files. Public to read, only editors can add, replace or remove, and the bucket refuses anything
-- that is not a PDF or is over 10 MB. Skipped quietly on a database with no Storage.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('news-files', 'news-files', true, 10485760, array['application/pdf'])
    on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
  exception when undefined_column then
    insert into storage.buckets (id, name, public) values ('news-files', 'news-files', true)
    on conflict (id) do update set public = true;
  end;
  drop policy if exists "news files public read" on storage.objects;
  create policy "news files public read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'news-files');
  drop policy if exists "news files editors add" on storage.objects;
  create policy "news files editors add" on storage.objects
    for insert to authenticated with check (bucket_id = 'news-files' and public.is_editor());
  drop policy if exists "news files editors change" on storage.objects;
  create policy "news files editors change" on storage.objects
    for update to authenticated using (bucket_id = 'news-files' and public.is_editor())
    with check (bucket_id = 'news-files' and public.is_editor());
  drop policy if exists "news files editors remove" on storage.objects;
  create policy "news files editors remove" on storage.objects
    for delete to authenticated using (bucket_id = 'news-files' and public.is_editor());
end $$;

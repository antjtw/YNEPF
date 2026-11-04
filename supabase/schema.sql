-- ============================================================================
-- YNEPF site schema. Run once in the Supabase SQL editor (safe to re-run).
--
-- Model:
--   * The public (anon) can READ published content and nothing else.
--   * Writing is limited to people on the `editors` allow-list (below), matched
--     by their VERIFIED email address. Two roles: `admin` (can also manage the
--     list) and `editor`.
--   * Anyone can create a login (email/password, Google, Apple), but a login
--     that is not on the list can change nothing. Removing someone from the list
--     takes their access away immediately. So leave "Allow new users to sign up"
--     ON in Supabase: the allow-list is the gate, not sign-up.
--   * The first admin is ynepfentries@gmail.com (added at the bottom of this file).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profiles: a display name for each editor (used as the post author)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             nullif((select e.display_name from public.editors e where e.email = lower(new.email)), ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for anyone who already exists.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Editors: the allow-list. Email is stored lower-case.
-- ---------------------------------------------------------------------------
create table if not exists public.editors (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email like '%_@_%'),
  display_name text not null default '',
  role text not null default 'editor' check (role in ('admin', 'editor')),
  added_by text not null default '',
  created_at timestamptz not null default now()
);

-- The caller's role, or null if they are not allowed in. Requires a CONFIRMED
-- email on the login, so nobody can sign up with someone else's address.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select e.role
  from public.editors e
  join auth.users u on lower(u.email) = e.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1
$$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select public.my_role() is not null $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- There must always be at least one admin.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (select 1 from public.editors where role = 'admin' and id <> old.id) then
      raise exception 'There must always be at least one admin.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists editors_protect_last_admin on public.editors;
create trigger editors_protect_last_admin
  before update or delete on public.editors
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------------
-- Organisation (the committee page): sections of people
-- ---------------------------------------------------------------------------
create table if not exists public.org_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.org_sections (id) on delete cascade,
  name text not null,
  role text not null default '',
  instagram text not null default '',   -- handle only, no @ and no URL
  blurb text not null default '',
  sort_order integer not null default 0
);
create index if not exists people_section_idx on public.people (section_id, sort_order);

-- ---------------------------------------------------------------------------
-- FAQs: categories of questions
-- ---------------------------------------------------------------------------
create table if not exists public.faq_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort_order integer not null default 0
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.faq_categories (id) on delete cascade,
  question text not null,
  answer_md text not null default '',
  sort_order integer not null default 0
);
create index if not exists faqs_category_idx on public.faqs (category_id, sort_order);

-- ---------------------------------------------------------------------------
-- Footer: groups of links. A group can be a column of links, the links in the
-- bottom row (privacy policy and so on), or the social links under the logo.
-- Edited under Footer in the site editor.
-- ---------------------------------------------------------------------------
create table if not exists public.footer_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  placement text not null default 'column' check (placement in ('column', 'bottom', 'social')),
  sort_order integer not null default 0
);

create table if not exists public.footer_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.footer_groups (id) on delete cascade,
  label text not null,
  url text not null,
  sort_order integer not null default 0
);
create index if not exists footer_links_group_idx on public.footer_links (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- Records: each row points at one published Google Sheet (e.g. "Men's classic").
-- The page fetches the sheet's CSV in the visitor's browser, so changing the
-- link here repoints the page with no deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.record_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null default '',
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Contact form messages. The public can ADD a message and nothing else; only
-- editors can read, mark as handled, or delete them.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 4000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- Simple flood protection: at most 3 messages per email address per hour, and
-- 60 in total per hour. Runs with the owner's rights so it can count rows the
-- visitor is not allowed to see.
create or replace function public.contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.contact_messages
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_limit on public.contact_messages;
create trigger contact_messages_limit before insert on public.contact_messages
  for each row execute function public.contact_rate_limit();

-- ---------------------------------------------------------------------------
-- News posts
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body_md text not null default '',
  post_date timestamptz not null default now(),
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_date_idx on public.posts (post_date desc);

-- ---------------------------------------------------------------------------
-- Competitions
--   Dates are plain dates. Entry open/close are instants (timestamptz); the
--   admin screen enters them as UK time (GMT/BST) and converts.
-- ---------------------------------------------------------------------------
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',       -- light markdown
  label text not null default '',             -- optional tag, e.g. "Sponsor TBD"
  start_date date not null,
  end_date date,                               -- null = single day
  venue_name text not null default '',
  venue_address text not null default '',      -- optional, sharpens the Maps link
  map_url text not null default '',            -- optional override of the Maps link
  capacity integer,
  entry_url text not null default '',
  entry_opens timestamptz,
  entry_closes timestamptz,
  entries_full boolean not null default false,  -- full before entry closes: shows the waiting list instead
  waitlist_url text not null default '',       -- Google Form for the waiting list
  lifting_order_url text not null default '',  -- published Google Sheet (CSV) of the lifting order
  openipf_url text not null default '',        -- link to the results page on OpenIPF
  slug text not null default '',               -- web address, e.g. 2027-yne-march-open (made for you if blank)
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Upgrades for databases created by an earlier version of this file.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'competitions' and column_name = 'entry_manually_closed') then
    alter table public.competitions rename column entry_manually_closed to entries_full;
  end if;
end $$;
alter table public.competitions add column if not exists entries_full boolean not null default false;
alter table public.competitions add column if not exists waitlist_url text not null default '';
alter table public.competitions add column if not exists lifting_order_url text not null default '';
alter table public.competitions add column if not exists openipf_url text not null default '';
alter table public.competitions add column if not exists slug text not null default '';
-- Other calendar events (AGM, EGM, referee courses...) share this table. They
-- have no entry window, waiting list, lifting order or results link.
alter table public.competitions add column if not exists kind text not null default 'competition';
alter table public.competitions add column if not exists start_time time;   -- optional, UK clock time
alter table public.competitions add column if not exists end_time time;     -- optional, same day as the first day
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'competitions_kind_check') then
    alter table public.competitions add constraint competitions_kind_check check (kind in ('competition', 'event'));
  end if;
end $$;

-- A blank slug becomes "<year>-<name>", made unique with -2, -3... if needed.
create or replace function public.competition_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if coalesce(new.slug, '') <> '' then
    return new;
  end if;
  base := trim(both '-' from regexp_replace(lower(extract(year from new.start_date)::text || ' ' || new.name), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'competition'; end if;
  candidate := base;
  while exists (select 1 from public.competitions where slug = candidate and id <> new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists competitions_slug on public.competitions;
create trigger competitions_slug before insert or update on public.competitions
  for each row execute function public.competition_slug();

-- Give existing competitions an address (one at a time so each is unique).
do $$
declare r record;
begin
  for r in select id from public.competitions where slug = '' order by start_date, created_at loop
    update public.competitions set slug = '' where id = r.id;
  end loop;
end $$;
create unique index if not exists competitions_slug_key on public.competitions (slug);

create index if not exists competitions_start_idx on public.competitions (start_date);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists competitions_touch on public.competitions;
create trigger competitions_touch before update on public.competitions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Public view of competitions.
--   The entry link is only returned while entry is genuinely open, so the
--   link "goes live" at the entry-open time and disappears at the close time
--   (or when closed by hand), enforced by the database, not just the page.
--   This view deliberately runs with its owner's rights so anon can use it
--   without having any access to the underlying table.
-- ---------------------------------------------------------------------------
drop view if exists public.competitions_public;
create view public.competitions_public as
select
  id, name, description, label, kind, start_date, end_date, start_time, end_time,
  venue_name, venue_address, map_url, capacity,
  entry_opens, entry_closes, entries_full,
  case
    when entry_url <> ''
     and not entries_full
     and (entry_opens is null or entry_opens <= now())
     and (entry_closes is null or entry_closes > now())
    then entry_url
    else ''
  end as entry_url,
  -- The waiting list only appears once the competition is marked full.
  case when entries_full then waitlist_url else '' end as waitlist_url,
  lifting_order_url,
  openipf_url,
  slug
from public.competitions
where published;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.editors         enable row level security;
alter table public.contact_messages enable row level security;
alter table public.org_sections    enable row level security;
alter table public.people          enable row level security;
alter table public.faq_categories  enable row level security;
alter table public.faqs            enable row level security;
alter table public.record_sources  enable row level security;
alter table public.footer_groups   enable row level security;
alter table public.footer_links    enable row level security;
alter table public.posts           enable row level security;
alter table public.competitions    enable row level security;

-- Profiles: editors can see everyone's name, and edit only their own.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_editor());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid() and public.is_editor()) with check (id = auth.uid());

-- Contact messages: anyone may send one; only editors can read or manage them.
drop policy if exists "anyone can send" on public.contact_messages;
create policy "anyone can send" on public.contact_messages
  for insert to anon, authenticated with check (true);
drop policy if exists "editors manage" on public.contact_messages;
create policy "editors manage" on public.contact_messages
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- The allow-list: only admins can see or change it.
drop policy if exists "admins manage editors" on public.editors;
create policy "admins manage editors" on public.editors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public read + editor write for the simple content tables.
do $$
declare t text;
begin
  foreach t in array array['org_sections','people','faq_categories','faqs','record_sources','footer_groups','footer_links'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "editors write" on public.%I', t);
    execute format('create policy "editors write" on public.%I for all to authenticated using (public.is_editor()) with check (public.is_editor())', t);
  end loop;
end $$;

-- Posts: the public sees published posts whose date has arrived. Editors see all.
drop policy if exists "public read" on public.posts;
create policy "public read" on public.posts
  for select to anon, authenticated using (published and post_date <= now());
drop policy if exists "editors all" on public.posts;
create policy "editors all" on public.posts
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- Competitions: the public reads only through competitions_public. Editors use the table.
drop policy if exists "editors all" on public.competitions;
create policy "editors all" on public.competitions
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.org_sections, public.people, public.faq_categories,
                public.faqs, public.posts, public.competitions_public, public.record_sources,
                public.footer_groups, public.footer_links
  to anon;

grant select, insert, update, delete on
  public.org_sections, public.people, public.faq_categories, public.faqs,
  public.posts, public.competitions, public.record_sources, public.editors,
  public.footer_groups, public.footer_links
  to authenticated;

grant select on public.competitions_public to authenticated;
grant select, update on public.profiles to authenticated;

grant insert on public.contact_messages to anon;
grant select, insert, update, delete on public.contact_messages to authenticated;

grant execute on function public.my_role(), public.is_editor(), public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- First admin. Sign in as this address (Google, or create a password) to get in.
-- ---------------------------------------------------------------------------
insert into public.editors (email, display_name, role, added_by)
values ('ynepfentries@gmail.com', 'YNEPF Entries', 'admin', 'setup')
on conflict (email) do nothing;

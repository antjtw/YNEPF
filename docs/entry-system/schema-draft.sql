-- ============================================================================
-- YNEPF entry system: database design for phases 1 to 3
--
-- DRAFT FOR REVIEW. It is not run against the live database. It builds on
-- supabase/schema.sql (competitions, editors, my_role() and friends) and is
-- written in the same upgrade-in-place style, so it is safe to run twice.
-- It is tested in a scratch database against the real schema (see
-- docs/entry-system/plan.md, "How this is tested").
--
-- Phase map (which tables each phase needs):
--   1A  take a payment      sections 0 to 7 (entries, payments, holds), 10, 11
--   1B  entries desk        add-ons, payout rules and settlement, stages, public views
--   1C  full houses         waiting list, offers, invites, OpenIPF fields, emails
--   2   lifting order       section 9
--   3   volunteers, points  section 12
--
-- Money is always whole pence (integer). Nothing here ever stores card details.
-- Personal data that only the entries team needs lives in entry_private.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Roles
--    admin       everything, including users and settings
--    entries     entries, refunds, waiting list, lifting order, money reports
--    editor      site content, and creating competitions (not their entry settings)
--    contributor news posts only
-- is_editor() keeps its old meaning ("manages site content"), so every existing
-- content table behaves exactly as before. New helper functions cover the rest.
-- WHEN THIS IS ADOPTED these definitions move into supabase/schema.sql itself. Until
-- then, re-running the old schema.sql would quietly put is_editor() back to "anyone on the list".
-- ---------------------------------------------------------------------------
alter table public.editors drop constraint if exists editors_role_check;
alter table public.editors add constraint editors_role_check
  check (role in ('admin', 'entries', 'editor', 'contributor'));

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.my_role() in ('admin', 'editor'), false) $$;

create or replace function public.is_entries() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.my_role() in ('admin', 'entries'), false) $$;

create or replace function public.can_post() returns boolean
language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.my_role() in ('admin', 'editor', 'contributor'), false) $$;

grant execute on function public.is_entries(), public.can_post() to anon, authenticated;

-- Contributors may write news posts (and only those).
drop policy if exists "editors all" on public.posts;
drop policy if exists "posters all" on public.posts;
create policy "posters all" on public.posts
  for all to authenticated using (public.can_post()) with check (public.can_post());
-- The entries team needs to read competitions to run their entries.
drop policy if exists "entries read" on public.competitions;
create policy "entries read" on public.competitions
  for select to authenticated using (public.is_entries());

-- ---------------------------------------------------------------------------
-- 1. Who gets paid: hosts and payees
--    Every competition has a host (the federation for YNE competitions, a club or
--    university for franchise competitions). We take the entry money, keep our cut,
--    and pay the rest out after entries close. Merchandise goes 100% to the host
--    and photo packages 100% to the photographer, unless a competition says
--    otherwise.
-- ---------------------------------------------------------------------------
create table if not exists public.payees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('federation', 'host', 'photographer')),
  contact_email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                              -- "Implexus Gym", "North East Strength Culture"
  kind text not null check (kind in ('federation', 'franchise', 'university')),
  payee_id uuid not null references public.payees (id),   -- who is paid the host's share
  default_cut_percent numeric(5, 2) not null default 0 check (default_cut_percent between 0 and 100),   -- our cut of ENTRY money
  created_at timestamptz not null default now()
);

alter table public.competitions add column if not exists host_id uuid references public.hosts (id);

-- ---------------------------------------------------------------------------
-- 2. Reference data (editable by admins, read by everyone)
-- ---------------------------------------------------------------------------
create table if not exists public.weight_classes (
  id uuid primary key default gen_random_uuid(),
  sex text not null check (sex in ('M', 'F')),
  label text not null,                                    -- "66", "120+"
  upper_kg numeric(5, 1),                                 -- null for the top "+" class
  sort_order integer not null default 0,
  min_age_category text not null default '',              -- '' = open to all; e.g. 'SJ' for men's 53 and women's 43 (see plan)
  active boolean not null default true,
  unique (sex, label)
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                              -- "Yorkshire & North East", "North West", ...
  is_home boolean not null default false,                 -- true for our own division: not a guest
  openlifter_name text not null default '',               -- the division name as set up in the OpenLifter meet
  sort_order integer not null default 0
);

-- Age category from year of birth (IPF calendar-year rule). Never stored on an entry.
create or replace function public.age_category_on(dob date, on_date date)
returns text
language sql immutable
as $$
  select case
    when (extract(year from on_date) - extract(year from dob)) between 14 and 18 then 'SJ'
    when (extract(year from on_date) - extract(year from dob)) between 19 and 23 then 'J'
    when (extract(year from on_date) - extract(year from dob)) between 24 and 39 then ''     -- open
    when (extract(year from on_date) - extract(year from dob)) between 40 and 49 then 'M1'
    when (extract(year from on_date) - extract(year from dob)) between 50 and 59 then 'M2'
    when (extract(year from on_date) - extract(year from dob)) between 60 and 69 then 'M3'
    when (extract(year from on_date) - extract(year from dob)) >= 70 then 'M4'
    else 'under14'
  end
$$;
-- Exact age on the day (for the under-18 rule and the OpenLifter export).
create or replace function public.age_on(dob date, on_date date) returns integer
language sql immutable as $$ select extract(year from age(on_date, dob))::int $$;

-- ---------------------------------------------------------------------------
-- 3. Competition entry settings
-- ---------------------------------------------------------------------------
alter table public.competitions add column if not exists path_slug text not null default '';        -- "yne-march-open" (the year is added in the address)
alter table public.competitions add column if not exists entry_method text not null default 'external'
  check (entry_method in ('yne', 'external'));                                                       -- 'external' = the old entry link
alter table public.competitions add column if not exists entries_closed_manually boolean not null default false;
alter table public.competitions add column if not exists form_summary text not null default '';
alter table public.competitions add column if not exists banner_path text not null default '';
create unique index if not exists competitions_year_path_slug
  on public.competitions ((extract(year from start_date)::int), path_slug) where path_slug <> '';

-- If the address name changes after publishing, the old address keeps working.
create table if not exists public.competition_redirects (
  old_path text primary key,                              -- "/competitions/2027/yne-march"
  competition_id uuid not null references public.competitions (id) on delete cascade
);

create table if not exists public.entry_settings (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  events text[] not null default array['full_power', 'bench_only'],
  equipment text[] not null default array['classic', 'equipped'],
  entries_close_at timestamptz,
  hold_minutes integer not null default 15,
  refund_cutoff timestamptz,                              -- full automatic refund up to here
  openipf_mode text not null default 'optional' check (openipf_mode in ('required', 'optional', 'hidden')),
  qualification_mode text not null default 'none' check (qualification_mode in ('none', 'glp', 'totals')),
  qualification_glp numeric(5, 2),
  days integer not null default 1,
  sessions_per_day integer not null default 2,
  platforms integer not null default 1,
  flights_per_session integer not null default 2,
  offer_window_hours integer not null default 48,
  offer_reminder_hours integer not null default 12,
  offer_automatic boolean not null default true,          -- offer places automatically, or wait for "Offer next place"
  stripe_fee_policy text not null default 'federation' check (stripe_fee_policy in ('federation', 'pro_rata')),
  success_message_md text not null default '',
  updated_at timestamptz not null default now()
);

-- Entry stages: who can enter when. Each stage only opens if places remain.
create table if not exists public.entry_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  kind text not null check (kind in ('priority', 'qualifier', 'general', 'guest')),
  name text not null,
  opens_at timestamptz not null,
  sort_order integer not null default 0
);

-- Prices: first matching rule wins, in sort order. A null column means "any".
create table if not exists public.price_rules (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  sort_order integer not null default 0,
  label text not null,                                    -- "Sub-junior, any event"
  event text check (event in ('full_power', 'bench_only')),
  age_category text,                                      -- 'SJ', 'J', 'M1' ...
  equipment text check (equipment in ('classic', 'equipped')),
  price_pence integer not null check (price_pence >= 0)
);

-- Qualifying totals per weight class and sex (for competitions that qualify on totals).
create table if not exists public.qualifying_totals (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  weight_class_id uuid not null references public.weight_classes (id),
  total_kg numeric(6, 1) not null,
  primary key (competition_id, weight_class_id)
);

-- Add-ons: photo packages and merchandise.
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  kind text not null check (kind in ('photo', 'merch')),  -- decides who is paid (see payout_rules)
  name text not null,
  description text not null default '',
  price_pence integer not null check (price_pence >= 0),
  stock integer,                                          -- null = unlimited
  report_to_email text not null default '',
  size_guide_path text not null default '',
  sort_order integer not null default 0
);
create table if not exists public.addon_options (          -- e.g. T-shirt sizes
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.addons (id) on delete cascade,
  label text not null,
  stock integer,
  sort_order integer not null default 0
);
create table if not exists public.addon_images (            -- up to 4 per add-on, alt text required
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.addons (id) on delete cascade,
  path text not null,
  alt text not null check (char_length(alt) > 0),
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. Entries
--    status: held (place reserved while paying), paid, comped (free), cancelled,
--    refunded. Only held entries with an unexpired hold, paid and comped entries
--    use up a place.
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  status text not null default 'held' check (status in ('held', 'paid', 'comped', 'cancelled', 'refunded')),
  source text not null default 'web' check (source in ('web', 'priority', 'offer', 'manual')),
  stage_id uuid references public.entry_stages (id),
  -- About you
  email text not null check (email = lower(email)),
  full_name text not null,
  display_name text not null default '',                  -- how it appears on public lists; blank = full_name
  bp_number text not null default '',
  date_of_birth date not null,
  sex text not null check (sex in ('M', 'F')),
  division_id uuid references public.divisions (id),
  club text not null default '',
  instagram text not null default '',
  photo_ok boolean not null default false,                -- promotional photos and video
  photo_opt_out boolean not null default false,           -- goes on the do-not-photograph list
  eligibility_confirmed boolean not null default false,
  -- Your lifting
  weight_class_id uuid references public.weight_classes (id),
  equipment text check (equipment in ('classic', 'equipped')),
  event text check (event in ('full_power', 'bench_only')),
  openipf_url text not null default '',
  openipf_slug text not null default '',
  openipf_status text not null default 'pending' check (openipf_status in ('pending', 'found', 'not_found', 'error', 'skipped')),
  openipf_checked_at timestamptz,
  best_total_kg numeric(6, 1),                            -- last 12 months, filled in the background
  best_glp numeric(5, 2),
  -- Flags worked out by the system, adjustable by the entries team (with a reason in the audit log)
  is_guest boolean not null default false,
  can_break_records boolean not null default true,
  qualification text not null default 'unknown' check (qualification in ('met', 'not_met', 'unknown')),
  -- Money and timing
  price_pence integer not null default 0,
  points_used integer not null default 0,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default ''
);
create index if not exists entries_competition_status on public.entries (competition_id, status);
create index if not exists entries_email on public.entries (email);
create index if not exists entries_bp_number on public.entries (bp_number) where bp_number <> '';

-- Sensitive details, readable only by the entries team. Never exported, emailed or in a public view.
create table if not exists public.entry_private (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  guardian_name text not null default '',                 -- under 18 on the competition day
  guardian_phone text not null default '',
  guardian_email text not null default '',
  guardian_consent boolean not null default false,
  access_needs text not null default '',
  eligibility_note text not null default '',
  delete_after date                                        -- when this row is removed automatically (see plan, privacy)
);

create table if not exists public.entry_addons (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  addon_id uuid not null references public.addons (id),
  option_id uuid references public.addon_options (id),
  quantity integer not null default 1 check (quantity > 0),
  price_pence integer not null check (price_pence >= 0)
);

-- ---------------------------------------------------------------------------
-- 5. Payments (Stripe holds the card data; we hold ids and amounts)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete restrict,
  stripe_session_id text not null unique,
  stripe_payment_intent text unique,
  amount_pence integer not null check (amount_pence >= 0),
  stripe_fee_pence integer not null default 0,            -- Stripe keeps this even if we refund
  card_brand text not null default '',
  card_last4 text not null default '',
  receipt_url text not null default '',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'expired')),
  created_at timestamptz not null default now()
);
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  stripe_refund_id text unique,                            -- null until Stripe confirms
  amount_pence integer not null check (amount_pence > 0),
  reason text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
-- Every Stripe event we receive, so a repeated delivery is ignored.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 6. Places left (what the entry button and the live count use)
--    Held entries use a place only until their hold runs out.
-- ---------------------------------------------------------------------------
create or replace function public.places_taken(c uuid) returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.entries
  where competition_id = c
    and (status in ('paid', 'comped') or (status = 'held' and hold_expires_at > now()))
$$;
create or replace function public.places_left(c uuid) returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(coalesce((select capacity from public.competitions where id = c), 0) - public.places_taken(c), 0)
$$;
grant execute on function public.places_left(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Waiting list, offers and priority links
-- ---------------------------------------------------------------------------
create table if not exists public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'entered', 'declined', 'lapsed', 'removed')),
  joined_at timestamptz not null default now(),
  unique (competition_id, email)
);
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  waiting_id uuid not null references public.waiting_list (id) on delete cascade,
  token_hash text not null unique,                        -- the emailed token is never stored, only its hash
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reminder_sent_at timestamptz,
  outcome text check (outcome in ('entered', 'declined', 'lapsed'))
);
create table if not exists public.invites (                -- priority entry (phase 3) and manual personal links
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  stage_id uuid references public.entry_stages (id),
  expires_at timestamptz,
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 8. Emails: the wording (federation default, per-competition override) and a log
-- ---------------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions (id) on delete cascade,   -- null = the federation default
  kind text not null check (kind in ('entry_confirmed', 'entry_copy', 'waiting_joined', 'offer', 'offer_reminder',
    'offer_expired', 'entry_cancelled', 'lifting_order', 'priority_entry')),
  subject text not null,
  body_md text not null,
  unique nulls not distinct (competition_id, kind)
);
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  to_email text not null,
  entry_id uuid references public.entries (id) on delete set null,
  waiting_id uuid references public.waiting_list (id) on delete set null,
  provider_id text not null default '',                   -- Resend's id for the message
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text not null default '',
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. Lifting order (phase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.lifting_orders (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_as text check (published_as in ('provisional', 'final')),
  published_at timestamptz,
  prime_time_enabled boolean not null default false,       -- the top lifters by GL points in their own session(s)
  prime_time_men integer not null default 0,
  prime_time_women integer not null default 0,
  max_full_power_per_flight integer not null default 14,
  max_per_flight integer not null default 20
);
create table if not exists public.lo_sessions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  day integer not null,
  session_no integer not null,
  platform integer not null default 1,
  name text not null default '',                           -- e.g. "Prime Time"
  is_prime_time boolean not null default false,
  weigh_in_at timestamptz,
  lift_off_at timestamptz,
  awards_at timestamptz,
  unique (competition_id, day, session_no, platform)
);
create table if not exists public.lo_flights (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lo_sessions (id) on delete cascade,
  letter text not null,                                    -- runs on across the whole competition: A, B, C ...
  locked boolean not null default false
);
create table if not exists public.lo_assignments (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  flight_id uuid not null references public.lo_flights (id) on delete cascade,
  position integer not null default 0,
  locked boolean not null default false,
  lot_number integer,
  reason text not null default ''                          -- why the auto sort put them here
);

-- ---------------------------------------------------------------------------
-- 10. Audit log: who did what and when, with before and after. Append only.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text not null default 'system',
  table_name text not null,
  row_id text not null default '',
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb
);
create index if not exists audit_log_row on public.audit_log (table_name, row_id, at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
declare who text := 'system'; rid text;
begin
  if auth.uid() is not null then
    select coalesce(u.email, 'unknown') into who from auth.users u where u.id = auth.uid();
  end if;
  rid := coalesce((to_jsonb(coalesce(new, old))->>'id'), (to_jsonb(coalesce(new, old))->>'entry_id'), '');
  insert into public.audit_log (actor_id, actor_email, table_name, row_id, action, before, after)
  values (auth.uid(), coalesce(who, 'system'), tg_table_name, rid, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['entries', 'entry_private', 'entry_addons', 'payments', 'refunds', 'entry_settings', 'entry_stages',
                           'price_rules', 'addons', 'waiting_list', 'offers', 'invites', 'lifting_orders', 'lo_sessions',
                           'lo_flights', 'lo_assignments', 'editors'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Money: who is owed what once entries close
--     payout_rules say, for each kind of money, who receives what percentage.
--     competition_settlement() turns the paid entries into "money to send".
-- ---------------------------------------------------------------------------
create table if not exists public.payout_rules (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  category text not null check (category in ('entry', 'merch', 'photo')),
  payee_id uuid not null references public.payees (id),
  percent numeric(5, 2) not null check (percent between 0 and 100),
  primary key (competition_id, category, payee_id)
);
create table if not exists public.payouts (                -- a record that we have sent the money
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  payee_id uuid not null references public.payees (id),
  amount_pence integer not null check (amount_pence > 0),
  paid_on date not null,
  reference text not null default '',
  created_by text not null default ''
);

-- One row per payee: what they are owed, split by kind of money, less their share of Stripe fees.
-- Refunded and cancelled entries are left out of the takings, but Stripe keeps its fee on them,
-- so every fee still counts. The rows add up: sum(net) = takings - fees, provided each kind of money's
-- percentages total 100 and the federation has a rule row (0% is fine) to receive any leftover fee pence.
create or replace function public.competition_settlement(c uuid)
returns table (payee_id uuid, payee_name text, payee_kind text, entry_pence bigint, merch_pence bigint, photo_pence bigint,
               gross_pence bigint, fee_pence bigint, net_pence bigint)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  fees bigint; policy text; fed uuid;
begin
  select coalesce(sum(p.stripe_fee_pence), 0) into fees
    from public.payments p join public.entries e on e.id = p.entry_id
   where e.competition_id = c and p.status = 'succeeded';
  select stripe_fee_policy into policy from public.entry_settings where competition_id = c;
  policy := coalesce(policy, 'federation');
  select py.id into fed from public.payees py where py.kind = 'federation' limit 1;

  return query
  with live as (select e.id, e.price_pence from public.entries e where e.competition_id = c and e.status in ('paid', 'comped')),
  money as (
    select 'entry'::text as category,
           coalesce((select sum(l.price_pence) from live l), 0) - coalesce((select sum(ea.price_pence) from public.entry_addons ea join live l on l.id = ea.entry_id), 0) as pence
    union all
    select a.kind, coalesce(sum(ea.price_pence), 0)
      from (values ('merch'), ('photo')) as a(kind)
      left join public.addons ad on ad.competition_id = c and ad.kind = a.kind
      left join public.entry_addons ea on ea.addon_id = ad.id and ea.entry_id in (select id from live)
     group by a.kind
  ),
  raw as (
    select r.payee_id, m.category, r.percent, m.pence as category_pence, round(m.pence * r.percent / 100.0)::bigint as pence
      from money m join public.payout_rules r on r.competition_id = c and r.category = m.category
  ),
  -- Rounding each share can leave a penny over or short. When a category's shares add up to 100%,
  -- the difference goes to the payee with the biggest share, so the category always adds up exactly.
  split as (
    select payee_id, category,
           pence + case when sum(percent) over (partition by category) = 100
                         and row_number() over (partition by category order by percent desc, payee_id) = 1
                        then category_pence - sum(pence) over (partition by category) else 0 end as pence
      from raw
  ),
  per_payee as (
    select s.payee_id,
           sum(case when s.category = 'entry' then s.pence else 0 end)::bigint as entry_pence,
           sum(case when s.category = 'merch' then s.pence else 0 end)::bigint as merch_pence,
           sum(case when s.category = 'photo' then s.pence else 0 end)::bigint as photo_pence,
           sum(s.pence)::bigint as gross_pence
      from split s group by s.payee_id
  ),
  total as (select coalesce(sum(gross_pence), 0)::bigint as g from per_payee),
  shared as (
    select pp.*,
      case when policy = 'pro_rata' and (select g from total) > 0 then floor(fees * pp.gross_pence::numeric / (select g from total))::bigint
           when policy = 'federation' and pp.payee_id = fed then fees
           else 0 end as fee_pence
    from per_payee pp
  )
  select s.payee_id, py.name, py.kind, s.entry_pence, s.merch_pence, s.photo_pence, s.gross_pence,
         -- any pence left over from rounding goes to the federation, so the rows always add up
         (s.fee_pence + case when s.payee_id = fed then fees - (select coalesce(sum(x.fee_pence), 0) from shared x) else 0 end)::bigint,
         (s.gross_pence - s.fee_pence - case when s.payee_id = fed then fees - (select coalesce(sum(x.fee_pence), 0) from shared x) else 0 end)::bigint
    from shared s join public.payees py on py.id = s.payee_id
   order by (py.kind = 'federation'), py.name;
end;
$$;
grant execute on function public.competition_settlement(uuid) to authenticated;   -- entries team and admins only (checked in the app and by RLS on the tables it reads)

-- ---------------------------------------------------------------------------
-- 12. Volunteers, points and priority entry (phase 3)
-- ---------------------------------------------------------------------------
create table if not exists public.volunteer_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                              -- "Loader", "Referee", "Set up and take down" ...
  points integer not null default 0,
  sort_order integer not null default 0
);
create table if not exists public.rota_slots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  role_id uuid not null references public.volunteer_roles (id),
  day integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  places integer not null default 1
);
create table if not exists public.rota_signups (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.rota_slots (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null,
  status text not null default 'signed_up' check (status in ('signed_up', 'done', 'no_show', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (slot_id, email)
);
-- Append only. A balance is the sum of unexpired rows; spending uses the oldest first.
create table if not exists public.points_ledger (
  id bigint generated always as identity primary key,
  email text not null check (email = lower(email)),
  delta integer not null,                                  -- positive earned, negative spent
  reason text not null,
  signup_id uuid references public.rota_signups (id),
  entry_id uuid references public.entries (id),
  earned_at timestamptz not null default now(),
  expires_at timestamptz                                   -- 24 months after earning, for earned rows
);
create index if not exists points_ledger_email on public.points_ledger (email);

-- ---------------------------------------------------------------------------
-- 13. Public views: only what the website is allowed to show
-- ---------------------------------------------------------------------------
-- The entries list (shown before a lifting order is published): no emails, no private flags.
create or replace view public.entries_public as
select e.id, e.competition_id,
       coalesce(nullif(e.display_name, ''), e.full_name) as name,
       e.club, wc.label as weight_class, e.sex,
       public.age_category_on(e.date_of_birth, c.start_date) as age_category,
       e.event, e.equipment, e.instagram, e.openipf_url, e.best_total_kg, e.paid_at, e.is_guest
from public.entries e
join public.competitions c on c.id = e.competition_id
left join public.weight_classes wc on wc.id = e.weight_class_id
where e.status in ('paid', 'comped');

-- The waiting list: name and position only.
create or replace view public.waiting_list_public as
select w.competition_id, w.full_name as name,
       row_number() over (partition by w.competition_id order by w.joined_at)::int as position
from public.waiting_list w
where w.status in ('waiting', 'offered');

-- The state of entry for a competition card or page.
create or replace view public.competition_entry_state as
select c.id as competition_id, c.capacity, public.places_left(c.id) as places_left,
       c.entry_method, c.entries_closed_manually, es.entries_close_at
from public.competitions c
left join public.entry_settings es on es.competition_id = c.id
where c.published;

-- ---------------------------------------------------------------------------
-- 14. Row level security
--     Rule of thumb: nothing about people is readable by the public except
--     through the views above. The entries team (and admins) see everything to
--     do with entries. Admins alone change roles and the people lists.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Settings that the public competition page needs to read: public read, admins and the entries team write.
  foreach t in array array['entry_settings', 'entry_stages', 'price_rules', 'addons', 'addon_options', 'addon_images',
                           'qualifying_totals', 'weight_classes', 'divisions', 'payees', 'hosts', 'volunteer_roles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "entries write" on public.%I', t);
    execute format('create policy "entries write" on public.%I for all to authenticated using (public.is_entries()) with check (public.is_entries())', t);
  end loop;
  -- Everything about people and money: the entries team only (admins included).
  foreach t in array array['entries', 'entry_private', 'entry_addons', 'payments', 'refunds', 'stripe_events', 'waiting_list', 'offers',
                           'invites', 'email_log', 'payout_rules', 'payouts', 'lifting_orders', 'lo_sessions', 'lo_flights',
                           'lo_assignments', 'competition_redirects', 'rota_slots', 'rota_signups', 'points_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "entries team" on public.%I', t);
    execute format('create policy "entries team" on public.%I for all to authenticated using (public.is_entries()) with check (public.is_entries())', t);
  end loop;
end $$;
-- A published lifting order is public (the page reads these three).
drop policy if exists "public read published" on public.lifting_orders;
create policy "public read published" on public.lifting_orders for select to anon, authenticated using (status = 'published');
drop policy if exists "public read published" on public.lo_sessions;
create policy "public read published" on public.lo_sessions for select to anon, authenticated
  using (exists (select 1 from public.lifting_orders l where l.competition_id = lo_sessions.competition_id and l.status = 'published'));
-- The rota is public so people can sign up; sign-ups themselves go through a function, not directly.
drop policy if exists "public read" on public.rota_slots;
create policy "public read" on public.rota_slots for select to anon, authenticated using (true);
-- Email wording: the entries team writes it; nobody else needs to read it.
alter table public.email_templates enable row level security;
drop policy if exists "entries team" on public.email_templates;
create policy "entries team" on public.email_templates for all to authenticated using (public.is_entries()) with check (public.is_entries());
-- Audit log: readable by the entries team, written only by the trigger. No update or delete is possible.
alter table public.audit_log enable row level security;
drop policy if exists "entries read" on public.audit_log;
create policy "entries read" on public.audit_log for select to authenticated using (public.is_entries());

-- ---------------------------------------------------------------------------
-- 15. Grants
-- ---------------------------------------------------------------------------
grant select on public.entry_settings, public.entry_stages, public.price_rules, public.addons, public.addon_options,
                public.addon_images, public.qualifying_totals, public.weight_classes, public.divisions, public.payees,
                public.hosts, public.volunteer_roles, public.rota_slots, public.lifting_orders, public.lo_sessions to anon;
grant select on public.entries_public, public.waiting_list_public, public.competition_entry_state to anon, authenticated;
grant select, insert, update, delete on
  public.entry_settings, public.entry_stages, public.price_rules, public.addons, public.addon_options, public.addon_images,
  public.qualifying_totals, public.weight_classes, public.divisions, public.payees, public.hosts, public.volunteer_roles,
  public.entries, public.entry_private, public.entry_addons, public.payments, public.refunds, public.stripe_events,
  public.waiting_list, public.offers, public.invites, public.email_templates, public.email_log, public.payout_rules,
  public.payouts, public.lifting_orders, public.lo_sessions, public.lo_flights, public.lo_assignments,
  public.competition_redirects, public.rota_slots, public.rota_signups, public.points_ledger
  to authenticated;
grant select on public.audit_log to authenticated;
-- The audit log and points ledger are append only: nobody gets update or delete on them.
revoke update, delete on public.audit_log, public.points_ledger from authenticated;

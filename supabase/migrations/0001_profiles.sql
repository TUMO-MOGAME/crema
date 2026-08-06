-- Profiles mirror Supabase auth.users.
--
-- This table stays empty in v1: the application runs as a single implicit user
-- and brews.user_id is nullable. It exists now so that turning on Supabase Auth
-- later is a migration that backfills one column and tightens it to NOT NULL,
-- rather than a reshape of every table that owns rows.
--
-- The foreign key to auth.users is deliberately not declared here. It would
-- make these migrations fail on a plain Postgres instance — which is what CI
-- and local development use — and it is added in the same migration that
-- enables authentication, where it belongs.

create table public.profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- "At least one non-whitespace character". See the note in 0003_brews.sql
  -- for why this is not length(btrim(...)) > 0.
  constraint profiles_display_name_not_blank
    check (display_name is null or display_name ~ '[^[:space:]]')
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

comment on table public.profiles is
  'Application-side user profile, keyed by the Supabase auth user id. Empty until authentication is enabled.';

-- The core table.
--
-- Every numeric limit below is meant to match BREW_LIMITS in shared/src/brew.ts
-- exactly. Two did not: the gram floors were written as `> 0` where BREW_LIMITS
-- says 0.1 and 1. That is corrected in 0008_align_brew_limits.sql — this file
-- cannot be edited, because it has been applied.
--
-- The API rejects bad input long before it reaches Postgres, so these
-- constraints are not the primary defence — they are what holds when input
-- arrives from somewhere the API does not control: a migration, a manual fix,
-- the Supabase table editor, or a future service. Validation in application
-- code guards against mistakes; constraints guard against everything else.

create table public.brews (
  id uuid primary key default gen_random_uuid(),

  -- Nullable in v1, where the app runs as a single implicit user. Becomes
  -- NOT NULL in the migration that enables authentication.
  user_id uuid references public.profiles (id) on delete cascade,

  beans text not null,

  -- RESTRICT, not CASCADE: deleting a brew method must fail loudly while brews
  -- still reference it, rather than silently deleting a user's history.
  method_id smallint not null references public.brew_methods (id) on delete restrict,

  coffee_grams numeric(6, 2) not null,
  water_grams numeric(7, 2) not null,

  -- Computed by Postgres, never written by the application.
  --
  -- This is a denormalisation: the value is derivable from the two columns
  -- above. It earns its place because every list view and every coach question
  -- compares ratios, and a generated column cannot drift from its inputs the
  -- way a trigger-maintained or application-maintained one can.
  brew_ratio numeric(10, 4) generated always as (water_grams / coffee_grams) stored,

  rating smallint not null,
  tasting_notes text not null,

  -- Distinct from created_at on purpose, so a brew made yesterday can be
  -- logged today without lying about when it was brewed.
  brewed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft delete. DELETE /api/brews/:id sets this rather than removing the row,
  -- so an accidental deletion is recoverable and the AI suggestion audit trail
  -- keeps its foreign key target.
  deleted_at timestamptz,

  -- The brief requires that a blank field cannot be submitted.
  --
  -- The test is "contains at least one non-whitespace character", written as a
  -- POSIX class rather than length(btrim(...)) > 0. btrim strips spaces only,
  -- so a value of a single tab would pass that check while failing the Zod
  -- .trim().min(1) on the same field — the database and the contract would
  -- disagree about what blank means. This wording matches JavaScript's trim.
  constraint brews_beans_not_blank
    check (beans ~ '[^[:space:]]'),
  constraint brews_beans_max_length
    check (length(beans) <= 120),
  constraint brews_tasting_notes_not_blank
    check (tasting_notes ~ '[^[:space:]]'),
  constraint brews_tasting_notes_max_length
    check (length(tasting_notes) <= 500),

  constraint brews_coffee_grams_range
    check (coffee_grams > 0 and coffee_grams <= 500),
  constraint brews_water_grams_range
    check (water_grams > 0 and water_grams <= 5000),
  constraint brews_rating_range
    check (rating between 1 and 5),

  -- A row cannot be deleted before it was created.
  constraint brews_deleted_after_created
    check (deleted_at is null or deleted_at >= created_at)
);

-- The list view: a user's brews, newest first.
create index brews_user_id_brewed_at_idx
  on public.brews (user_id, brewed_at desc);

-- The method filter.
create index brews_method_id_idx
  on public.brews (method_id);

-- Partial index over live rows only. Every read path filters out soft-deleted
-- brews, so the index should not carry them either.
create index brews_active_brewed_at_idx
  on public.brews (brewed_at desc)
  where deleted_at is null;

create trigger brews_set_updated_at
  before update on public.brews
  for each row
  execute function public.set_updated_at();

comment on table public.brews is
  'One logged brew. Soft-deleted via deleted_at rather than removed.';
comment on column public.brews.brew_ratio is
  'Water-to-coffee ratio, generated. 1:N is rendered from this in the UI.';

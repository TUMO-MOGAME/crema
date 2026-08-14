-- Shared rate-limit windows for the AI routes.
--
-- The in-memory limiter counts per process, and production is serverless: each
-- instance sees only the requests it happens to serve, so a caller spread
-- across cold starts draws a fresh budget from every one. For most of the API
-- that is an accepted courtesy limit. The AI routes are different — every
-- request behind them spends money at a third party, so their budget has to be
-- one budget, held somewhere every instance can see.
--
-- One row per caller per window. The key carries the limiter's name as a
-- prefix ("ai:203.0.113.7"), so a second limiter could share the table without
-- the two ever counting against each other. Rows are upserted atomically —
-- insert or bump-and-maybe-reset in a single statement — because two instances
-- hitting the same key concurrently must both be counted.
--
-- Expired rows are garbage, not history. The store deletes stale ones
-- opportunistically when it opens a fresh window, so the table stays at
-- roughly one row per active caller.

create table public.rate_limit_windows (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limit_windows enable row level security;

-- Deny-all, stated rather than implied. This table is API infrastructure: the
-- backend reaches it through its own role, which bypasses RLS, and nothing
-- that authenticates with an anon key has any business reading who called the
-- API how often. A policy that grants nothing exists so "no access" is a
-- decision on record, not an omission someone later "fixes".
create policy rate_limit_windows_no_api_access
  on public.rate_limit_windows for all
  using (false);

comment on table public.rate_limit_windows is
  'Fixed-window rate limit counters shared across serverless instances. Written only by the API''s own role.';

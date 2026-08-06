-- Aggregates the coach and the stats endpoint read.
--
-- These are views rather than materialised views because a brew log is small
-- and written more often than it is aggregated; a stale answer would be worse
-- than a recomputed one.
--
-- security_invoker = on matters: without it a view runs with the rights of its
-- owner, which would let a caller read rows through the view that row level
-- security would deny them directly. Requires Postgres 15 or newer, which both
-- Supabase and CI use.

-- Per-method summary. This is what answers "why are my Aeropress brews worse
-- than my pour-overs" with numbers instead of an opinion.
create view public.brew_stats_by_method
with (security_invoker = on)
as
select
  b.user_id,
  m.slug        as method_slug,
  m.label       as method_label,
  count(*)                                  as brew_count,
  round(avg(b.rating)::numeric, 2)          as average_rating,
  round(avg(b.brew_ratio)::numeric, 1)      as average_ratio,
  round(min(b.brew_ratio)::numeric, 1)      as min_ratio,
  round(max(b.brew_ratio)::numeric, 1)      as max_ratio,
  max(b.brewed_at)                          as last_brewed_at
from public.brews b
join public.brew_methods m on m.id = b.method_id
where b.deleted_at is null
group by b.user_id, m.slug, m.label;

-- Whole-log summary, for the header count and the empty-state copy.
create view public.brew_stats
with (security_invoker = on)
as
select
  b.user_id,
  count(*)                             as brew_count,
  round(avg(b.rating)::numeric, 2)     as average_rating,
  round(avg(b.brew_ratio)::numeric, 1) as average_ratio,
  count(distinct b.method_id)          as methods_used,
  min(b.brewed_at)                     as first_brewed_at,
  max(b.brewed_at)                     as last_brewed_at
from public.brews b
where b.deleted_at is null
group by b.user_id;

comment on view public.brew_stats_by_method is
  'Per-method aggregates over live brews. Backs the coach getBrewStats tool.';
comment on view public.brew_stats is
  'Whole-log aggregates over live brews.';

-- The role the application actually runs as.
--
-- Until this migration the API connected as `postgres`: a role that bypasses
-- row level security, creates databases, drops tables, and can hard-delete
-- rows the domain only ever soft-deletes. Every policy in 0007_rls.sql was
-- inert for the one connection that mattered.
--
-- Least privilege is not a claim about how likely a breach is. It is a claim
-- about how far one gets — and the honest answer for an owner credential is
-- "everywhere". This role can do exactly what the request handlers do, which is
-- a short list, and nothing else.
--
-- Two properties are deliberate and worth stating, because they look like
-- omissions:
--
--   * No DELETE on brews. `DELETE /api/brews/:id` sets `deleted_at`; a real
--     delete is not a thing this application does, so it is not a privilege it
--     holds.
--   * No CREATE on the schema and no ownership of anything. Migrations run as
--     the owner through MIGRATION_DATABASE_URL, because a schema change is an
--     operator action rather than something a request should be able to reach.
--
-- The role is created without a password. Setting one is an operator step, so
-- no credential is ever written into this repository:
--
--   alter role app_runtime with password '<generated>';
--
-- Then point DATABASE_URL at it and keep the owner string in
-- MIGRATION_DATABASE_URL. deployment.md carries the full sequence.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    -- LOGIN with no password authenticates nothing until the operator sets one,
    -- which keeps the credential out of version control by construction.
    create role app_runtime login;
  end if;
end;
$$;

grant usage on schema public to app_runtime;

-- The core table: read, log, and edit. Deletion is the soft kind, which is an
-- UPDATE, so DELETE is deliberately absent.
grant select, insert, update on public.brews to app_runtime;

-- Reference vocabularies. Read-only: only a migration changes these.
grant select on public.brew_methods to app_runtime;
grant select on public.flavor_tags to app_runtime;

-- Flavour tags are replaced wholesale per brew when the model re-reads the
-- notes, so this join genuinely needs DELETE.
grant select, insert, delete on public.brew_flavor_tags to app_runtime;

-- The aggregates behind /api/stats and the coach's getBrewStats tool. Both
-- views are security_invoker, so the underlying grants above still apply.
grant select on public.brew_stats to app_runtime;
grant select on public.brew_stats_by_method to app_runtime;

-- The shared rate-limit budget: upserted on every AI request, swept
-- occasionally, so this one needs the full set.
grant select, insert, update, delete on public.rate_limit_windows to app_runtime;

-- The AI persistence tables are forward provision and nothing writes them yet.
-- They are granted when the feature that uses them ships, not before: a
-- privilege handed out early is a privilege nobody remembers to review.
--
-- No `comment on role` here, deliberately. It is the natural place to describe
-- the role, and it requires superuser on a managed instance where CI's
-- container grants it freely — a statement that passes the pipeline and fails
-- the only database that matters. The description lives in this file's header
-- instead, which is where someone would look anyway.

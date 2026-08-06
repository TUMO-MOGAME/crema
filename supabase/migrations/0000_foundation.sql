-- Foundation: extensions and the shared trigger function.
--
-- pgcrypto supplies gen_random_uuid(), the default for every uuid primary key
-- in this schema. citext gives case-insensitive text, used by the flavour tag
-- vocabulary so "Stone Fruit" and "stone fruit" cannot both be inserted.
--
-- The updated_at trigger function lives here rather than beside its first
-- caller because three tables need identical behaviour, and defining it once is
-- the difference between one place to fix and three places to remember.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- search_path is pinned to empty so the function cannot be hijacked by a
-- caller-controlled search_path. It references no schema-qualified object, so
-- there is nothing to resolve.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to now() on UPDATE. Attached by trigger to every table carrying that column.';

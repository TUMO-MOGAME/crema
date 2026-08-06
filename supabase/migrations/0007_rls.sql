-- Row level security on every table.
--
-- Worth being precise about what this does and does not do today. In v1 the
-- browser never talks to Postgres: it calls the Crema API, which connects with
-- a role that bypasses RLS. So these policies are not currently the thing
-- keeping anyone's brews private — the API is.
--
-- They are here because the moment anything connects with an anon key — a
-- Supabase client in the browser, a realtime subscription, an edge function —
-- a table without RLS is world-readable, and the failure is silent. Enabling it
-- now, while there is no data to leak, costs nothing. Enabling it later, after
-- that connection exists, means discovering which queries it breaks in
-- production.

-- Supabase provides auth.uid(). A plain Postgres instance, which is what CI and
-- local development use, does not. Create a stand-in only when it is missing,
-- so the same migration applies unchanged in both places and Supabase's own
-- implementation is never overwritten.
do $shim$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $fn$;
  end if;
end;
$shim$;

-- ---------------------------------------------------------------------------
-- Reference data: readable by anyone, writable by no one through the API.
-- There is no insert, update or delete policy, so those are denied by default.
-- ---------------------------------------------------------------------------

alter table public.brew_methods enable row level security;

create policy brew_methods_select_all
  on public.brew_methods for select
  using (true);

alter table public.flavor_tags enable row level security;

create policy flavor_tags_select_all
  on public.flavor_tags for select
  using (true);

-- ---------------------------------------------------------------------------
-- Owned data: a caller sees their own rows and nothing else.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.brews enable row level security;

create policy brews_select_own
  on public.brews for select
  using (user_id = auth.uid());

create policy brews_insert_own
  on public.brews for insert
  with check (user_id = auth.uid());

-- Both clauses are required. USING decides which rows may be updated; WITH
-- CHECK decides what they may be updated to. Without the second, a caller
-- could reassign their own brew to somebody else's user_id.
create policy brews_update_own
  on public.brews for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy brews_delete_own
  on public.brews for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Data owned indirectly, reached through its parent.
-- ---------------------------------------------------------------------------

alter table public.brew_flavor_tags enable row level security;

create policy brew_flavor_tags_select_own
  on public.brew_flavor_tags for select
  using (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id = auth.uid()
    )
  );

create policy brew_flavor_tags_write_own
  on public.brew_flavor_tags for all
  using (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id = auth.uid()
    )
  );

alter table public.ai_conversations enable row level security;

create policy ai_conversations_all_own
  on public.ai_conversations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.ai_messages enable row level security;

create policy ai_messages_all_own
  on public.ai_messages for all
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

alter table public.ai_suggestions enable row level security;

create policy ai_suggestions_all_own
  on public.ai_suggestions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

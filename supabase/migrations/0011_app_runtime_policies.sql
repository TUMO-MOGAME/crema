-- The half of least privilege that 0010 forgot: row level security.
--
-- 0010 gave the API its own role and asserted six things it cannot do. Every
-- one of those assertions passed, the role went live, and the application went
-- blind — an empty brew log served with HTTP 200, and every AI route answering
-- 500. Nothing failed loudly, because nothing that failed was a privilege.
--
-- The cause is the sentence 0010's own header is proud of: "every policy in
-- 0007_rls.sql was inert for the one connection that mattered". Making them
-- live was correct. What was missed is that they were written for a product
-- with authentication, and this one has none yet:
--
--   * `brews_select_own` reads `using (user_id = auth.uid())`. In v1 every row
--     has `user_id is null` and `auth.uid()` is null, and `null = null` is
--     null, not true. So every row was filtered out of every read.
--   * `rate_limit_windows_no_api_access` reads `using (false)`. It was written
--     when only the owner touched that table, and the owner is exempt. The
--     shared AI budget in Postgres then became unwritable, which is why the
--     three `/api/ai/*` routes failed while `/api/brews` merely emptied.
--
-- The policies below restore v1 without giving the role a blanket exemption.
-- They are scoped `to app_runtime` and predicated on `user_id is null`, which
-- is what an unowned v1 row looks like. That predicate is the point: when
-- authentication ships and rows start carrying a real `user_id`, these policies
-- stop matching them, and the service role cannot read another user's brews
-- through the back door. 0007 stays load-bearing for exactly the rows it was
-- written to protect.
--
-- Permissive policies combine with OR, so these add access for one role rather
-- than weakening the existing rules for anyone else.

-- Brews. Three policies rather than one `for all`, so the absent fourth is
-- visible: there is no delete policy, and no delete grant either. The domain
-- soft-deletes, and both locks say so independently.
create policy brews_app_runtime_select on public.brews
  for select to app_runtime
  using (user_id is null);

create policy brews_app_runtime_insert on public.brews
  for insert to app_runtime
  with check (user_id is null);

create policy brews_app_runtime_update on public.brews
  for update to app_runtime
  using (user_id is null)
  with check (user_id is null);

-- Flavour tags hang off a brew, so their visibility is the brew's visibility.
-- Delete is present here and absent above because re-tagging a brew genuinely
-- removes link rows; the brew itself is never removed.
create policy brew_flavor_tags_app_runtime_select on public.brew_flavor_tags
  for select to app_runtime
  using (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id is null
    )
  );

create policy brew_flavor_tags_app_runtime_insert on public.brew_flavor_tags
  for insert to app_runtime
  with check (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id is null
    )
  );

create policy brew_flavor_tags_app_runtime_delete on public.brew_flavor_tags
  for delete to app_runtime
  using (
    exists (
      select 1 from public.brews b
      where b.id = brew_flavor_tags.brew_id and b.user_id is null
    )
  );

-- The rate limit table holds no user data — a key, a count and a window — and
-- it is the one table the application must write on a path that has no user at
-- all. `using (true)` is the honest policy for it, and the existing
-- `no_api_access` rule still denies everyone else.
create policy rate_limit_windows_app_runtime on public.rate_limit_windows
  for all to app_runtime
  using (true)
  with check (true);

-- `brew_methods` and `flavor_tags` need nothing here: their policies already
-- read `using (true)` for public. `brew_stats` and `brew_stats_by_method` are
-- security_invoker views, so they see whatever the brews policies above allow,
-- which is the behaviour that was wanted and the reason they were not granted
-- separate rules.

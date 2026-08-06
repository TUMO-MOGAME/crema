-- Align the brew CHECK constraints with BREW_LIMITS.
--
-- 0003_brews.sql opens by saying "Every numeric limit below matches BREW_LIMITS
-- in shared/src/brew.ts exactly." Two of them did not:
--
--   coffee_grams > 0     vs  coffeeGramsMin: 0.1
--   water_grams  > 0     vs  waterGramsMin:  1
--
-- The gap is narrow and real. coffee_grams is numeric(6,2), so 0.01 is a value
-- the column can hold and the old constraint would accept — while the API,
-- which is the only writer today, rejects anything under 0.1. That is precisely
-- the class of row these constraints exist to stop: one that arrives from
-- somewhere the API does not control (a migration, a manual fix, the Supabase
-- table editor) and is then unrepresentable to the contract that reads it.
--
-- A new migration rather than an edit to 0003, because an applied migration
-- cannot be changed — the database and the repository would disagree forever.
-- The comment in 0003 has been corrected to point here.
--
-- Existing rows: none can violate the tighter bounds, because every row that
-- exists was written through the API, which has always enforced BREW_LIMITS.
-- The constraints are therefore added as immediately valid rather than as NOT
-- VALID and validated later.

alter table public.brews
  drop constraint brews_coffee_grams_range,
  drop constraint brews_water_grams_range;

alter table public.brews
  add constraint brews_coffee_grams_range
    check (coffee_grams >= 0.1 and coffee_grams <= 500),
  add constraint brews_water_grams_range
    check (water_grams >= 1 and water_grams <= 5000);

comment on constraint brews_coffee_grams_range on public.brews is
  'Matches BREW_LIMITS.coffeeGramsMin/Max in shared/src/brew.ts.';
comment on constraint brews_water_grams_range on public.brews is
  'Matches BREW_LIMITS.waterGramsMin/Max in shared/src/brew.ts.';

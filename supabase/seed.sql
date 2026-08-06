-- Demo data for local development and screenshots.
--
-- Reference data — brew methods and flavour tags — is not here. It lives in the
-- migrations, because brews.method_id points at it and it is therefore part of
-- the schema contract rather than sample content.
--
-- The first three rows are the brews drawn in the assessment wireframes, so a
-- running app can be compared against the design directly. The rest exist so
-- the coach has enough history to say something useful: several V60s at
-- different ratios, which is what makes "what ratio gives me my best V60s" a
-- question with a real answer.
--
-- Safe to run more than once: it clears its own rows first.

begin;

-- Removes only demo rows, and only the ones this file created. Runs before the
-- inserts so repeated seeding does not accumulate duplicates.
delete from public.brews where user_id is null;

insert into public.brews
  (beans, method_id, coffee_grams, water_grams, rating, tasting_notes, brewed_at)
select
  v.beans,
  m.id,
  v.coffee_grams,
  v.water_grams,
  v.rating,
  v.tasting_notes,
  now() - v.days_ago * interval '1 day'
from (values
  -- The three brews from the wireframes.
  ('Zimbabwean highlands', 'aeropress',    15.0, 200.0, 3, 'Heavy body, soft finish, nutty',                 1),
  ('Nigerian dark roast',  'drip',         10.0, 120.0, 5, 'Rich and syrupy, dark chocolate, low acidity',   2),
  ('Italian decaf',        'v60',          20.0, 180.0, 1, 'Flat and papery, over-extracted, quite bitter',  3),

  -- A V60 ratio ladder. The good ones cluster around 1:16.
  ('Ethiopian Yirgacheffe','v60',          18.0, 288.0, 5, 'Blackcurrant, jasmine, tea-like and clean',      4),
  ('Ethiopian Yirgacheffe','v60',          18.0, 234.0, 2, 'Muddy and heavy, lost the florals entirely',     6),
  ('Ethiopian Yirgacheffe','v60',          18.0, 306.0, 4, 'Delicate, a little thin, still very pleasant',   8),
  ('Kenyan AA',            'v60',          17.0, 272.0, 5, 'Grapefruit, blackberry, bright and juicy',      10),

  -- Other methods, for comparison.
  ('Colombian Huila',      'french-press', 30.0, 450.0, 4, 'Caramel and almond, heavy body, gentle finish', 12),
  ('Brazilian Santos',     'espresso',     18.0,  36.0, 4, 'Hazelnut and cocoa, thick crema, low acidity',  13),
  ('Guatemalan Antigua',   'chemex',       22.0, 352.0, 5, 'Milk chocolate, orange peel, exceptionally clean', 15),
  ('Sumatran Mandheling',  'moka-pot',     16.0, 160.0, 2, 'Earthy and a bit harsh, scorched on the stove', 18),
  ('Costa Rican Tarrazu',  'cold-brew',    80.0, 800.0, 4, 'Smooth, sweet, mellow — no bitterness at all',  21)
) as v (beans, method_slug, coffee_grams, water_grams, rating, tasting_notes, days_ago)
join public.brew_methods m on m.slug = v.method_slug;

-- A few flavour tags, applied by a human, so the tagging UI has something to
-- show before the model has ever run.
insert into public.brew_flavor_tags (brew_id, tag_id, source)
select b.id, t.id, 'human'
from public.brews b
join public.flavor_tags t on t.slug = any (
  case
    when b.tasting_notes ilike '%chocolate%' then array['chocolate']
    when b.tasting_notes ilike '%nutty%' or b.tasting_notes ilike '%almond%' then array['nutty']
    when b.tasting_notes ilike '%jasmine%' or b.tasting_notes ilike '%floral%' then array['floral']
    when b.tasting_notes ilike '%blackcurrant%' or b.tasting_notes ilike '%blackberry%' then array['berry']
    when b.tasting_notes ilike '%grapefruit%' or b.tasting_notes ilike '%orange%' then array['citrus']
    when b.tasting_notes ilike '%caramel%' then array['caramel']
    when b.tasting_notes ilike '%bitter%' then array['bitter']
    when b.tasting_notes ilike '%earthy%' then array['earthy']
    when b.tasting_notes ilike '%smooth%' then array['smooth']
    else array[]::text[]
  end
)
where b.user_id is null
on conflict do nothing;

commit;

-- The brew method vocabulary, as a lookup table.
--
-- A foreign key from brews makes an invalid method unrepresentable. A CHECK
-- against a hardcoded list would only approximate that, and would need a
-- migration every time a method is added.
--
-- The rows below are reference data, not demo data: brews.method_id points at
-- them, so they are part of the schema contract and belong in the migration.
-- Demo rows live in supabase/seed.sql instead.
--
-- This list mirrors BREW_METHOD_SLUGS in shared/src/brew-methods.ts. A test
-- asserts the two agree, because a mismatch would let the API accept a method
-- the database will reject.

create table public.brew_methods (
  id smallint primary key generated always as identity,
  slug text not null,
  label text not null,
  display_order smallint not null,

  constraint brew_methods_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint brew_methods_label_not_blank
    check (label ~ '[^[:space:]]')
);

create unique index brew_methods_slug_key on public.brew_methods (slug);

insert into public.brew_methods (slug, label, display_order) values
  ('v60',          'V60',          1),
  ('aeropress',    'Aeropress',    2),
  ('drip',         'Drip coffee',  3),
  ('french-press', 'French press', 4),
  ('chemex',       'Chemex',       5),
  ('espresso',     'Espresso',     6),
  ('moka-pot',     'Moka pot',     7),
  ('cold-brew',    'Cold brew',    8);

comment on table public.brew_methods is
  'Reference vocabulary of brew methods. Mirrors BREW_METHOD_SLUGS in @crema/shared.';

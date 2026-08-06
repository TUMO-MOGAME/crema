-- Flavour vocabulary, and which tags apply to which brew.
--
-- Tasting notes are free text, which is right for writing and useless for
-- querying: "chocolatey" and "lots of chocolate" are the same flavour and no
-- amount of LIKE will tell you so. Normalising notes into a controlled
-- vocabulary is what makes "which descriptors correlate with a 5" answerable.
--
-- The tags are seeded from the SCA flavour wheel's top-level categories, which
-- is a vocabulary specialty roasters already use rather than one invented here.

create type public.flavor_tag_source as enum ('human', 'ai');

create table public.flavor_tags (
  id smallint primary key generated always as identity,

  -- citext so 'Stone Fruit' and 'stone fruit' cannot both be inserted.
  slug citext not null,
  label text not null,

  constraint flavor_tags_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint flavor_tags_label_not_blank
    check (label ~ '[^[:space:]]')
);

create unique index flavor_tags_slug_key on public.flavor_tags (slug);

insert into public.flavor_tags (slug, label) values
  ('fruity',   'Fruity'),
  ('floral',   'Floral'),
  ('citrus',   'Citrus'),
  ('berry',    'Berry'),
  ('chocolate','Chocolate'),
  ('caramel',  'Caramel'),
  ('nutty',    'Nutty'),
  ('spice',    'Spice'),
  ('roasted',  'Roasted'),
  ('earthy',   'Earthy'),
  ('sweet',    'Sweet'),
  ('acidic',   'Acidic'),
  ('bitter',   'Bitter'),
  ('smooth',   'Smooth');

create table public.brew_flavor_tags (
  brew_id uuid not null references public.brews (id) on delete cascade,
  tag_id smallint not null references public.flavor_tags (id) on delete cascade,

  -- Provenance. An AI-derived tag must never be indistinguishable from one a
  -- person chose, because the user needs to know what to trust and what to fix.
  source public.flavor_tag_source not null default 'human',

  -- How sure the model was. Null for human-applied tags, where the question
  -- does not arise.
  confidence numeric(3, 2),

  created_at timestamptz not null default now(),

  primary key (brew_id, tag_id),

  constraint brew_flavor_tags_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1)),

  -- A human either chose the tag or did not; there is no partial certainty.
  constraint brew_flavor_tags_confidence_only_for_ai
    check (source = 'ai' or confidence is null)
);

create index brew_flavor_tags_tag_id_idx
  on public.brew_flavor_tags (tag_id);

comment on table public.flavor_tags is
  'Controlled flavour vocabulary, based on the top-level SCA flavour wheel categories.';
comment on column public.brew_flavor_tags.source is
  'Whether a human or the model attached this tag. Never collapse the two.';

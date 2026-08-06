-- Coach conversations, and the audit trail for anything the model proposes.
--
-- The rule this schema enforces is that the agent proposes and the human
-- commits. The agent has no write path to brews. It writes a row to
-- ai_suggestions, the user accepts or rejects it, and only an accepted
-- suggestion becomes a brew — with brew_id linking back, so the provenance of
-- every AI-originated row stays recoverable months later.
--
-- That is a product decision expressed as a constraint rather than a
-- convention, because conventions are what get forgotten under deadline.

create type public.ai_message_role as enum ('user', 'assistant', 'tool');
create type public.ai_suggestion_status as enum ('pending', 'accepted', 'rejected');

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_conversations_title_not_blank
    check (title is null or title ~ '[^[:space:]]')
);

create index ai_conversations_user_id_idx
  on public.ai_conversations (user_id);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row
  execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role public.ai_message_role not null,
  content text not null,

  -- The tool calls the agent made for this turn. Persisted rather than derived
  -- because the coach shows its working: the trace is part of the answer, not
  -- debug output, so it has to survive a page reload.
  tool_calls jsonb,

  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now(),

  constraint ai_messages_tokens_non_negative
    check (
      (prompt_tokens is null or prompt_tokens >= 0)
      and (completion_tokens is null or completion_tokens >= 0)
    ),

  -- Only the assistant makes tool calls.
  constraint ai_messages_tool_calls_only_from_assistant
    check (tool_calls is null or role = 'assistant')
);

create index ai_messages_conversation_id_created_at_idx
  on public.ai_messages (conversation_id, created_at);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,

  -- set null, not cascade: deleting a conversation must not erase the record
  -- that a suggestion was made and what the user decided about it.
  conversation_id uuid references public.ai_conversations (id) on delete set null,

  -- The proposed brew, shaped by createBrewSchema and re-validated against it
  -- before anything is done with it. Stored as jsonb rather than as columns
  -- because a rejected proposal is a historical artefact, not a live entity.
  payload jsonb not null,

  status public.ai_suggestion_status not null default 'pending',

  -- Set only when accepted: the brew this suggestion became.
  brew_id uuid references public.brews (id) on delete set null,

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  -- A suggestion is pending and unresolved, or decided and resolved. There is
  -- no third state, and the database will not store one.
  constraint ai_suggestions_resolved_consistently
    check (
      (status = 'pending' and resolved_at is null)
      or (status <> 'pending' and resolved_at is not null)
    ),

  -- A brew can only exist for a suggestion the user accepted.
  constraint ai_suggestions_brew_only_when_accepted
    check (brew_id is null or status = 'accepted'),

  constraint ai_suggestions_payload_is_object
    check (jsonb_typeof(payload) = 'object')
);

create index ai_suggestions_user_id_status_idx
  on public.ai_suggestions (user_id, status);

comment on table public.ai_suggestions is
  'Brews the agent proposed and what the human decided. The agent never writes to brews directly.';
comment on column public.ai_messages.tool_calls is
  'Tool calls made for this turn, shown to the user as the agent''s working.';

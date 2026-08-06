import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle definitions for the Crema schema.
 *
 * The SQL in `supabase/migrations/` is the source of truth. This file mirrors
 * its *structure* — tables, columns, types, nullability, defaults and foreign
 * keys — so queries are typed. A drift guard in CI applies the migrations to a
 * real Postgres and compares the result against these declarations, so the two
 * cannot fall out of step silently.
 *
 * Check constraints, indexes, triggers, views and row level security are
 * declared only in the SQL. Restating them here would be two things to keep in
 * agreement rather than one, and they are verified by CI exercising them
 * against a live database instead.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** Case-insensitive text. Postgres has it via the citext extension; Drizzle does not. */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

export const aiMessageRole = pgEnum('ai_message_role', ['user', 'assistant', 'tool']);
export const aiSuggestionStatus = pgEnum('ai_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
]);
export const flavorTagSource = pgEnum('flavor_tag_source', ['human', 'ai']);

/**
 * Mirrors Supabase `auth.users`. Empty in v1 — the app runs as a single
 * implicit user — but every owned row already carries the foreign key, so
 * enabling authentication later tightens one column rather than reshaping
 * every table.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/**
 * The brew method vocabulary, as a lookup table rather than a text column.
 *
 * A foreign key makes an invalid method unrepresentable, and the filter
 * dropdown can be populated from the database instead of a duplicated
 * constant. Mirrors `BREW_METHOD_SLUGS` in `@crema/shared`, which a test
 * asserts.
 */
export const brewMethods = pgTable(
  'brew_methods',
  {
    id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    displayOrder: smallint('display_order').notNull(),
  },
  (table) => [uniqueIndex('brew_methods_slug_key').on(table.slug)],
);

/** The core table. Limits and constraints live in `0003_brews.sql`. */
export const brews = pgTable(
  'brews',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Nullable in v1; becomes NOT NULL when authentication is enabled. */
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),

    beans: text('beans').notNull(),

    /** RESTRICT: removing a method must fail while brews still reference it. */
    methodId: smallint('method_id')
      .notNull()
      .references(() => brewMethods.id, { onDelete: 'restrict' }),

    coffeeGrams: numeric('coffee_grams', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    waterGrams: numeric('water_grams', { precision: 7, scale: 2, mode: 'number' }).notNull(),

    /**
     * Computed by Postgres, never written by the application. A generated
     * column cannot drift from its inputs the way a trigger-maintained or
     * application-maintained one can.
     */
    brewRatio: numeric('brew_ratio', { precision: 10, scale: 4, mode: 'number' }).generatedAlwaysAs(
      sql`water_grams / coffee_grams`,
    ),

    rating: smallint('rating').notNull(),
    tastingNotes: text('tasting_notes').notNull(),

    /** Distinct from `created_at`, so yesterday's brew can be logged honestly. */
    brewedAt: timestamptz('brewed_at').notNull().defaultNow(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),

    /** Soft delete. `DELETE /api/brews/:id` sets this rather than removing a row. */
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    index('brews_user_id_brewed_at_idx').on(table.userId, table.brewedAt),
    index('brews_method_id_idx').on(table.methodId),
  ],
);

/** Controlled flavour vocabulary, so free-text notes become filterable. */
export const flavorTags = pgTable(
  'flavor_tags',
  {
    id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: citext('slug').notNull(),
    label: text('label').notNull(),
  },
  (table) => [uniqueIndex('flavor_tags_slug_key').on(table.slug)],
);

/**
 * Which tags apply to which brew.
 *
 * `source` records whether a human or the model attached the tag. Keeping that
 * provenance means an AI-derived tag is never silently indistinguishable from
 * one a person chose.
 */
export const brewFlavorTags = pgTable(
  'brew_flavor_tags',
  {
    brewId: uuid('brew_id')
      .notNull()
      .references(() => brews.id, { onDelete: 'cascade' }),
    tagId: smallint('tag_id')
      .notNull()
      .references(() => flavorTags.id, { onDelete: 'cascade' }),
    source: flavorTagSource('source').notNull().default('human'),
    confidence: numeric('confidence', { precision: 3, scale: 2, mode: 'number' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.brewId, table.tagId] })],
);

/** One coach thread. */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [index('ai_conversations_user_id_idx').on(table.userId)],
);

/**
 * Turns within a thread, including the tool calls the agent made.
 *
 * `toolCalls` is persisted because the coach shows its working — the trace is
 * part of the answer, not debug output, so it has to survive a page reload.
 */
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: aiMessageRole('role').notNull(),
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('ai_messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
  ],
);

/**
 * Brews the agent proposed, and what the human decided about them.
 *
 * The agent has no write path to `brews`. It writes a suggestion here, the user
 * accepts or rejects it, and only an accepted one becomes a brew — with
 * `brewId` linking back, so the provenance of every AI-originated row stays
 * recoverable. Constraints in `0005_ai.sql` enforce that, rather than leaving
 * it to convention.
 */
export const aiSuggestions = pgTable(
  'ai_suggestions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),

    /** SET NULL: deleting a thread must not erase what the user decided. */
    conversationId: uuid('conversation_id').references(() => aiConversations.id, {
      onDelete: 'set null',
    }),

    /** The proposed brew, shaped by `createBrewSchema` and re-validated before use. */
    payload: jsonb('payload').notNull(),

    status: aiSuggestionStatus('status').notNull().default('pending'),

    /** Set only when accepted — the brew this suggestion became. */
    brewId: uuid('brew_id').references(() => brews.id, { onDelete: 'set null' }),

    createdAt: timestamptz('created_at').notNull().defaultNow(),
    resolvedAt: timestamptz('resolved_at'),
  },
  (table) => [index('ai_suggestions_user_id_status_idx').on(table.userId, table.status)],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type BrewMethodRow = typeof brewMethods.$inferSelect;
export type BrewRow = typeof brews.$inferSelect;
export type NewBrewRow = typeof brews.$inferInsert;
export type FlavorTagRow = typeof flavorTags.$inferSelect;
export type BrewFlavorTagRow = typeof brewFlavorTags.$inferSelect;
export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
export type AiSuggestionRow = typeof aiSuggestions.$inferSelect;

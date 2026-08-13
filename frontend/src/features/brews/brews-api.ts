import {
  brewFlavorTagListSchema,
  brewMethodSchema,
  brewPageSchema,
  brewSchema,
  BREW_PAGE,
  type Brew,
  type BrewFlavorTag,
  type BrewMethod,
  type BrewMethodSlug,
  type BrewPage,
  type CreateBrewInput,
  type UpdateBrewInput,
} from '@crema/shared';
import { z } from 'zod';
import { apiRequest } from '../../lib/api-client';

/**
 * Every call the brew log makes, in one place.
 *
 * Thin on purpose: `apiRequest` already turns the shared error envelope into an
 * `ApiError`, and the types come from `@crema/shared`, so there is nothing left
 * for this layer to do but name the routes and say what it expects back.
 * Nothing here catches — a failed request is the caller's to render, and
 * swallowing it would leave the UI looking empty rather than broken.
 *
 * Every response is parsed rather than cast. The schemas are the same ones the
 * API validates against, so "the contract is shared" stops being a claim about
 * the type system and becomes something checked at runtime on both ends.
 */

/** Mirrors what `GET /api/brew-methods` serves, in the order it serves it. */
const brewMethodListSchema = z.array(z.object({ slug: brewMethodSchema, label: z.string() }));

export interface ListBrewsParams {
  method?: BrewMethodSlug | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

function listQuery({ method, limit, offset }: ListBrewsParams): string {
  const params = new URLSearchParams();

  if (method) params.set('method', method);
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined && offset > 0) params.set('offset', String(offset));

  const query = params.toString();
  return query ? `?${query}` : '';
}

export const brewsApi = {
  list: (params: ListBrewsParams = {}) =>
    apiRequest<BrewPage>(`/api/brews${listQuery(params)}`, { schema: brewPageSchema }),

  create: (input: CreateBrewInput) =>
    apiRequest<Brew>('/api/brews', {
      method: 'POST',
      body: JSON.stringify(input),
      schema: brewSchema,
    }),

  update: (id: string, changes: UpdateBrewInput) =>
    apiRequest<Brew>(`/api/brews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
      schema: brewSchema,
    }),

  remove: (id: string) => apiRequest<void>(`/api/brews/${id}`, { method: 'DELETE' }),

  methods: () => apiRequest<BrewMethod[]>('/api/brew-methods', { schema: brewMethodListSchema }),

  flavorTags: (id: string) =>
    apiRequest<BrewFlavorTag[]>(`/api/brews/${id}/flavor-tags`, {
      schema: brewFlavorTagListSchema,
    }),
};

/** How many brews one request asks for. */
export const PAGE_SIZE = BREW_PAGE.defaultLimit;

/**
 * Query keys as a tree, so a mutation can invalidate a branch rather than
 * listing every key it might have touched. Adding a brew invalidates
 * `brewKeys.all` and every filter refetches, including the ones not on screen —
 * which is what stops the count in the tab title going stale.
 */
export const brewKeys = {
  all: ['brews'] as const,
  lists: () => [...brewKeys.all, 'list'] as const,
  list: (method?: BrewMethodSlug) => [...brewKeys.lists(), method ?? 'all'] as const,
  methods: () => ['brew-methods'] as const,
  flavorTags: (id: string) => [...brewKeys.all, id, 'flavor-tags'] as const,
};

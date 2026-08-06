import type {
  Brew,
  BrewMethod,
  BrewMethodSlug,
  BrewStats,
  CreateBrewInput,
  UpdateBrewInput,
} from '@crema/shared';
import { apiRequest } from '../../lib/api-client';

/**
 * Every call the brew log makes, in one place.
 *
 * Thin on purpose: `apiRequest` already turns the shared error envelope into an
 * `ApiError`, and the types come from `@crema/shared`, so there is nothing left
 * for this layer to do but name the routes. Nothing here catches — a failed
 * request is the caller's to render, and swallowing it would leave the UI
 * looking empty rather than broken.
 */

export const brewsApi = {
  list: (method?: BrewMethodSlug) =>
    apiRequest<Brew[]>(`/api/brews${method ? `?method=${encodeURIComponent(method)}` : ''}`),

  create: (input: CreateBrewInput) =>
    apiRequest<Brew>('/api/brews', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, changes: UpdateBrewInput) =>
    apiRequest<Brew>(`/api/brews/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  remove: (id: string) => apiRequest<void>(`/api/brews/${id}`, { method: 'DELETE' }),

  methods: () => apiRequest<BrewMethod[]>('/api/brew-methods'),

  stats: () => apiRequest<BrewStats>('/api/stats'),
};

/**
 * Query keys as a tree, so a mutation can invalidate a branch rather than
 * listing every key it might have touched. Adding a brew invalidates
 * `brewKeys.lists()` and every filter refetches, including the ones not on
 * screen — which is what stops the count in the tab title going stale.
 */
export const brewKeys = {
  all: ['brews'] as const,
  lists: () => [...brewKeys.all, 'list'] as const,
  list: (method?: BrewMethodSlug) => [...brewKeys.lists(), method ?? 'all'] as const,
  methods: () => ['brew-methods'] as const,
  stats: () => ['brew-stats'] as const,
};

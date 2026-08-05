# Status

**Project:** Crema — Coffee Brew Log **Branch:** `main` **Last updated:**
2026-08-05

Live progress board. Open this file first — it answers "what is done, how far
along is this, what is next, and what is blocked" without reading any code. The
plan behind it is in [PLANNING.md](./PLANNING.md).

Legend: `done` · `in progress` · `next` · `blocked` · `not started`

---

## Snapshot

| Phase | Deliverable                                   | State       | Progress |
| ----- | --------------------------------------------- | ----------- | -------- |
| —     | Planning and research                         | **done**    | 100%     |
| 0     | Foundation — monorepo, tooling, docs skeleton | **done**    | 100%     |
| 1     | Pipeline — CI stages, branch protection       | **next**    | 0%       |
| 2     | Schema — Drizzle + Supabase migrations        | not started | 0%       |
| 3     | API — Hono, services, in-memory repository    | not started | 0%       |
| 4     | UI — design system, CRUD screens              | not started | 0%       |
| 5     | Polish — a11y, motion, states                 | not started | 0%       |
| 6     | AI — Quick Log, Coach agent, guardrails       | not started | 0%       |
| 7     | Ship — Vercel, docs, demo                     | not started | 0%       |

**Overall: 2 of 8 phases complete.** 62 tests passing, `npm run verify` green,
both workspaces building.

---

## Now

Phase 0 is complete and verified. The monorepo runs, builds, tests and lints
clean on a fresh install.

| Check            | Result                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `npm run verify` | green — format, lint, typecheck, test                                                         |
| Tests            | 62 passing (27 shared, 20 backend, 15 frontend)                                               |
| `npm run build`  | backend and frontend both build                                                               |
| API smoke test   | `GET /api/health` → 200; unmatched route → 404 in the shared error envelope with a request id |

Toolchain as resolved: Node 24.11, TypeScript 6, ESLint 10, Vitest 4, Vite 8,
React 19.2, Hono 4.13, Zod 4.4.

## Blocked on

Nothing.

## Next

Phase 1 — the pipeline. `ci.yml` with all nine stages, dependency caching,
`gitleaks` over full history, PR template, CODEOWNERS, then branch protection
applied to `main` and verified by opening a deliberately failing pull request.

---

## Detail by phase

### Planning — done

- [x] Assessment brief read and requirements extracted
- [x] Wireframes reviewed, both screens
- [x] Repository audited: clean history, one classroom commit, no stray files
- [x] Git identity confirmed as `TUMO-MOGAME <tumomogame9@gmail.com>`
- [x] Stack research: framework versions, AI SDK, Gemini tiers, Drizzle with
      Supabase, Vercel monorepo deployment
- [x] Architecture designed — layering, contract sharing, repository pattern
- [x] Database schema designed — eight migrations, constraints, indexes, RLS
- [x] AI feature set designed with guardrails
- [x] Pipeline designed — nine stages
- [x] `PLANNING.md` written
- [x] `STATUS.md` written

### Phase 0 — Foundation — done

- [x] npm workspaces root with `frontend`, `backend`, `shared`
- [x] Strict TypeScript config, shared base extended per workspace —
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
      `verbatimModuleSyntax`
- [x] ESLint flat config + Prettier, one config for the whole repo, type-aware
      linting via `projectService`
- [x] Husky: `pre-commit` lint-staged, `commit-msg` commitlint
- [x] `.gitignore` covering env files, build output, local tool directories
- [x] `.env.example` with every variable documented
- [x] `.nvmrc` and `engines` pinned to Node 24
- [x] `.gitattributes` normalising line endings so Windows and CI agree
- [x] `docs/` skeleton, brief moved to `docs/assessment-brief.md`, wireframes to
      `docs/wireframes/`
- [x] `npm run verify` green on a clean clone

Built beyond the minimum, because the rest of the work leans on it:

- [x] `@crema/shared` — brew schemas, brew-method vocabulary, error envelope,
      field limits, ratio helpers, 27 tests
- [x] Backend shell — app factory separated from listener, Zod-validated env
      loader, `AppError` with code-to-status mapping, error and not-found
      handlers, request id, CORS, security headers, `/api/health`, 20 tests
- [x] Vercel Functions entrypoint at `backend/api/index.ts`
- [x] Frontend shell — providers, query client with error-aware retry, typed API
      client, `useDocumentTitle` for the `Brews: {n}` requirement, 15 tests
- [x] Tailwind v4 base tokens, `prefers-reduced-motion` respected from the start
- [x] README, `Documentation.md`, `deployment.md`

### Phase 1 — Pipeline

- [ ] `ci.yml` — install, lint, typecheck, unit, api, sql, security, build, e2e
- [ ] Dependency caching
- [ ] Coverage thresholds enforced
- [ ] `gitleaks` scanning full history
- [ ] Pull request template and CODEOWNERS
- [ ] Branch protection applied to `main`
- [ ] Verified: a deliberately failing PR is blocked

### Phase 2 — Schema

- [ ] Drizzle schema for every table
- [ ] `0000_extensions` through `0007_rls` written and hand-reviewed
- [ ] `seed.sql` with brew methods and demo brews
- [ ] Constraints, indexes, `updated_at` triggers
- [ ] `brew_ratio` generated column
- [ ] RLS enabled with owner-scoped policies on every table
- [ ] Migrations applied against a scratch Postgres in CI
- [ ] `docs/architecture.md` with an ER diagram

### Phase 3 — API

- [ ] Hono app factory, separated from the Node listener
- [ ] Zod-validated env loader that fails fast
- [ ] Error envelope, request id, structured logging
- [ ] `BrewRepository` interface + contract test suite
- [ ] `InMemoryBrewRepository`
- [ ] `DrizzleBrewRepository` (written, not activated)
- [ ] CRUD routes with the status codes in PLANNING section 4.4
- [ ] `/api/brew-methods`, `/api/stats`, `/api/health`
- [ ] CORS, rate limiting, security headers
- [ ] Integration tests covering every row of the API table

### Phase 4 — UI

- [ ] Design tokens, typography scale, dark and light themes
- [ ] App shell, providers, router
- [ ] Brew list with method filter
- [ ] Brew card matching wireframe 1
- [ ] Add and Edit dialog matching wireframe 2
- [ ] Delete with confirmation
- [ ] Form validation blocking submit on blank fields
- [ ] Page title `Brews: {brewCount}`, updating live
- [ ] Responsive at 320 / 768 / 1280
- [ ] Component tests

### Phase 5 — Polish

- [ ] Optimistic create, update, delete with rollback
- [ ] Loading skeletons, empty state, error state, offline state
- [ ] Toasts with `aria-live`
- [ ] Focus trap and restore on dialogs
- [ ] Full keyboard navigation
- [ ] Restrained motion, honouring `prefers-reduced-motion`
- [ ] Lighthouse accessibility ≥ 95

### Phase 6 — AI

- [ ] Provider abstraction with a deterministic fake for tests
- [ ] Quick Log — structured output parsed by `createBrewSchema`
- [ ] Pre-filled form with inferred-field highlighting
- [ ] Coach agent with `listBrews`, `getBrewStats`, `findSimilarBrews`,
      `proposeBrew`
- [ ] Streaming responses
- [ ] Visible tool-call trace
- [ ] Flavour tag extraction into `brew_flavor_tags`
- [ ] Rate limiting, timeouts, input caps
- [ ] Verified: full app works with `GEMINI_API_KEY` unset
- [ ] Token usage logged and surfaced

### Phase 7 — Ship

- [ ] `crema-web` Vercel project
- [ ] `crema-api` Vercel project
- [ ] Environment variables set in Vercel only
- [ ] Preview deployments on pull requests
- [ ] `README.md`
- [ ] `Documentation.md`
- [ ] `deployment.md` with live URLs
- [ ] Screenshots and a demo recording
- [ ] Every acceptance criterion in PLANNING section 9 checked

---

## Decision log

| Date       | Decision                                           | Reason                                                                                                                     |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Monorepo with npm workspaces                       | Brief requires separate `frontend/` and `backend/` folders; workspaces add a shared contract package with no extra tooling |
| 2026-08-05 | Repository pattern with swappable adapters         | Meets "full schema, no live database yet" without leaving the app half-built                                               |
| 2026-08-05 | Drizzle over Prisma                                | Emits reviewable SQL that doubles as the Supabase migration files                                                          |
| 2026-08-05 | AI is Phase 6, after the brief is fully satisfied  | The graded requirements ship complete regardless of how the AI work lands                                                  |
| 2026-08-05 | Human-in-the-loop for every AI write               | The agent proposes; the user saves. Stated openly as a design position                                                     |
| 2026-08-05 | Backend: Hono                                      | Web-standard, typed, no Vercel adapter needed, tests without binding a port                                                |
| 2026-08-05 | Frontend: Vite + React 19                          | A standalone SPA over real HTTP proves the API is genuine; Next.js would blur the split the brief asks for                 |
| 2026-08-05 | All three AI features in v1                        | Phase ordering contains the risk; the differentiation is the point                                                         |
| 2026-08-05 | No custom domain                                   | `*.vercel.app` satisfies the brief; a domain can be attached later at zero code cost                                       |
| 2026-08-05 | `shared/` ships TypeScript source, no build step   | Both consumers are bundlers (Vite, tsup, Vercel). A build step would add a stale-artifact failure mode for no gain         |
| 2026-08-05 | tsup for the backend build                         | Bundles the workspace package into one file; plain `tsc` cannot emit across a package boundary that exports source         |
| 2026-08-05 | Coverage thresholds configured but not in `verify` | `verify` must stay fast enough to run constantly. CI runs the coverage job separately from Phase 3                         |

---

## Update log

| Date       | Change                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Repository audited. Planning and research completed. `PLANNING.md` and `STATUS.md` created.                                                                                   |
| 2026-08-05 | All four open decisions settled. Phase 0 unblocked, awaiting go-ahead to scaffold.                                                                                            |
| 2026-08-05 | Phase 0 built and verified: workspaces, contract package, API shell, frontend shell, tooling, docs. 62 tests green, both workspaces building, API smoke-tested over the wire. |

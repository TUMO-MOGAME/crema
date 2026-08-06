# Status

**Project:** Crema — Coffee Brew Log **Branch:** `main` **Last updated:**
2026-08-06

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
| 1     | Pipeline — CI stages, branch protection       | **done**    | 100%     |
| 2     | Schema — Drizzle + Supabase migrations        | **done**    | 100%     |
| 3     | API — Hono, services, in-memory repository    | **next**    | 0%       |
| 4     | UI — design system, CRUD screens              | not started | 0%       |
| 5     | Polish — a11y, motion, states                 | not started | 0%       |
| 6     | AI — Quick Log, Coach agent, guardrails       | not started | 0%       |
| 7     | Ship — Vercel, docs, demo                     | not started | 0%       |

**Overall: 4 of 8 phases complete.** 96 unit tests, 39 database tests and 7
end-to-end journeys passing, all nine CI stages green, `main` protected.

---

## Now

Phases 0, 1 and 2 are complete and verified. The monorepo runs, builds, tests
and lints clean on a fresh install; every change to the portfolio repository has
to pass nine CI stages behind a protected branch; and the full Postgres schema
exists as ordered migrations that CI applies to a real database on every push.

The application still runs entirely on the in-memory adapter. No connection
string, no Supabase project, nothing to provision — exactly as intended. The
schema is ready and waiting rather than wired in.

The repository lives in two places. `main` cannot be protected on the classroom
repository — it belongs to the `Umuzi-classroom` organisation and this account
has push access but not admin — so the enforced workflow lives on the public
mirror at <https://github.com/TUMO-MOGAME/crema> and both remotes are kept at
the same commit.

| Check                      | Result                                                      |
| -------------------------- | ----------------------------------------------------------- |
| `npm run verify`           | green — format, lint, typecheck, test                       |
| Unit and integration tests | 96 passing (27 shared, 41 backend, 28 web)                  |
| Database tests             | 39 passing against a real Postgres 17                       |
| End-to-end journeys        | 7 passing against production builds                         |
| Coverage                   | backend 100% lines / 81% branches, web 94% / 93%            |
| Bundle                     | 86 kB js and 3 kB css gzipped, against a 250 / 40 kB budget |
| CI                         | all nine stages green                                       |
| Branch protection          | direct push to `main` rejected, failing PR blocked          |

Toolchain as resolved: Node 24.11, TypeScript 6, ESLint 10, Vitest 4, Vite 8,
React 19.2, Hono 4.13, Zod 4.4, Playwright 1.62.

## Blocked on

Nothing.

## Next

Phase 3 — the API. `BrewRepository` as an interface with a contract test suite
both adapters must pass, the in-memory adapter that runs v1, the Drizzle adapter
written against the schema but left dormant, and full CRUD at `/api/brews` with
the status codes in PLANNING section 4.4 — every row of that table tested.

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

- [x] `ci.yml` — nine stages: lint, typecheck, unit, api, migrations, security,
      build, e2e, and an aggregate `CI` gate
- [x] Dependency install as a composite action, npm cache restored per job
- [x] Coverage thresholds enforced — backend 100% lines, web 94%
- [x] `gitleaks` scanning full history via the pinned binary, not the
      marketplace action, which requires a paid licence on org-owned repos
- [x] `npm audit --audit-level=high`
- [x] Migration linter — filename format, sequence gaps, unterminated
      statements, uncommented destructive statements
- [x] Bundle size budget on gzip output
- [x] Playwright e2e against production builds of both sides
- [x] Pull request template and CODEOWNERS
- [x] Branch protection applied to `main` on the portfolio repo — PR required,
      `CI` required and strict, linear history, conversation resolution, no
      force pushes, no deletions, administrators included
- [x] Merge policy: merge commits off, rebase and squash on, branches deleted on
      merge — so granular commits survive a merge instead of being flattened
- [x] Verified: a direct push to protected `main` is rejected
- [x] Verified: a deliberately failing pull request is blocked from merging

The aggregate `CI` job is the single required status check, so adding or
renaming a stage never means editing the protection rule.

### Phase 2 — Schema — done

- [x] Drizzle schema for every table, mirroring the SQL structure
- [x] `0000_foundation` through `0007_rls` written and hand-reviewed
- [x] `seed.sql` — the three wireframe brews plus a V60 ratio ladder, so the
      coach has history worth reasoning about
- [x] Constraints, indexes, partial index over live rows, `updated_at` triggers
- [x] `brew_ratio` generated column, which Postgres refuses to let anything
      write
- [x] RLS enabled with owner-scoped policies on every table
- [x] `auth.uid()` compatibility shim, so the same migrations apply unchanged to
      Supabase and to plain Postgres
- [x] `brew_stats` and `brew_stats_by_method` views, both `security_invoker`
- [x] Migration runner (`scripts/apply-migrations.mjs`) for CI and local use
- [x] Migrations applied against a real Postgres 17 in CI, then seeded
- [x] Drift guard — Drizzle declarations compared against `information_schema`
- [x] 39 database tests: every constraint proven to reject what it claims to
- [x] Vocabulary sync test — the migration and `BREW_METHOD_SLUGS` cannot
      disagree
- [x] `docs/architecture.md` with system, ER and request-lifecycle diagrams

Found while building it: `length(btrim(x)) > 0` was the wrong way to express
"not blank". `btrim` strips spaces only, so a single tab passed the constraint
while failing the Zod `.trim().min(1)` on the same field — the database and the
contract disagreed about what blank means. Now written as `x ~ '[^[:space:]]'`
on every text column that must not be empty. The test suite found it; reading
the SQL had not.

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

| Date       | Decision                                              | Reason                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-05 | Monorepo with npm workspaces                          | Brief requires separate `frontend/` and `backend/` folders; workspaces add a shared contract package with no extra tooling                                                                                         |
| 2026-08-05 | Repository pattern with swappable adapters            | Meets "full schema, no live database yet" without leaving the app half-built                                                                                                                                       |
| 2026-08-05 | Drizzle over Prisma                                   | Emits reviewable SQL that doubles as the Supabase migration files                                                                                                                                                  |
| 2026-08-05 | AI is Phase 6, after the brief is fully satisfied     | The graded requirements ship complete regardless of how the AI work lands                                                                                                                                          |
| 2026-08-05 | Human-in-the-loop for every AI write                  | The agent proposes; the user saves. Stated openly as a design position                                                                                                                                             |
| 2026-08-05 | Backend: Hono                                         | Web-standard, typed, no Vercel adapter needed, tests without binding a port                                                                                                                                        |
| 2026-08-05 | Frontend: Vite + React 19                             | A standalone SPA over real HTTP proves the API is genuine; Next.js would blur the split the brief asks for                                                                                                         |
| 2026-08-05 | All three AI features in v1                           | Phase ordering contains the risk; the differentiation is the point                                                                                                                                                 |
| 2026-08-05 | No custom domain                                      | `*.vercel.app` satisfies the brief; a domain can be attached later at zero code cost                                                                                                                               |
| 2026-08-05 | `shared/` ships TypeScript source, no build step      | Both consumers are bundlers (Vite, tsup, Vercel). A build step would add a stale-artifact failure mode for no gain                                                                                                 |
| 2026-08-05 | tsup for the backend build                            | Bundles the workspace package into one file; plain `tsc` cannot emit across a package boundary that exports source                                                                                                 |
| 2026-08-05 | Public mirror at `TUMO-MOGAME/crema`                  | The classroom repo is org-owned and private, so `main` cannot be protected there and nobody outside the bootcamp can see the work                                                                                  |
| 2026-08-05 | One aggregate `CI` check, not eight required contexts | Branch protection points at a single name, so adding or renaming a stage never means editing the rule                                                                                                              |
| 2026-08-05 | `gitleaks` binary instead of the marketplace action   | The action requires a paid licence for organisation-owned repositories                                                                                                                                             |
| 2026-08-05 | Rebase merge preferred over squash                    | Keeps the granular commits, which are part of what a reader of a portfolio repo is judging                                                                                                                         |
| 2026-08-05 | Zero required approvals, but a PR still required      | A solo repository cannot self-approve; requiring one review would block every merge permanently                                                                                                                    |
| 2026-08-05 | Coverage thresholds configured but not in `verify`    | `verify` must stay fast enough to run constantly. CI runs the coverage job separately from Phase 3                                                                                                                 |
| 2026-08-06 | SQL hand-authored; Drizzle mirrors its structure      | `drizzle-kit` emits none of what matters here — RLS, triggers, `security_invoker` views, comments, partial indexes — and pulls deprecated packages carrying four moderate advisories. A CI drift guard replaces it |
| 2026-08-06 | Reference data in migrations, demo data in `seed.sql` | `brews.method_id` points at the methods, so they are schema contract rather than sample content                                                                                                                    |
| 2026-08-06 | Soft delete on `brews`                                | Recoverable, and the AI suggestion audit trail keeps its foreign key target                                                                                                                                        |
| 2026-08-06 | `brew_ratio` as a generated column                    | A denormalisation that earns it: every list row and every coach question compares ratios, and Postgres will not let it drift from its inputs                                                                       |
| 2026-08-06 | RLS enabled before it is load-bearing                 | Today the API bypasses it. The day anything connects with an anon key, a table without RLS is world-readable and the failure is silent                                                                             |
| 2026-08-06 | Database folded into the migration CI stage           | Keeps the count at nine while making one job own the database concern end to end                                                                                                                                   |

---

## Update log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Repository audited. Planning and research completed. `PLANNING.md` and `STATUS.md` created.                                                                                                                                                                                                                                                                       |
| 2026-08-05 | All four open decisions settled. Phase 0 unblocked, awaiting go-ahead to scaffold.                                                                                                                                                                                                                                                                                |
| 2026-08-05 | Phase 0 built and verified: workspaces, contract package, API shell, frontend shell, tooling, docs. 62 tests green, both workspaces building, API smoke-tested over the wire.                                                                                                                                                                                     |
| 2026-08-05 | Phase 0 pushed. Public mirror created at `TUMO-MOGAME/crema`.                                                                                                                                                                                                                                                                                                     |
| 2026-08-06 | Phase 2 built. Eight migrations, seed, Drizzle mirror, migration runner, 39 database tests and a drift guard, all verified against a real Postgres 17. CI gained a Database stage. A whitespace-handling mismatch between the SQL constraints and the Zod contract was found and fixed.                                                                           |
| 2026-08-06 | Phase 1 built. Coverage raised to threshold with real tests for the error paths, 91 unit tests and 7 end-to-end journeys. First CI run failed on a corrupted lockfile missing `yaml` — repaired, and the catch is the argument for `npm ci`. All nine stages green. `main` protected and the gate verified against both a direct push and a failing pull request. |

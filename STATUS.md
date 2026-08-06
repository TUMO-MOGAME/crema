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
| 3     | API — Hono, services, in-memory repository    | in progress | 70%      |
| 4     | UI — design system, CRUD screens              | not started | 0%       |
| 5     | Polish — a11y, motion, states                 | not started | 0%       |
| 6     | AI — Quick Log, Coach agent, guardrails       | not started | 0%       |
| 7     | Ship — Vercel, docs, demo                     | not started | 0%       |

**Overall: 4 of 8 phases complete.** 228 unit tests, 79 database tests and 7
end-to-end journeys passing, all nine CI stages green, `main` protected.

---

## Now

Phases 0, 1 and 2 are complete and verified. The monorepo runs, builds, tests
and lints clean on a fresh install; every change to the portfolio repository has
to pass nine CI stages behind a protected branch; and the full Postgres schema
exists as ordered migrations that CI applies to a real database on every push.

Phase 3 is most of the way there. The persistence layer and the brew CRUD
surface are built: `BrewRepository` as an interface, a contract suite of 27
tests that both adapters pass, the in-memory adapter that runs v1 seeded from
the same demo data as `seed.sql`, and the Drizzle adapter written against the
real schema and proven against a real Postgres — while `DATA_SOURCE` still says
`memory` and nothing connects to anything. What is left is the endpoints around
the edges: `/api/brew-methods`, `/api/stats`, and rate limiting.

The application still runs entirely on the in-memory adapter. No connection
string, no Supabase project, nothing to provision — exactly as intended. The
schema is ready and waiting rather than wired in, and now so is the code that
would talk to it.

The repository lives in two places. `main` cannot be protected on the classroom
repository — it belongs to the `Umuzi-classroom` organisation and this account
has push access but not admin — so the enforced workflow lives on the public
mirror at <https://github.com/TUMO-MOGAME/crema> and both remotes are kept at
the same commit.

| Check                      | Result                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `npm run verify`           | green — format, lint, typecheck, test                          |
| Unit and integration tests | 228 passing (46 shared, 154 backend, 28 web)                   |
| Database tests             | 79 passing against a real Postgres 17                          |
| End-to-end journeys        | 7 passing against production builds                            |
| Coverage                   | shared 100%, backend 99.7% lines / 88% branches, web 94% / 93% |
| Bundle                     | 86 kB js and 3 kB css gzipped, against a 250 / 40 kB budget    |
| CI                         | all nine stages green                                          |
| Branch protection          | direct push to `main` rejected, failing PR blocked             |

Toolchain as resolved: Node 24.11, TypeScript 6, ESLint 10, Vitest 4, Vite 8,
React 19.2, Hono 4.13, Zod 4.4, Playwright 1.62.

## Blocked on

Nothing.

## Next

The rest of Phase 3 — `/api/brew-methods` so the filter dropdown reads its
vocabulary from the API rather than a duplicated constant, `/api/stats` over the
`brew_stats` view, and rate limiting on the routes that will eventually cost
money to serve. Then Phase 4, the UI, against a contract that is now frozen.

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

- [x] Hono app factory, separated from the Node listener
- [x] Zod-validated env loader that fails fast
- [x] Error envelope, request id, structured logging
- [x] `BrewRepository` interface + contract test suite
- [x] `InMemoryBrewRepository`
- [x] `DrizzleBrewRepository` (written, not activated)
- [x] CRUD routes with the status codes in PLANNING section 4.4
- [x] `/api/health`
- [ ] `/api/brew-methods`, `/api/stats`
- [x] CORS, security headers
- [ ] Rate limiting
- [x] Integration tests covering every row of the brew table

The repository layer is the part worth reading. `BrewRepository` is an interface
with two implementations and one test suite: 27 contract tests that both
adapters must pass, run against the in-memory store on every commit and against
a real Postgres 17 in the Database stage. It is what makes "switch `DATA_SOURCE`
to `postgres`" a claim with evidence rather than an intention.

Three real differences surfaced only because both adapters were held to the same
tests, and all three would have been silent until the day the environment
variable flipped:

- **Grams.** `numeric(6,2)` rounds to two decimals; a `Map` keeps whatever it is
  given. The in-memory adapter now rounds deliberately.
- **Timestamps.** `timestamptz` stores an instant and discards the offset it
  arrived in. The in-memory adapter normalises to UTC on write to match, which
  also makes its ISO strings sort chronologically as plain strings.
- **Aliasing.** Handing back the stored object rather than a copy is invisible
  in tests until something mutates a response — and impossible in Postgres,
  which is exactly why the guarantee had to be written down.

`PATCH` gained a `422` the API table did not have. The semantic rules were
enforced on create and not on update, which left a rule you could walk around
one `PATCH` at a time. PLANNING section 4.4 was corrected rather than the
behaviour.

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
| 2026-08-06 | npm pinned to >= 11.16 with `engine-strict=true`      | 11.6 and 11.16 disagree about whether `yaml` belongs in the lockfile. The older one writes a lockfile that breaks CI, and the break lands on the runner rather than the machine that caused it                     |
| 2026-08-06 | `verify` runs `test:coverage` rather than `test`      | Thresholds were only enforced in CI, so a coverage regression could not be caught before pushing                                                                                                                   |
| 2026-08-06 | Drizzle schema excluded from unit coverage            | Declarations with no branching. The Database stage compares them against a live Postgres, which is a stronger check than importing the file for a line count                                                       |
| 2026-08-06 | One contract suite, both adapters, no mocks           | A mock repository asserts that the service called the methods it currently calls. The in-memory adapter is already proven by the contract suite, so it tests behaviour instead                                     |
| 2026-08-06 | `SEMANTIC_INVALID` (422) split from validation (400)  | A field that is wrong on its own can be highlighted; a combination that is impossible cannot. The client does different things with them, so they are different codes                                              |
| 2026-08-06 | Malformed `:id` answers 404, not 400                  | `/api/brews/banana` names no brew, the same as a well-formed id that was never used. It also declines to tell an unauthenticated caller what a valid id looks like                                                 |
| 2026-08-06 | Drizzle adapter excluded from unit coverage           | Same reasoning as the schema: it is covered by the contract suite against a real database. Counting it here would measure how much of it the _other_ adapter's tests happen to touch                               |

---

## Update log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Repository audited. Planning and research completed. `PLANNING.md` and `STATUS.md` created.                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-05 | All four open decisions settled. Phase 0 unblocked, awaiting go-ahead to scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-05 | Phase 0 built and verified: workspaces, contract package, API shell, frontend shell, tooling, docs. 62 tests green, both workspaces building, API smoke-tested over the wire.                                                                                                                                                                                                                                                                                                                            |
| 2026-08-05 | Phase 0 pushed. Public mirror created at `TUMO-MOGAME/crema`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-06 | Phase 2 built. Eight migrations, seed, Drizzle mirror, migration runner, 39 database tests and a drift guard, all verified against a real Postgres 17. CI gained a Database stage. A whitespace-handling mismatch between the SQL constraints and the Zod contract was found and fixed.                                                                                                                                                                                                                  |
| 2026-08-06 | Phase 1 built. Coverage raised to threshold with real tests for the error paths, 91 unit tests and 7 end-to-end journeys. First CI run failed on a corrupted lockfile missing `yaml` — repaired, and the catch is the argument for `npm ci`. All nine stages green. `main` protected and the gate verified against both a direct push and a failing pull request.                                                                                                                                        |
| 2026-08-06 | Phase 3 repository layer and brew CRUD built. `BrewRepository` with a 27-test contract suite both adapters pass, in-memory adapter seeded from the same data as `seed.sql` and guarded against drifting from it, Drizzle adapter written and proven against a real Postgres while staying dormant. 228 unit tests and 79 database tests. The contract suite found three silent differences between the adapters — gram rounding, timestamp offsets, and handing out the stored object instead of a copy. |

# Status

**Project:** Crema — Coffee Brew Log **Branch:** `main` **Last updated:**
2026-08-07

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
| 3     | API — Hono, services, in-memory repository    | **done**    | 100%     |
| 4     | UI — design system, CRUD screens              | **done**    | 100%     |
| 5     | Polish — a11y, motion, states                 | not started | 0%       |
| 6     | AI — Quick Log, Coach agent, guardrails       | not started | 0%       |
| 7     | Ship — Vercel, docs, demo                     | not started | 0%       |

**Overall: 6 of 8 phases complete.** 374 unit tests, 99 database tests and 9
end-to-end journeys passing, `main` protected and green. Phase 4 is merged, and
so is a full audit remediation on top of it — nothing is blocked.

---

## Now

Phases 0, 1 and 2 are complete and verified. The monorepo runs, builds, tests
and lints clean on a fresh install; every change to the portfolio repository has
to pass nine CI stages behind a protected branch; and the full Postgres schema
exists as ordered migrations that CI applies to a real database on every push.

Phase 4 is complete and merged, so the app is now the thing the brief asks for:
a brew log you can read, filter, add to, edit and delete, in light or dark, from
320px up. It talks to the API over real HTTP, and the form is driven by the same
Zod schema the API validates with — so the rule that a blank field cannot be
submitted is written once and enforced on both sides.

A full audit of the codebase followed, and its findings are fixed. The list is
in the update log below; four are worth naming here because they were not
cosmetic. The env loader now refuses to boot a production process on the
in-memory adapter — the deploy target is serverless, so every write would have
been lost at the next cold start with nothing reporting it. `GET /api/brews`
returns a page rather than every row, and carries the total, so the client no
longer fetches the whole log a second time purely to count it. The dialog
returns focus to the control that opened it, which it never did. And six
contrast pairings that were measured for the first time turned out to fail,
including the rating dial at 2.65:1 in the light theme.

Two of those fixes had bugs of their own, and both were caught by the suites
rather than by review: the repository contract suite found the new Postgres
paging disagreeing with the in-memory adapter about the total on an empty page,
and the schema drift guard rejected the new migration ledger for living in
`public` without row level security.

Building it turned up a hole in the pipeline itself. The aggregate `CI` check —
the single context branch protection requires — reported all nine stages green
while `Lint and format` was red beside it. It guarded on
`contains(needs.*.result, 'failure')`, and the value it was actually handed was
`abandoned`, which is what a job reports when it dies at the infrastructure
level and appears nowhere in the documented set of results. For the length of
that run the protected branch was not protected. The gate now runs
unconditionally, prints every stage result before deciding, and demands
`success` from each — enumerating the ways a stage can fail was the mistake, not
the particular value that was missed.

Phase 3 is complete. The API serves every route the plan specifies for v1: brew
CRUD with each status code in section 4.4, the method vocabulary, and aggregates
over the log. Underneath it, `BrewRepository` is an interface with two adapters
and one contract suite of 39 tests that both must pass — the in-memory one that
runs v1, seeded from the same demo data as `seed.sql`, and the Drizzle one
written against the real schema and proven against a real Postgres while staying
switched off.

The application still runs entirely on the in-memory adapter. No connection
string, no Supabase project, nothing to provision — exactly as intended. The
schema is ready and waiting rather than wired in, and now so is the code that
would talk to it: flipping `DATA_SOURCE` to `postgres` changes no application
code, and the contract suite is the evidence rather than the intention.

The repository lives in two places. `main` cannot be protected on the classroom
repository — it belongs to the `Umuzi-classroom` organisation and this account
has push access but not admin — so the enforced workflow lives on the public
mirror at <https://github.com/TUMO-MOGAME/crema> and both remotes are kept at
the same commit.

| Check                      | Result                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `npm run verify`           | green — format, lint, typecheck, test                          |
| Unit and integration tests | 299 passing (57 shared, 187 backend, 55 web)                   |
| Database tests             | 91 passing against a real Postgres 17                          |
| End-to-end journeys        | 9 passing against production builds                            |
| Coverage                   | shared 100%, backend 99.3% lines / 86% branches, web 94% / 87% |
| Bundle                     | 116 kB js and 5 kB css gzipped, against a 250 / 40 kB budget   |
| CI on `main`               | all nine stages green                                          |
| CI on the Phase 4 branch   | blocked — see below. Every stage that got a runner passed      |
| Branch protection          | direct push to `main` rejected, failing PR blocked             |

Toolchain as resolved: Node 24.11, TypeScript 6, ESLint 10, Vitest 4, Vite 8,
React 19.2, Hono 4.13, Zod 4.4, Playwright 1.62.

## Blocked on

**Nothing.** The GitHub Actions outage that held Phase 4 open is resolved and
the pipeline is scheduling jobs again. Both pull requests are merged, both
remotes are at the same commit, and every stage has now run green in CI rather
than only on one machine — including `Lint and format`, which the outage had
prevented from executing even once.

One item is deliberately carried rather than fixed, and it is recorded here so
it is not mistaken for an oversight. `npm audit` reports one low advisory,
GHSA-g7r4-m6w7-qqqr, in a transitive `esbuild` — a development-server issue on
Windows only. It arrives through `tsup`, which pins a range that cannot resolve
the patched version, so clearing it means regenerating the lockfile; doing that
on Windows drops 62 optional platform binaries that only install on Linux and
macOS, and `npm ci` on the runner then fails to find them. That is the same
lockfile damage `.npmrc` exists to prevent, so the advisory stays visible and
documented in `package.json` instead of being traded for a broken pipeline. It
clears when `tsup` widens its range, or when the lockfile is regenerated on
Linux. CI gates at `--audit-level=high`, so this does not mask anything.

## Next

Phase 5 — polish. Optimistic create, update and delete with rollback, motion on
the states that currently snap, and the loading and error surfaces that so far
exist only for the list.

The accessibility half of the phase is partly done, because the audit reached it
first: focus returns to the control that opened a dialog, the live region
announces a summary instead of reciting every row, the duplicated error
announcement is gone, and every contrast pairing the UI renders is now asserted
by a test that reads the tokens. What remains is the pass the phase was always
going to need against the real thing — keyboard traversal end to end, and
Lighthouse ≥ 95 measured rather than assumed.

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
- [x] Gate hardened after it was caught passing with a red stage (2026-08-06)

The aggregate `CI` job is the single required status check, so adding or
renaming a stage never means editing the protection rule.

That single point is also a single point of failure, and it failed once. The
gate guarded on `contains(needs.*.result, 'failure')` and reported all nine
stages green while `Lint and format` was red, because the result it was handed
was `abandoned` — undocumented, and what a job reports when it dies at the
infrastructure level rather than at a step. A required check that can be green
over a red stage is worth less than no required check, because it is trusted.

It now runs unconditionally, prints `Stage results: …` before deciding, and
fails unless every stage reports `success`. The fix is not that `abandoned` was
added to a list; it is that the gate stopped enumerating failure and started
requiring success, so the next unlisted result is caught too.

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

### Phase 3 — API — done

- [x] Hono app factory, separated from the Node listener
- [x] Zod-validated env loader that fails fast
- [x] Error envelope, request id, structured logging
- [x] `BrewRepository` interface + contract test suite
- [x] `InMemoryBrewRepository`
- [x] `DrizzleBrewRepository` (written, not activated)
- [x] CRUD routes with the status codes in PLANNING section 4.4
- [x] `/api/brew-methods`, `/api/stats`, `/api/health`
- [x] CORS, rate limiting, security headers
- [x] Integration tests covering every row of the API table

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

`/api/stats` reads the `brew_stats` and `brew_stats_by_method` views rather than
loading every brew and adding it up, which meant the in-memory adapter had to
reproduce their arithmetic exactly — ratios averaged from the stored generated
column, ratings rounded to two decimals, ratios to one. Twelve more contract
tests hold the two together. An empty log is `200` with real zeroes rather than
`404`, so the client has one shape to render instead of two.

`/api/brew-methods` serves the vocabulary from `@crema/shared` rather than
querying `brew_methods`. The table is the same list, asserted by a test that
reads the migration, so a query would be a round trip to learn something the
process cannot get wrong. What the endpoint buys is the frontend no longer
keeping its own copy.

Rate limiting is a fixed window held in the instance's memory, and the comment
on it says plainly that this makes it a courtesy limit rather than a guarantee —
each serverless instance counts only what it serves. It stops a runaway client
loop, which is what it is for. Phase 6 reuses it for the coach routes, where a
request costs a model call instead of a map lookup.

### Phase 4 — UI — done

- [x] Design tokens, typography scale, dark and light themes
- [x] App shell, providers, router
- [x] Brew list with method filter
- [x] Brew card matching wireframe 1
- [x] Add and Edit dialog matching wireframe 2
- [x] Delete with confirmation
- [x] Form validation blocking submit on blank fields
- [x] Page title `Brews: {brewCount}`, updating live
- [x] Responsive at 320 / 768 / 1280
- [x] Component tests

The tokens are three layers and components only touch the third: a raw palette,
semantic variables that flip for light and dark, and utilities built on those.
`bg-surface` means "the page" in both themes, so a component written once is
correct in both — a component reaching for `bg-bean-950` would be right in the
dark and invisible in the light, which is the drift that turns a theme toggle
into a two-week project later. The toggle has three states, not two, because
collapsing "match system" overrides a reader who has already told their
operating system what they want.

**The rating badge is the one deliberate departure from the wireframes.** The
wireframe draws a traffic light — 1 red, 3 orange, 5 green. The shape, size and
position are kept exactly; the colours are not. Two reasons. A brew is not
passing or failing the way a build is, and the scale that means something here
is the drink: a 1 is pale, thin and ashy, a 5 is full crema. And red against
green is the one pairing a colour-blind reader cannot separate, which matters
when the colour is doing the scanning work down a list. The value is now said
three times — the number, the warmth of the fill, and an arc filled to
`rating / 5` — so any one of them read alone gives the right answer.

Tasting notes were in the list rows for about an hour. They made every row two
lines taller for prose nobody reads while scanning, and the wireframe does not
draw them. The list answers "which brew"; the dialog answers "why".

Two bugs the tests caught rather than the browser: both dialogs used a fixed
`id="dialog-title"`, so when the delete confirmation opened on top of the edit
form the accessible name pointed at whichever the browser found first — the
wrong title, announced for the wrong dialog. And a rejected save escaped as an
unhandled promise, which would have closed the form over work the server had
refused.

No webfont. The `Inter var` the tokens named was never actually loaded, so every
screen had been rendering in the system face all along — naming a font you do
not ship is a lie the CSS tells. The stack is listed honestly and the
personality comes from how type is set rather than which file downloads. Adding
a display face is one `@font-face` and one line of `--font-display`, and it
needs npm ≥ 11.16 on the machine that runs the install.

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
| 2026-08-06 | `stats()` on the repository, not in a service         | Postgres has the views. Reading every brew into memory to add them up would be treating the database as a filing cabinet                                                                                           |
| 2026-08-06 | `/api/brew-methods` served from the shared constant   | The table is the same list and a test asserts it. The endpoint exists so the frontend stops carrying its own copy, not so the vocabulary can be queried                                                            |
| 2026-08-06 | Rate limiting in instance memory, not shared state    | Honest about being a courtesy limit. A global guarantee needs Upstash or Postgres, and that is a dependency to add when there is a reason to, not now                                                              |
| 2026-08-06 | Rating shown as extraction, not a traffic light       | A brew is not passing or failing, and red against green is the one pairing a colour-blind reader cannot separate. Number, warmth and arc each carry the value alone                                                |
| 2026-08-06 | Semantic theme tokens between palette and utilities   | `bg-surface` means "the page" in both themes. A component reaching for `bg-bean-950` would be right in the dark and invisible in the light                                                                         |
| 2026-08-06 | Native `<dialog>` over a modal library                | Focus trapping, Escape, the top layer and background `inert` for one method call. jsdom lacks `showModal`, so the test environment is shimmed rather than the component rewritten to suit it                       |
| 2026-08-06 | No webfont shipped                                    | The token named `Inter var` and never loaded it. The stack is now honest, and adding a display face needs npm >= 11.16 on the installing machine                                                                   |
| 2026-08-06 | CI gate requires success rather than listing failures | It reported nine green with a red stage: the result was `abandoned`, which is undocumented and what a job reports when it dies at the infrastructure level. Enumerating failure modes keeps meeting new ones       |

---

## Update log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Repository audited. Planning and research completed. `PLANNING.md` and `STATUS.md` created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-05 | All four open decisions settled. Phase 0 unblocked, awaiting go-ahead to scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-05 | Phase 0 built and verified: workspaces, contract package, API shell, frontend shell, tooling, docs. 62 tests green, both workspaces building, API smoke-tested over the wire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-05 | Phase 0 pushed. Public mirror created at `TUMO-MOGAME/crema`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-06 | Phase 2 built. Eight migrations, seed, Drizzle mirror, migration runner, 39 database tests and a drift guard, all verified against a real Postgres 17. CI gained a Database stage. A whitespace-handling mismatch between the SQL constraints and the Zod contract was found and fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-06 | Phase 1 built. Coverage raised to threshold with real tests for the error paths, 91 unit tests and 7 end-to-end journeys. First CI run failed on a corrupted lockfile missing `yaml` — repaired, and the catch is the argument for `npm ci`. All nine stages green. `main` protected and the gate verified against both a direct push and a failing pull request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-06 | Phase 3 repository layer and brew CRUD built. `BrewRepository` with a 27-test contract suite both adapters pass, in-memory adapter seeded from the same data as `seed.sql` and guarded against drifting from it, Drizzle adapter written and proven against a real Postgres while staying dormant. 228 unit tests and 79 database tests. The contract suite found three silent differences between the adapters — gram rounding, timestamp offsets, and handing out the stored object instead of a copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-06 | Phase 3 finished. `/api/brew-methods`, `/api/stats` over the two aggregate views, and a fixed-window rate limiter with an accurate `Retry-After`. The contract suite grew to 39 tests as the stats arithmetic had to be reproduced exactly by the in-memory adapter. 272 unit tests, 91 database tests, 7 end-to-end journeys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-06 | Phase 4 built. Three-layer design tokens with light and dark themes, the brew list and both wireframe dialogs, delete with confirmation, and a three-state theme toggle. 55 web tests and 9 end-to-end journeys. The rating badge departs from the wireframe's traffic light on purpose — the scale runs pale ash to full crema with a proportional arc, so the value stays legible without colour. Two bugs surfaced in test rather than in the browser: stacked dialogs sharing one title id, and a rejected save escaping as an unhandled promise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-06 | Phase 4 built and opened as #6, then blocked on a GitHub Actions major outage — four runs failed with jobs completing zero or one step, never a test or a lint rule. The outage exposed a real hole: the aggregate `CI` check passed while `Lint and format` was red, because a job killed by infrastructure reports `abandoned`. The gate now demands `success` from every stage and prints what it saw. Also rewrote eight commit messages to drop attribution trailers, force-pushed both remotes, and restored branch protection to its exact prior settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-07 | Phase 4 merged once Actions recovered, then a full codebase audit and its remediation merged on top as #7. Nine commits closing every finding: production refuses the in-memory adapter, the brew list is paged and carries its own total, responses are parsed rather than cast, request bodies are bounded at 16 KB, forwarded headers are only believed behind a trusted proxy, dialogs return focus, six measured contrast failures are fixed behind a test that reads the tokens, migrations are replayable through a ledger, and the contract package's coverage thresholds are actually enforced. 374 unit tests, 99 database tests, 9 end-to-end journeys. Two of the fixes were themselves wrong and the suites said so — the contract suite caught the Postgres adapter reporting a total of zero for a page past the end of the log while the in-memory adapter said three, and the drift guard rejected the new ledger table for sitting in `public` without row level security. One low advisory is carried deliberately rather than fixed; see Blocked on for why. |

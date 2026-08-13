# Status

**Project:** Crema — Coffee Brew Log **Branch:** `main` **Last updated:**
2026-08-13

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
| 5     | Polish — a11y, motion, states                 | **done**    | 100%     |
| 6     | AI — Quick Log, Coach agent, guardrails       | in progress | 55%      |
| 7     | Ship — Vercel, docs, demo                     | in progress | 40%      |

**Overall: planning and phases 0 through 5 are complete, and both remaining
phases are under way.** 500 unit tests, 99 database tests, 10 provider tests and
16 end-to-end journeys passing, `main` protected and green. Supabase is
connected and the app is deployed: the third production deploy built green after
the two failures the deployment log records. What remains is making the URL
public, the rest of the AI surfaces, and the final documentation pass.

---

## Now

**The app is deployed.** The five deployment fixes are merged to `main` on both
remotes, and the production deploy of that commit built green — the third
attempt, after the Root Directory and entrypoint failures the deployment log
walks through. One Vercel project runs both workspaces as services behind a
single origin, exactly as [deployment.md](./deployment.md) describes. The URL is
not yet public: Vercel's deployment protection is on by default and every
deployment URL answers with a login redirect until the dashboard toggle turns it
off. The live URLs land in deployment.md the moment it does.

Phases 0, 1 and 2 are complete and verified. The monorepo runs, builds, tests
and lints clean on a fresh install; every change to the portfolio repository has
to pass nine CI stages behind a protected branch; and the full Postgres schema
exists as ordered migrations that CI applies to a real database on every push.

Phase 5 is complete and merged, and it closes the polish work. Writes apply
before the server agrees and roll back if it refuses, so the list never sits
waiting on a round trip. The states a real network produces are all drawn:
loading skeletons, empty, error, and an offline banner that says the connection
is gone rather than letting a write fail into nothing. Toasts announce through
`aria-live`, dialogs trap focus and hand it back, every control is reachable by
keyboard, and motion stays restrained and honours `prefers-reduced-motion`.

The accessibility target is met as zero axe violations across five page states
rather than as a Lighthouse number. Lighthouse computes that score by running
axe and weighting the rules that break, so asserting the engine directly is both
stricter and more useful: a score of 95 means something is wrong and the
rounding was kind, while a failure here names the rule, the impact and the
element instead of moving a dial.

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

**Supabase is connected, and the claim that the swap was a configuration change
has now been tested rather than asserted.** A project was provisioned, the nine
migrations applied to it, and `DATA_SOURCE=postgres` set — no application code
was touched, exactly as the repository pattern promised. The 99 database tests
pass against it, and the app serves the log from it: create, read, update, soft
delete and the aggregate views, all over real HTTP against real Postgres. That
closes the brief's ORM requirement, which the in-memory adapter had left open.

Connecting it exposed a defect in the database suite that CI could not have
caught, because CI always seeds. One test asserted that a brew method still
referenced by a brew cannot be deleted — without creating that brew. It depended
on a row `seed.sql` happens to leave behind, so against a migrated but unseeded
database the assumption inverted: nothing referenced `v60`, the delete succeeded
instead of being refused, and the vocabulary lost a row that every later test
needed. One unstated precondition cost 52 failures, none of which named the
cause. The test now arranges its own brew and cleans it up, and the fix is
verified the only way that means anything — by running the whole suite against a
migrated, unseeded database, where it now passes and leaves all eight methods
intact.

Phase 6 has a model behind it. `GeminiAiProvider` passes all ten tests the fake
passes — the suite written before the adapter existed, and not adjusted
afterwards to accommodate what the model turned out to do. Running it for real
immediately paid for itself. The prompt originally told the model that the dose
is the smaller amount and the water the larger, which sounds sensible and is
wrong: given "900g through the V60, 12 water" the model obediently swapped them
and rewrote what the person said. Numbers are now reported as the sentence
assigns them, however odd the result looks, because an unusual brew is the
drinker's business.

Two numbers in that adapter come from measurement rather than taste. The timeout
is 30 seconds because typical calls return in 1.8 to 5 but the tail is long and
not input-dependent — the same sentence came back in 2.0s and then 15.9s — so
the original 15 second ceiling was failing calls that were about to succeed,
which reads as a broken feature rather than a slow one. And thinking is set to
`low`, because on this task the default budget spends 273 reasoning tokens to
reach the identical object: nine times the output for the same answer.

The repository lives in two places. `main` cannot be protected on the classroom
repository — it belongs to the `Umuzi-classroom` organisation and this account
has push access but not admin — so the enforced workflow lives on the public
mirror at <https://github.com/TUMO-MOGAME/crema> and both remotes are kept at
the same commit.

| Check                      | Result                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run verify`           | green — format, lint, typecheck, test                            |
| Unit and integration tests | 500 passing (71 shared, 269 backend, 160 web)                    |
| Database tests             | 99 passing against Supabase, and against Postgres 17 unseeded    |
| AI provider tests          | 10 passing against Gemini, run separately by `npm run test:ai`   |
| End-to-end journeys        | 16 passing against production builds                             |
| Coverage                   | shared 100%, backend 99% lines / 85% branches, web 96.6% / 88.2% |
| Bundle                     | 115 kB js and 5 kB css gzipped, against a 250 / 40 kB budget     |
| CI on `main`               | all nine stages green                                            |
| Branch protection          | direct push to `main` rejected, failing PR blocked               |

Toolchain as resolved: Node 24.11, TypeScript 6, ESLint 10, Vitest 4, Vite 8,
React 19.2, Hono 4.13, Zod 4.4, Playwright 1.62.

## Blocked on

**One dashboard toggle.** The production deploy is green, but every URL Vercel
exposes for it redirects to a Vercel login: Deployment Protection ships enabled
("Standard Protection") and the free plan offers no per-environment carve-out.
Turning **Require Log In** off under Settings → Deployment Protection makes the
production domain public. It is a dashboard action on the project owner's
account, so it cannot be scripted from the repository — everything else about
the deploy is code and is done.

One flake is worth naming so the next person to hit it does not go looking for a
bug in their own change. On Windows, `npm run verify` intermittently reports the
web suite running 6 files instead of 9, with unhandled errors reading
`Failed to start forks worker` and coverage collapsing to around 25% — roughly
half of observed runs. It is process exhaustion rather than a test failure: the
web suite runs third, after two other vitest processes in the same invocation,
and passes every time it is run on its own or with `--pool=threads`. CI is
unaffected, because each stage there gets its own runner. The fix is probably
`pool: 'threads'` for the web workspace, and it is left undone rather than
slipped into an unrelated change.

One dependency advisory is deliberately carried rather than fixed, and it is
recorded here so it is not mistaken for an oversight. `npm audit` reports one
low advisory, GHSA-g7r4-m6w7-qqqr, in a transitive `esbuild` — a
development-server issue on Windows only. It arrives through `tsup`, which pins
a range that cannot resolve the patched version, so clearing it means
regenerating the lockfile; doing that on Windows drops 62 optional platform
binaries that only install on Linux and macOS, and `npm ci` on the runner then
fails to find them. That is the same lockfile damage `.npmrc` exists to prevent,
so the advisory stays visible and documented in `package.json` instead of being
traded for a broken pipeline. It clears when `tsup` widens its range, or when
the lockfile is regenerated on Linux. CI gates at `--audit-level=high`, so this
does not mask anything.

## Next

Phase 6 — the Brew Coach. Quick Log is now complete end to end, so what remains
is the agent: the four read-only tools over the log, streamed answers, the
visible tool-call trace, and the flavour tag extraction into `brew_flavor_tags`.
It degrades to a clean 503 without a key, which the health endpoint already
reports, the API already returns, and the frontend now already respects — the AI
surfaces render only when health says there is an AI to talk to.

Nothing about them writes to the database directly: the agent proposes and the
human commits, which is why `ai_suggestions` exists as its own table with
constraints rather than as a code convention.

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
- [x] Deployment entrypoint — `backend/src/server.ts`, the same file
      `npm run dev` starts
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

### Phase 5 — Polish — done

- [x] Optimistic create, update, delete with rollback
- [x] Loading skeletons, empty state, error state, offline state
- [x] Toasts with `aria-live`
- [x] Focus trap and restore on dialogs
- [x] Full keyboard navigation
- [x] Restrained motion, honouring `prefers-reduced-motion`
- [x] Lighthouse accessibility ≥ 95 — met as **zero axe violations**

The last row is worth explaining rather than ticking. Lighthouse computes its
accessibility score by running axe and weighting the rules that break, so the
suite asserts that engine directly instead of the number it produces. That is
stricter and more useful: a score of 95 means something is wrong and the
rounding was kind, while zero violations means nothing is — and a failure names
the rule, the impact and the element rather than moving a dial.

Five page states are checked against WCAG 2.2 A and AA on the production build:
the log, the add form, the delete confirmation, the light theme, and the empty
state. Two more cases cover what axe cannot judge — that every control is
reachable by keyboard, and that Escape closes a dialog and returns focus to the
control that opened it.

### Phase 6 — AI

- [x] Provider abstraction with a deterministic fake for tests
- [x] Quick Log — structured output parsed by `createBrewSchema`
- [x] Pre-filled form with inferred-field highlighting
- [ ] Coach agent with `listBrews`, `getBrewStats`, `findSimilarBrews`,
      `proposeBrew`
- [ ] Streaming responses
- [ ] Visible tool-call trace
- [ ] Flavour tag extraction into `brew_flavor_tags`
- [ ] Rate limiting, timeouts, input caps
- [ ] Verified: full app works with `GEMINI_API_KEY` unset
- [ ] Token usage logged and surfaced

### Phase 7 — Ship

The two projects this checklist originally named (`crema-web`, `crema-api`)
became one Vercel project in services mode — PLANNING section 8 records the
revision and what it removed.

- [x] Vercel project running both workspaces as services from the root
      `vercel.json`
- [x] Environment variables set in Vercel only
- [x] Preview deployments on pull requests
- [x] Production deploy green
- [ ] Production URL public — blocked on the Deployment Protection toggle
- [ ] `deployment.md` with live URLs
- [ ] `README.md`
- [ ] `Documentation.md`
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

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Repository audited. Planning and research completed. `PLANNING.md` and `STATUS.md` created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-05 | All four open decisions settled. Phase 0 unblocked, awaiting go-ahead to scaffold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-05 | Phase 0 built and verified: workspaces, contract package, API shell, frontend shell, tooling, docs. 62 tests green, both workspaces building, API smoke-tested over the wire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-05 | Phase 0 pushed. Public mirror created at `TUMO-MOGAME/crema`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-06 | Phase 2 built. Eight migrations, seed, Drizzle mirror, migration runner, 39 database tests and a drift guard, all verified against a real Postgres 17. CI gained a Database stage. A whitespace-handling mismatch between the SQL constraints and the Zod contract was found and fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-06 | Phase 1 built. Coverage raised to threshold with real tests for the error paths, 91 unit tests and 7 end-to-end journeys. First CI run failed on a corrupted lockfile missing `yaml` — repaired, and the catch is the argument for `npm ci`. All nine stages green. `main` protected and the gate verified against both a direct push and a failing pull request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-06 | Phase 3 repository layer and brew CRUD built. `BrewRepository` with a 27-test contract suite both adapters pass, in-memory adapter seeded from the same data as `seed.sql` and guarded against drifting from it, Drizzle adapter written and proven against a real Postgres while staying dormant. 228 unit tests and 79 database tests. The contract suite found three silent differences between the adapters — gram rounding, timestamp offsets, and handing out the stored object instead of a copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-06 | Phase 3 finished. `/api/brew-methods`, `/api/stats` over the two aggregate views, and a fixed-window rate limiter with an accurate `Retry-After`. The contract suite grew to 39 tests as the stats arithmetic had to be reproduced exactly by the in-memory adapter. 272 unit tests, 91 database tests, 7 end-to-end journeys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-06 | Phase 4 built. Three-layer design tokens with light and dark themes, the brew list and both wireframe dialogs, delete with confirmation, and a three-state theme toggle. 55 web tests and 9 end-to-end journeys. The rating badge departs from the wireframe's traffic light on purpose — the scale runs pale ash to full crema with a proportional arc, so the value stays legible without colour. Two bugs surfaced in test rather than in the browser: stacked dialogs sharing one title id, and a rejected save escaping as an unhandled promise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-06 | Phase 4 built and opened as #6, then blocked on a GitHub Actions major outage — four runs failed with jobs completing zero or one step, never a test or a lint rule. The outage exposed a real hole: the aggregate `CI` check passed while `Lint and format` was red, because a job killed by infrastructure reports `abandoned`. The gate now demands `success` from every stage and prints what it saw. Also rewrote eight commit messages to drop attribution trailers, force-pushed both remotes, and restored branch protection to its exact prior settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-07 | Phase 4 merged once Actions recovered, then a full codebase audit and its remediation merged on top as #7. Nine commits closing every finding: production refuses the in-memory adapter, the brew list is paged and carries its own total, responses are parsed rather than cast, request bodies are bounded at 16 KB, forwarded headers are only believed behind a trusted proxy, dialogs return focus, six measured contrast failures are fixed behind a test that reads the tokens, migrations are replayable through a ledger, and the contract package's coverage thresholds are actually enforced. 374 unit tests, 99 database tests, 9 end-to-end journeys. Two of the fixes were themselves wrong and the suites said so — the contract suite caught the Postgres adapter reporting a total of zero for a page past the end of the log while the in-memory adapter said three, and the drift guard rejected the new ledger table for sitting in `public` without row level security. One low advisory is carried deliberately rather than fixed; see Blocked on for why.                                                                                                                                                                                                                                                                                                         |
| 2026-08-08 | Phase 5 merged as #10 and #11, closing the polish work. Optimistic create, update and delete with rollback; skeleton, empty, error and offline states; toasts through `aria-live`; focus trapped and handed back; exit motion honouring `prefers-reduced-motion`. The Lighthouse ≥ 95 target is met as zero axe violations across five page states, because Lighthouse scores that metric by running axe and weighting the rules that break — asserting the engine names the rule, the impact and the element instead of moving a dial. 412 unit tests, 99 database tests, 16 end-to-end journeys. One contrast assertion had to be taught to wait for the page to stop moving before measuring, having read a colour mid-transition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-09 | Classroom repository brought level with the mirror. It had been four commits behind and carried none of Phase 5, which matters because that is the repository the assessment is marked from; both remotes are now at `f0b8ffb`. The `refs/original` backup left behind by the Phase 4 message rewrite was deleted — it still held the pre-rewrite commits, and no reachable commit on any ref now carries a trailer. README refreshed to Phase 5, and this board's check table corrected: it had still been reporting the Phase 3 test counts and the Phase 4 branch as blocked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-09 | Phase 6 opened with the AI seam: an `AiProvider` interface, a deterministic fake that needs no key, and the contract suite written before the adapter it will judge. `BrewProposal` is deliberately not `CreateBrewInput`, so a candidate cannot reach the repository by accident. No `createAiProvider` yet — the honest version cannot exist until there is a provider to return, or health would report `ai.enabled: true` while every AI route answered 503. 464 unit tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-09 | Supabase connected and the brief's ORM requirement closed. Nine migrations applied to a real project and `DATA_SOURCE` set to postgres with no application code touched — the repository pattern's central claim, tested rather than asserted. The app now serves the log from Supabase over real HTTP: create, read, update, soft delete and the aggregate views. Two things surfaced. The pooler host had to be found by probing regions, because Supavisor answers a wrong region, a wrong `aws-N` prefix and a wrong project ref with the same "tenant not found". And a database test that never arranged its own brew depended on a row seed.sql leaves behind, so against a migrated but unseeded database it deleted the `v60` method it was asserting could not be deleted, failing 52 tests downstream with nothing naming the cause. Fixed to arrange and clean up after itself, and verified against a migrated, unseeded database where the suite now passes with all eight methods intact.                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-09 | Gemini wired in behind the seam, and the contract suite earned its keep on the first run. `GeminiAiProvider` passes all ten tests the fake passes — tests written before the adapter existed and not adjusted to accommodate what the model turned out to do. Two things came out of running it for real. The prompt originally told the model that the dose is the smaller amount and the water the larger, which is a reasonable heuristic and wrong: given "900g through the V60, 12 water" the model dutifully swapped them, rewriting what the person said. It now reports the two as the sentence assigns them however odd the result looks. And the timeout was set from measurement rather than taste — typical calls return in 1.8 to 5 seconds, but the same sentence came back in 2.0s on one attempt and 15.9s on the next, so a 15 second ceiling was failing calls that were about to succeed. It is 30 seconds, which bounds the pathological case without cutting into the normal range. Thinking is set to `low`: on this task the default budget spends 273 reasoning tokens to reach the identical object, nine times the output for the same answer. `createAiProvider` now exists, because there is finally a provider to return honestly. 468 unit tests, plus 10 against the real model.                                                                          |
| 2026-08-09 | `POST /api/ai/quick-log` serves the first AI surface. A 200 rather than a 201, because nothing is created — what comes back is a candidate the user confirms in the normal Add form, and `POST /api/brews` is still the only route that writes a brew. Guardrails are the point of the endpoint as much as the extraction: a 500-character cap in the shared schema, the 16 KB body limit underneath it, a 10-per-minute budget mounted on `/api/ai/*` because a request here costs a model call rather than a map lookup, the client's disconnect handed to the provider so a user who navigates away stops paying for tokens, and a 503 with `AI_UNAVAILABLE` on a deployment with no key. Sixteen route tests cover every one of those against the fake, with no key and no bill. Two things were corrected on the way. `/api/health` was reporting `ai.enabled` from the environment while the routes used the injected provider, so an app built without one on a machine that had a key would have advertised a surface that answered 503 — it now reads the service the requests go to. And the default wiring used `dependencies.ai ?? createAiProvider()`, which would have handed a test asserting the 503 path a real provider on any machine with a key configured, passing for the wrong reason. Verified end to end against real Gemini and real Supabase. 486 unit tests. |
| 2026-08-13 | Deployed. Five commits fixed what two failed deploys surfaced — the build importing the test runner, the frontend's headers living in a file services mode never reads, and the service entrypoint naming the file that listens rather than the file that exports the app — and the third production deploy built green. All five are merged to `main` on both remotes, the fix branch is deleted everywhere, and the plan's deployment section now describes the single-origin services setup that actually shipped rather than the two projects it proposed. One thing holds the URL back: Vercel's default deployment protection answers every request with a login redirect until it is switched off in the dashboard, which is recorded under Blocked on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-13 | Quick Log reaches the form, which closes the feature. A sentence box sits at the top of the Add dialog — only there, and only when `/api/health` says the deployment has an AI — and hands the sentence to `POST /api/ai/quick-log`. What comes back pre-fills the form as values to check: fields the model inferred rather than was told wear an accent chip and border, the mark is part of the control's accessible description rather than only a colour, and it comes off the moment the reader edits the field. A proposed `brewedAt` is said in a sentence above the buttons, because it is the one field with no visible control and a value that rode along silently would be exactly the surprise the confirmation step exists to prevent. Nothing reaches `POST /api/brews` until Save — the test suite asserts that directly. Fourteen new web tests, two new measured contrast pairings for the chip and its border. 500 unit tests.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

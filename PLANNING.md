# Planning

**Project:** Crema — a brew log for people who take coffee seriously **Author:**
Tumo Mogame **Assessment:** XPL Full-stack Developer Bootcamp **Last updated:**
2026-08-14

This document is the plan of record. It explains what is being built, why each
technical decision was made, and in what order the work happens. Live progress
is tracked separately in [STATUS.md](./STATUS.md).

---

## 1. Scope

### 1.1 What the assessment requires

The brief (preserved in [docs/assessment-brief.md](./docs/assessment-brief.md))
asks for a Coffee Brew Log app with full CRUD, list filtering by brew method, a
JSON API at `/api/brews`, an ORM over a SQL database, server- and client-side
validation, correct HTTP status codes, responsive UI matching the supplied
wireframes, a page title of `Brews: {brewCount}`, tidy git history, no hardcoded
secrets, and a deployed URL.

Every one of those is a hard requirement and is tracked as an acceptance
criterion in section 9.

### 1.2 What takes it beyond the brief

The brief describes a to-do list with coffee vocabulary. Anyone can ship that.
The goal here is a small system that reads like production software, so the work
goes further in four specific directions:

1. **A real AI feature, not a chatbot bolted on.** A brew coach agent that has
   tool access to the user's own brew history, plus natural-language brew
   capture. Both are described in section 6.
2. **Database-ready, database-independent.** The full Postgres schema ships as
   reviewed Supabase migrations from day one, while the running app is backed by
   an in-memory repository behind an interface. Connecting Supabase later is a
   one-line change, not a rewrite. Section 5.
3. **A pipeline that actually gates merges.** Protected `main`, eight CI stages,
   secret scanning, coverage thresholds. Section 7.
4. **Documentation a reviewer can follow without asking a question.** README,
   Documentation.md, deployment.md, this file, and STATUS.md.

### 1.3 Explicitly out of scope for v1

- Real authentication flows. The schema is auth-ready (`profiles`, `user_id`
  columns, RLS policies) but v1 runs as a single implicit user. Building a half
  auth system is worse than building none.
- Image upload for bean bags.
- Multi-user sharing or social features.
- Mobile app.

These are listed in the README as "what I would build next", which is a stronger
signal than pretending they were never considered.

---

## 2. Product name and positioning

**Crema.** The layer of foam on a good espresso shot, and a word that signals
the app is by someone who actually cares about coffee.

One-line pitch used in the README and on the landing state:

> Log every brew, spot what actually made it good, and let a coach that has read
> your whole log tell you what to change next time.

Naming the app costs nothing and immediately separates it from
`coffee-brew-log-assessment`.

---

## 3. Technology decisions

Every choice below is recorded with the reason, because "why" is what gets asked
in an interview.

| Layer        | Choice                                                      | Why this and not the obvious alternative                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | TypeScript 5.x, strict                                      | Non-negotiable. `strict: true`, `noUncheckedIndexedAccess: true`.                                                                                                                                                                                                     |
| Runtime      | Node 24 LTS                                                 | Pinned in `.nvmrc` and `engines`, so CI and local match.                                                                                                                                                                                                              |
| Repo layout  | npm workspaces monorepo                                     | The brief requires separate `frontend/` and `backend/` folders. Workspaces give that separation plus a shared package, with no extra build tooling to explain. Turborepo would be over-engineering at three packages.                                                 |
| Frontend     | React 19 + Vite 7                                           | The brief wants a clear frontend/backend split. Vite keeps the frontend a genuine SPA talking to a genuine API over HTTP, which proves API design in a way a Next.js app calling its own server actions does not. Also: sub-second HMR, trivial Vercel static deploy. |
| Styling      | Tailwind CSS v4 + shadcn/ui                                 | Satisfies the "any CSS framework" requirement. shadcn components are copied into the repo, not imported from a black box, so the accessibility work (focus traps, ARIA) is visible and reviewable.                                                                    |
| Routing      | React Router 7                                              | List and modal routes, deep-linkable `/brews/:id/edit`.                                                                                                                                                                                                               |
| Server state | TanStack Query v5                                           | Caching, optimistic updates, retry, and request de-duplication for free. Hand-rolled `useEffect` fetching is the single clearest junior tell.                                                                                                                         |
| Forms        | React Hook Form + Zod resolver                              | The same Zod schema validates the form and the API body. One source of truth.                                                                                                                                                                                         |
| Backend      | Hono 4                                                      | Web-standard `Request`/`Response`, first-class TypeScript, runs unchanged on Node locally and on Vercel Functions in production, and its test client needs no HTTP server. Express is the conservative pick and is a supported fallback — see section 11.             |
| Validation   | Zod 4                                                       | Shared between frontend, backend, and the AI structured-output layer.                                                                                                                                                                                                 |
| ORM          | Drizzle ORM                                                 | TypeScript-first, and `drizzle-kit generate` emits plain reviewable SQL that doubles as the Supabase migration files. Prisma's generated client and separate schema language add a build step and a second dialect for no benefit here.                               |
| Database     | Supabase Postgres                                           | Migrations written now, connection deferred. Section 5.                                                                                                                                                                                                               |
| AI           | Vercel AI SDK v6 + `@ai-sdk/google`                         | Provider-agnostic interface over Gemini, with first-class tool calling, streaming, and Zod-typed structured output. Swapping providers later is a one-line change.                                                                                                    |
| Model        | Gemini Flash (free tier), pinned via `GEMINI_MODEL` env var | Fast and free-tier eligible. The exact model id lives in env, never hardcoded, so it can be bumped without a code change.                                                                                                                                             |
| Testing      | Vitest, React Testing Library, MSW, Playwright              | Unit, integration, and one real end-to-end journey.                                                                                                                                                                                                                   |
| CI/CD        | GitHub Actions                                              | Section 7.                                                                                                                                                                                                                                                            |
| Hosting      | Vercel, one project in services mode                        | Section 8. Planned as two projects; built as one so the app answers on a single origin.                                                                                                                                                                               |

---

## 4. Architecture

### 4.1 Repository layout

```
.
├── frontend/                    React 19 + Vite SPA
│   ├── src/
│   │   ├── app/                 App shell, providers, router
│   │   ├── features/
│   │   │   ├── brews/           List, filters, form, card, delete flow
│   │   │   └── coach/           AI coach panel and quick-log
│   │   ├── components/ui/       shadcn primitives
│   │   ├── lib/                 api client, query keys, formatters
│   │   └── test/                setup, MSW handlers
│   └── e2e/                     Playwright specs
│
├── backend/                     Hono JSON API
│   ├── src/
│   │   ├── app.ts               Route composition (no listener — testable)
│   │   ├── server.ts            Node entrypoint for local dev
│   │   ├── config/env.ts        Zod-validated environment, fails fast
│   │   ├── routes/              brews.ts, ai.ts, health.ts
│   │   ├── services/            Business logic, framework-agnostic
│   │   ├── repositories/        BrewRepository interface + adapters
│   │   ├── db/                  Drizzle schema, client factory
│   │   ├── ai/                  Agent, tools, prompts, guardrails
│   │   └── middleware/          error handler, request id, rate limit, CORS
│
├── shared/                      Zod schemas + inferred types, used by both
│
├── supabase/
│   ├── migrations/              Ordered, reviewed SQL — the schema of record
│   └── seed.sql                 Reference data + demo rows
│
├── .github/
│   ├── workflows/ci.yml
│   ├── pull_request_template.md
│   └── CODEOWNERS
│
├── docs/
│   ├── assessment-brief.md      Original brief, preserved verbatim
│   ├── architecture.md          Diagrams and request lifecycle
│   └── adr/                     Architecture decision records
│
├── README.md                    Front door
├── Documentation.md             Setup and project description (required)
├── deployment.md                Live URLs and deploy notes (required)
├── PLANNING.md                  This file
└── STATUS.md                    Live progress
```

### 4.2 Layering rule

```
route handler  →  service  →  repository  →  (adapter: memory | drizzle)
```

Handlers do HTTP only: parse, validate, map result to status code. Services hold
business rules and know nothing about Hono. Repositories hold persistence and
know nothing about business rules. Dependencies point inward, always.

This is what makes section 5 possible, and it is the single thing that most
clearly separates a bootcamp project from a professional one.

### 4.3 Contract sharing

`shared/` exports one Zod schema per concept. The backend parses request bodies
with it. The frontend drives React Hook Form with it and infers its TypeScript
types from it. If the contract changes, both sides fail to compile in the same
commit. There is no drift, and no hand-written duplicate types.

### 4.4 API surface

| Method   | Path                         | Success            | Errors                                                                                |
| -------- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `GET`    | `/api/brews`                 | `200`              | `400` bad filter                                                                      |
| `GET`    | `/api/brews?method=v60`      | `200`              | `400` unknown method                                                                  |
| `GET`    | `/api/brews/:id`             | `200`              | `404`                                                                                 |
| `POST`   | `/api/brews`                 | `201` + `Location` | `400` validation, `422` semantic                                                      |
| `PATCH`  | `/api/brews/:id`             | `200`              | `400`, `404`, `422` semantic                                                          |
| `DELETE` | `/api/brews/:id`             | `204`              | `404`                                                                                 |
| `GET`    | `/api/brew-methods`          | `200`              | —                                                                                     |
| `GET`    | `/api/stats`                 | `200`              | — (empty log is zeroes, not 404)                                                      |
| `GET`    | `/api/brews/:id/flavor-tags` | `200`              | `404`                                                                                 |
| `POST`   | `/api/ai/quick-log`          | `200`              | `400`, `413`, `422` unreadable, `429`, `503`                                          |
| `POST`   | `/api/ai/coach`              | `200` streamed     | `400`, `413`, `429`, `503` — a mid-stream failure is the stream's final `error` event |
| `POST`   | `/api/ai/flavor-tags`        | `200`              | `400`, `404` no such brew, `429`, `503`                                               |
| `GET`    | `/api/health`                | `200`              | —                                                                                     |

The AI routes were planned as `/api/coach/*` and built under `/api/ai/*`. The
namespace changed so the tighter rate budget — a request here costs a model
call, not a map lookup — mounts on one prefix instead of a list of paths that
somebody would eventually forget to extend. Quick Log answers `200` rather than
`201` because nothing is created: what comes back is a proposal the user
confirms in the normal Add form, and `POST /api/brews` remains the only route
that writes a brew.

Errors use a single envelope so the frontend has exactly one shape to handle:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [
      { "field": "coffeeGrams", "message": "Must be greater than 0" }
    ],
    "requestId": "01J8X..."
  }
}
```

**400 against 422.** A 400 means a field is wrong on its own — blank, too long,
not a number, not a brew method — and the client can point at the input. A 422
means every field passed and the combination is impossible: a brew dated in the
future, or less water than coffee. Two codes rather than one because the client
does different things with them.

The 422 on `PATCH` was added while building Phase 3. The table originally listed
only `400` and `404` there, which left the semantic rules enforced on create and
not on update — and a rule you can walk around one `PATCH` at a time is not a
rule. Sending 400g of coffee to a brew already holding 288g of water is refused
by both routes now, for the same reason and with the same code.

**Rate limiting.** Every `/api/*` route is behind a fixed window of
`RATE_LIMIT_PER_MINUTE` requests per caller, answering `429` with an accurate
`Retry-After`. The window lives in the instance's memory, which makes it a
courtesy limit and not a security control: the API runs as serverless functions,
so a caller spread across ten cold starts gets ten windows. That is stated
plainly in `backend/src/middleware/rate-limit.ts` rather than left for someone
to discover. It exists to stop a runaway client loop or a retry storm, and it is
the same middleware the coach routes will use in Phase 6 with a much tighter
limit, where a request costs a model call instead of a map lookup.

---

## 5. Database strategy — migrations now, connection later

The instruction is to have the full schema ready without wiring up a live
database yet. That constraint is met with the repository pattern rather than by
leaving the app half-built.

**How it works.** `BrewRepository` is an interface in
`backend/src/repositories/brew.repository.ts`. Two adapters implement it:

- `InMemoryBrewRepository` — seeded from `supabase/seed.sql` data mirrored as a
  TypeScript fixture. Used in v1 and in every test run.
- `DrizzleBrewRepository` — real Postgres, written and unit-tested against the
  same contract test suite, but not activated.

A factory reads `DATA_SOURCE` from the environment (`memory` | `postgres`) and
returns the right one. Turning on Supabase means setting two environment
variables in Vercel and applying the migrations. No application code changes.

**Migration authorship.** The plan was to run `drizzle-kit generate` and
hand-review its output. In practice the SQL is hand-authored and the Drizzle
schema mirrors it. Two reasons, both found while building it.

Almost nothing that makes this schema good is something `drizzle-kit` emits: row
level security policies, trigger attachment, `security_invoker` views, table and
column comments, partial indexes, and the `auth.uid()` compatibility shim.
Reviewing generated SQL and then hand-writing most of it anyway is worse than
writing it once. Separately, `drizzle-kit` pulls the deprecated `@esbuild-kit/*`
packages into the tree, carrying four moderate advisories for a tool this
project would not end up using.

So the SQL is the source of truth, and `backend/src/db/schema.ts` mirrors its
_structure_ — tables, columns, types, nullability, defaults, foreign keys — so
queries are typed. Two hand-maintained files can diverge, so a drift guard in CI
applies the migrations to a real Postgres and compares the result against those
declarations. Check constraints, indexes, triggers, views and RLS are declared
only in SQL and verified by CI exercising them, rather than restated in a second
place.

### 5.1 Migrations

| File                    | Contents                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `0000_foundation.sql`   | `pgcrypto`, `citext`, the shared `set_updated_at()` trigger function                       |
| `0001_profiles.sql`     | `profiles` mirroring `auth.users`, ready for Supabase Auth                                 |
| `0002_brew_methods.sql` | Lookup table + seeded vocabulary, mirroring `BREW_METHOD_SLUGS`                            |
| `0003_brews.sql`        | Core table, constraints, indexes, generated `brew_ratio`, `updated_at` trigger             |
| `0004_flavor_tags.sql`  | `flavor_tags` + `brew_flavor_tags` join, carrying provenance and confidence                |
| `0005_ai.sql`           | `ai_conversations`, `ai_messages`, `ai_suggestions` with the human-in-the-loop constraints |
| `0006_views.sql`        | `brew_stats` and `brew_stats_by_method`, both `security_invoker`                           |
| `0007_rls.sql`          | Row Level Security on every table, owner-scoped policies, `auth.uid()` compatibility shim  |

### 5.2 `brews` table, in detail

| Column                      | Type                                                              | Notes                                                     |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `id`                        | `uuid` PK                                                         | `gen_random_uuid()`                                       |
| `user_id`                   | `uuid` FK → `profiles`                                            | Nullable in v1, `NOT NULL` when auth lands                |
| `beans`                     | `text NOT NULL`                                                   | `CHECK (length(trim(beans)) > 0)`                         |
| `method_id`                 | `smallint` FK → `brew_methods`                                    | `ON DELETE RESTRICT`                                      |
| `coffee_grams`              | `numeric(6,2) NOT NULL`                                           | `CHECK (coffee_grams > 0 AND coffee_grams <= 500)`        |
| `water_grams`               | `numeric(7,2) NOT NULL`                                           | `CHECK (water_grams > 0 AND water_grams <= 5000)`         |
| `brew_ratio`                | `numeric GENERATED ALWAYS AS (water_grams / coffee_grams) STORED` | Computed in the database, never in application code       |
| `rating`                    | `smallint NOT NULL`                                               | `CHECK (rating BETWEEN 1 AND 5)`                          |
| `tasting_notes`             | `text NOT NULL`                                                   | Non-empty, per the brief's validation rule                |
| `brewed_at`                 | `timestamptz NOT NULL DEFAULT now()`                              | Separate from `created_at` — you can log yesterday's brew |
| `created_at` / `updated_at` | `timestamptz`                                                     | `updated_at` maintained by trigger                        |
| `deleted_at`                | `timestamptz`                                                     | Soft delete; `DELETE /api/brews/:id` sets it              |

Indexes: `(user_id, brewed_at DESC)` for the list view, `(method_id)` for the
filter, partial index `WHERE deleted_at IS NULL`.

The generated `brew_ratio` column and the soft delete are deliberate: they are
the details that show the schema was designed rather than transcribed from the
wireframe.

---

## 6. The AI layer

The rule that governs every decision here: **the AI must make the app better at
its actual job.** A chat bubble in the corner that answers general coffee trivia
adds nothing. These three features use data only this app has.

### 6.1 Quick Log — natural language to a validated brew

The user types or dictates:

> `18g of the Ethiopian through the V60, 300 water, tasted like blackcurrant and tea, solid 4`

Gemini returns a **Zod-typed structured object**, not free text. It is parsed
against the exact same `createBrewSchema` the API uses. The result opens the
normal Add form, pre-filled, with a diff highlight on what was inferred. The
user confirms or edits before anything is saved.

Nothing is ever written to the database without a human pressing Save. That is
stated in the README, because it is a design position, not an oversight.

### 6.2 Brew Coach — a tool-calling agent over your own log

An agent loop (AI SDK `streamText` with `tools` and a `stopWhen` step limit —
the plan said `generateText`, revised because an answer that takes ten seconds
to compose and arrives all at once reads as a hang) with four read-only tools:

| Tool               | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `listBrews`        | Filtered history — method, rating range, date range          |
| `getBrewStats`     | Aggregates: average rating per method, ratio distribution    |
| `findSimilarBrews` | Brews sharing beans or method, for like-for-like comparison  |
| `proposeBrew`      | Emits a candidate brew for the user to confirm — never saves |

Which makes questions like these answerable with real numbers:

- "What ratio gives me my best V60s?"
- "Why are my Aeropress brews worse than my pour-overs?"
- "What should I change about the Ethiopian tomorrow?"

The answer streams token by token. Every tool call the agent made is shown to
the user in a collapsible trace. Showing the agent's work rather than hiding it
is the difference between a demo and a product.

### 6.3 Flavour tagging

After a save, tasting notes are normalised into the controlled vocabulary of
flavour tags — the fourteen top-level SCA flavour wheel categories the migration
seeds — and written to `brew_flavor_tags` with `source: 'ai'` and a confidence.
This turns free text into something filterable and chartable, and it is the
reason that join table exists.

As built, "on save" became "asked for after the save": the client requests
extraction in its own request once the brew is stored, so the model's latency
never touches the save and a failed extraction loses tags, never brews. A
re-extraction replaces the model's previous opinion but never a human-applied
tag — the provenance column is load-bearing, and the `(brew, tag)` primary key
enforces the rule in Postgres.

### 6.4 Guardrails

These are the parts a reviewer will look for.

- `GEMINI_API_KEY` is read on the **backend only**. The browser never sees it,
  never proxies it, never receives it in a response.
- **Graceful degradation.** With no key set, `/api/coach/*` returns `503` with a
  clear code, the frontend hides the AI surfaces, and every requirement in the
  brief still works perfectly. A reviewer without a Gemini key gets a fully
  functional app.
- **Rate limiting** on AI routes — token bucket, per IP, returning `429` with
  `Retry-After`.
- **Input caps** on prompt length and conversation history size.
- **Timeout and abort** on every model call, with a typed fallback response.
- **No secrets, no PII in prompts.** The tools return only the caller's own brew
  rows.
- **Cost visibility.** Token usage per request is logged and surfaced in the
  trace panel.
- **Tested without the network.** The provider sits behind an interface with a
  deterministic fake used in CI, so AI tests are fast and free.

---

## 7. Git workflow, branch protection, and CI

### 7.1 Branching

`main` is protected and always deployable. All work happens on short-lived
branches merged by pull request with squash merge and linear history.

Branch names: `feat/brew-crud-api`, `fix/filter-reset`, `chore/ci-coverage`,
`docs/deployment-notes`.

Commits follow Conventional Commits, enforced by `commitlint` on a Husky
`commit-msg` hook. `lint-staged` runs ESLint and Prettier on staged files
pre-commit, so unformatted code cannot reach a branch.

### 7.2 Branch protection rules on `main`

- Require a pull request before merging
- Require all status checks below to pass
- Require branches to be up to date before merging
- Require linear history
- Require conversation resolution before merging
- Block force pushes and deletions
- Include administrators

### 7.3 Pipeline stages — `.github/workflows/ci.yml`

Runs on every push and pull request. Stages 2–7 run in parallel after install.

| #   | Stage       | What it does                                                                                            | Fails the build when                          |
| --- | ----------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `install`   | Checkout, Node 24, `npm ci`, cache `node_modules`                                                       | Lockfile out of sync                          |
| 2   | `lint`      | ESLint (flat config) + Prettier `--check` across all workspaces                                         | Any error or formatting drift                 |
| 3   | `typecheck` | `tsc --noEmit` per workspace                                                                            | Any type error                                |
| 4   | `test:unit` | Vitest, frontend + backend, coverage reporter                                                           | Coverage below 80% lines / 75% branches       |
| 5   | `test:api`  | Hono test client against the full route stack with the in-memory adapter                                | Any contract or status-code regression        |
| 6   | `sql`       | Migration lint: ordered filenames, non-empty, terminated statements, no `DROP` without a paired comment | Any violation                                 |
| 7   | `security`  | `npm audit --audit-level=high`, `gitleaks` full-history secret scan                                     | Any high-severity advisory or detected secret |
| 8   | `build`     | Vite production build + backend `tsc` build, bundle size budget                                         | Build failure or budget exceeded              |
| 9   | `e2e`       | Playwright: add → filter → edit → delete against the built app                                          | Any journey failure                           |

Stage 7 is the one that matters most for the "no secrets in the repo"
requirement: `gitleaks` scans the **entire history**, not just the diff, so a
secret committed and later removed still fails the build.

**The aggregate gate.** A tenth job, `CI`, depends on all nine and is the single
context branch protection requires — so adding or renaming a stage never means
editing the protection rule.

It must assert that every stage succeeded, and never enumerate the ways a stage
can fail. That is not a style preference; it was learned. The gate originally
guarded on `contains(needs.*.result, 'failure')` and was caught reporting all
nine stages green while `Lint and format` was red, during a GitHub Actions
outage on 2026-08-06. The result it had been handed was `abandoned` — what a job
reports when it dies at the infrastructure level rather than at one of its
steps, and a value that appears nowhere in the documented set of `success`,
`failure`, `cancelled` and `skipped`.

For the length of that run, the protected branch was not protected. A required
check that can pass over a red stage is worth less than no required check,
because it is trusted. The gate now runs unconditionally, prints
`Stage results: …` so the reason is in the log rather than three clicks away,
and fails unless every stage reports `success`.

---

## 8. Deployment

One Vercel project running both workspaces as services, configured by the
`vercel.json` at the repository root.

The plan called for two projects — `crema-web` for the SPA, `crema-api` for the
API — and was revised while shipping Phase 7. Vercel's Services preset detects
both workspaces from this one repository and routes between them, so the SPA is
served at `/` and `/api` is rewritten to the backend service, and the whole app
answers on a single origin. Taking that removed three problems rather than
solving them: no cross-origin request to permit, no second domain to keep in
step with a hardcoded CSP, and one URL to record instead of two that must agree.

| Service    | Root       | Framework | Serves                                            |
| ---------- | ---------- | --------- | ------------------------------------------------- |
| `frontend` | `frontend` | Vite      | The SPA, at `/`                                   |
| `backend`  | `backend`  | Hono      | The API, at `/api`, from the app `app.ts` exports |

The backend entrypoint is `src/app.ts`, not `src/server.ts`: Vercel's Hono
runtime imports a default-exported app and serves `app.fetch` itself, so the
entry must be the file that exports the app. `server.ts` — the file that binds a
port — is the entrypoint only where a real process listens, which is local
development and the end-to-end suite. Both are one import from the same
`createApp()`, so what the suite drives and what production serves cannot drift.

Environment variables are set in the Vercel dashboard only — never in the repo —
and the live table, with the reasoning for each value, is kept in
[deployment.md](./deployment.md) alongside the deploy log. `CORS_ORIGIN` and
`VITE_API_BASE_URL`, both planned above, are deliberately absent: one origin
serves everything, so there is no cross-origin request to permit and the client
defaults to a relative base in a built bundle.

`.env.example` documents every variable with a comment and a safe placeholder.
`.gitignore` excludes `.env`, `.env.*`, `!.env.example`, and local tooling
directories.

Preview deployments run on every pull request, so each PR carries a live URL a
reviewer can click.

---

## 9. Acceptance criteria

Every line is a check that must be green before the project is called done.
Ticked 2026-08-13, each against evidence rather than memory: the suites named in
STATUS, the live deployment, or the repository itself.

**Brief requirements**

- [x] Create a brew and persist it — end-to-end suite, and live against Supabase
- [x] List view of all brews
- [x] Filter list by brew method
- [x] Edit and update a brew
- [x] Delete a brew
- [x] Frontend framework in `frontend/`, backend framework in `backend/`
- [x] CSS framework in use — Tailwind v4
- [x] ORM over a SQL database — Drizzle over Supabase Postgres, live
- [x] Sensible component decomposition
- [x] UI follows the wireframes — one recorded departure, the rating badge
- [x] Responsive at 320px, 768px, 1280px
- [x] Page title reads `Brews: {brewCount}` and updates live — asserted in tests
- [x] Create and edit forms block submission on any blank field — shared schema,
      asserted on both sides
- [x] JSON API exposing CRUD at `/api/brews`
- [x] Server-side validation of every field
- [x] Correct HTTP status codes throughout — every row of section 4.4 tested
- [x] `Documentation.md` with setup instructions and description
- [x] Tidy git history, one descriptive commit per feature
- [x] No hardcoded secrets, all config from env, `.env.example` present —
      `gitleaks` scans full history in CI
- [x] Deployed, with the URL in `deployment.md` — live and verified

**Beyond the brief**

- [x] Full Supabase migration set, reviewed and ordered — applied to the live
      project
- [x] Repository pattern with two adapters and a shared contract test suite — 46
      contract cases, both adapters, real Postgres in CI
- [x] Quick Log natural-language capture with human confirmation
- [x] Brew Coach agent with four tools and a visible trace
- [x] App fully functional with no `GEMINI_API_KEY` set — the end-to-end suite
      runs keyless
- [x] `main` protected, all nine CI stages green
- [x] `gitleaks` clean across full history
- [x] Coverage thresholds met
- [x] Playwright journey passing — sixteen journeys
- [x] Keyboard-navigable, WCAG AA contrast, Lighthouse accessibility ≥ 95 — met
      as zero axe violations, with every colour pairing measured from the tokens

---

## 10. Delivery phases

Each phase is one or more pull requests into protected `main`. Progress against
these phases is what STATUS.md tracks.

| Phase              | Deliverable                                                                       | Exit criteria                                        |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **0 — Foundation** | Monorepo, TypeScript, tooling, Husky, `.gitignore`, `.env.example`, docs skeleton | `npm run verify` passes on a clean clone             |
| **1 — Pipeline**   | `ci.yml` with all nine stages, PR template, CODEOWNERS, branch protection         | A deliberately broken PR is blocked by CI            |
| **2 — Schema**     | Drizzle schema, all eight migrations, seed data, `docs/architecture.md`           | Migrations apply cleanly to a scratch Postgres in CI |
| **3 — API**        | Hono app, services, in-memory repository, full CRUD, error envelope, tests        | Every row of the section 4.4 table is tested         |
| **4 — UI**         | Design system, list, filter, add/edit dialog, delete, empty and error states      | Wireframes matched, responsive, brief's UI rules met |
| **5 — Polish**     | Optimistic updates, toasts, skeletons, focus management, motion, a11y pass        | Lighthouse ≥ 95 accessibility                        |
| **6 — AI**         | Provider abstraction, Quick Log, Coach agent, tools, trace UI, guardrails         | Works with a key; degrades cleanly without one       |
| **7 — Ship**       | Vercel services deploy, `deployment.md`, README, demo data, screenshots           | Live URL, green pipeline, all of section 9 checked   |
| **8 — Hardening**  | The section 13 audit findings, fixed in severity order                            | Every finding closed or recorded as a manual step    |

Phases 3 and 4 can overlap once the API contract in `shared/` is frozen.

As built, phases 0 through 6 are done and the app is live: all three AI surfaces
from section 6 shipped behind the provider seam, each held to a contract suite
the real model passes unchanged, and the deploy serves from a single Vercel
project rather than the two planned — the revision section 8 records. What
remains of phase 7 is documentation. The one deliberate departure from a
wireframe is the rating badge in phase 4: the wireframe draws a traffic light,
and the badge keeps its shape, size and position but runs the scale through the
drink instead — pale ash at 1, full crema at 5, with an arc filled to
`rating / 5`. Red against green is the one pairing a colour-blind reader cannot
separate, and here the colour is doing the scanning work down a list. The value
is now carried three ways, so no reader depends on any one of them.

---

## 11. Decisions taken

Settled 2026-08-05. Phase 0 is unblocked.

1. **Backend — Hono.** Web-standard `Request`/`Response`, first-class
   TypeScript, deploys to Vercel Functions without an adapter, and its test
   client exercises the full route stack without binding a port. Express was the
   conservative alternative; the layering in section 4.2 keeps that door open at
   a cost of roughly thirty lines if it is ever needed.
2. **Frontend — Vite + React 19.** The brief asks for a genuine frontend/backend
   split, and a standalone SPA talking to the API over real HTTP proves the API
   is real. Next.js was rejected here precisely because server actions and route
   handlers blur the boundary the brief asks for.
3. **AI scope — all three features in section 6.** Quick Log, the Brew Coach
   agent, and flavour tagging all land in Phase 6, after everything the brief
   grades is already complete and shippable. The downside risk is contained by
   the phase ordering; the differentiation is the point of the project.
4. **Domain — `*.vercel.app`, no custom domain.** Free, respectable, and
   satisfies the brief in full. A custom domain can be attached later without
   changing a line of code or configuration.

Settled 2026-08-10, while shipping Phase 7:

5. **Deployment — one Vercel project in services mode, not two.** The two
   projects planned in section 8 meant a CORS origin to permit, a second domain
   for the CSP to name, and two URLs that had to agree. The Services preset runs
   both workspaces behind one origin from the root `vercel.json`, which removes
   all three. The first failed deploy in the deployment.md log is what this
   decision cost to learn: services mode only exists when the project's Root
   Directory is the repository root.

Settled 2026-08-14, during the polish pass:

6. **The backdrop — a photographed scene behind frosted glass.** Two iterations,
   and the first one is the reason the second is right. Round one shipped an
   abstract texture veiled to near-invisibility, optimised for never competing
   with text — and it succeeded so completely that it read as no backdrop at
   all, which missed the want behind the ask. Round two inverts the mechanism:
   the picture is fully visible — a steaming cup on a lamplit table in the dark
   theme, a latte on sunlit linen in the light — and the safety layer moved from
   over the image to under the text. The content column is a full-height sheet
   of frosted glass, surface colour at 85% over a heavy backdrop blur, so the
   scene lives in the margins and the text's ground is effectively solid
   whatever the photograph does. Candidates were reviewed under the exact
   treatment they would ship with, which is what made the choice a judgement
   about backgrounds rather than about pictures.

7. **The mirror tracks content, not commit identity.** The first portfolio sync
   was merged with a rebase, which re-minted the shared commits under new ids —
   so the two repositories now tell one story in different commits, and a direct
   push of `main` can never fast-forward again. Rather than force-push the
   mirror back into byte-identical history, the sync routine accepts the fork:
   each sync is a branch cherry-picked onto the mirror's own `main`, verified
   tree-identical against the source before the pull request opens. The mirror's
   promise narrows from "the same history" to "the same code, reviewably" —
   which is the half a portfolio actually needs.

---

## 12. Risks

| Risk                                            | Mitigation                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini free-tier rate limits during a live demo | Response caching, `429` handled with a friendly message, seeded demo transcript available offline                                            |
| Reviewer has no Gemini key                      | Graceful degradation is an acceptance criterion, not a nice-to-have                                                                          |
| Scope creep from the AI work                    | AI is Phase 6. Everything the brief requires is complete and shippable at the end of Phase 5                                                 |
| Vercel monorepo build resolution                | Root Directory must be the repository root or services mode never engages; recorded in deployment.md after the first failed deploy proved it |
| Over-engineering                                | Section 1.3 states what is deliberately not built, and the README repeats it                                                                 |

---

## 13. Hardening — the 2026-08-14 audit

A full audit of the codebase — architecture, security, code quality, UI — on
2026-08-14 found no critical issues and nine worth fixing. They are listed here
in severity order, which is also the order Phase 8 works through them. Each row
names the fix so the work is a checklist rather than a judgement call.

| #   | Severity | Finding                                                                                             | Fix                                                                                                                               |
| --- | -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | The AI routes spend money per request, and the limiter guarding them counts per serverless instance | A shared rate-limit store in Postgres for `/api/ai/*`, so every instance draws from one budget. In-memory stays for the rest      |
| 2   | High     | The database password predates this pass and is not a generated value                               | **Manual:** reset it in the Supabase dashboard to a long generated value, update Vercel's `DATABASE_URL`, and the local `.env`    |
| 3   | Medium   | No error boundary — one render exception unmounts the whole app to a blank page                     | A boundary around the tree with a styled fallback and a reload action                                                             |
| 4   | Medium   | `brewedAt` exists so yesterday's brew can be logged honestly, but the form has no control for it    | An optional datetime field in the add/edit dialog; blank still means "now"                                                        |
| 5   | Low-Med  | The API client has no timeout, so a hung request leaves "Saving…" forever                           | A 15-second `AbortSignal.timeout` on every `apiRequest`, surfaced as the retryable network error the UI already handles           |
| 6   | Low      | The `ai_messages` schema comment says the coach trace is persisted; nothing writes those tables yet | Reword the comments to say the tables are forward provision for a persistence feature that has not shipped                        |
| 7   | Low      | Coach tools read the newest 200 brews and their summaries describe the slice as the whole log       | When the log is larger than the page read, the summary says so — the shown-work trace stays honest                                |
| 8   | Low      | Tasting notes, a 500-character prose field, is edited in a single-line input                        | A textarea                                                                                                                        |
| 9   | Low      | The light-theme token block is declared twice and can drift; SSE parsing has two robustness gaps    | A test asserting the two blocks agree token for token; the stream parser accepts CRLF framing and maps bad JSON to the same error |

Finding 2 is the one this repository cannot fix in code: the credential lives in
the Supabase dashboard and the Vercel environment, so rotating it is an operator
action. It is recorded here so "done" has a definition that includes it.

Out of scope for Phase 8, deliberately: authentication. It retires finding 1
outright, and the schema has already paid for it — `user_id` on every owned row,
RLS policies written and enabled — but it is a product decision, not a hardening
fix, and it stays in section 1.3 until the product asks for it.

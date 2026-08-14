# Documentation

Setup instructions and a description of the project, as required by the
assessment brief.

- Front door and feature overview: [README.md](./README.md)
- Design reasoning and decisions: [PLANNING.md](./PLANNING.md)
- Live progress: [STATUS.md](./STATUS.md)

---

## 1. What this project is

Crema is a coffee brew log. A user records each brew — the beans, the method,
the coffee and water doses, a rating out of five, and tasting notes — then reads
the log back as a list, filters it by brew method, and edits or deletes entries.

That is the assessment brief. Beyond it, Crema adds three features that use the
log as data rather than as storage: natural-language brew capture, a coach agent
that answers questions about your brewing using tools over your own history, and
flavour tagging that normalises free-text tasting notes into a controlled
vocabulary so they become filterable. All three are optional at runtime and
disable themselves cleanly when no AI key is configured.

The system is a small monorepo: a React single-page app, a standalone JSON API,
and a package of Zod schemas that both import so the API contract exists in
exactly one place.

## 2. Requirements

|          |                                                                   |
| -------- | ----------------------------------------------------------------- |
| Node     | 24 LTS — pinned in `.nvmrc` and enforced by `engines`             |
| npm      | **11.16 or newer** — enforced, see below                          |
| Database | **Not required.** The app runs on an in-memory adapter by default |
| AI key   | **Not required.** AI features disable themselves when absent      |

The last two are deliberate. Cloning and running should take a minute, with
nothing to provision.

## 3. Setup

```bash
git clone https://github.com/TUMO-MOGAME/crema.git
cd crema

nvm use          # optional; reads Node 24 from .nvmrc
npm install      # installs all three workspaces
cp .env.example .env
```

The defaults in `.env.example` are complete and working. Nothing needs editing
for a first run.

### Run it

```bash
npm run dev
```

Starts both processes with output prefixed by workspace:

|     |                                    |
| --- | ---------------------------------- |
| Web | <http://localhost:5173>            |
| API | <http://localhost:3000/api/health> |

To run one side alone:

```bash
npm run dev -w @crema/backend
npm run dev -w @crema/frontend
```

### Verify the setup

```bash
npm run verify
```

Runs format checking, type-aware linting, type checking and the test suite — the
same gates CI applies. Green locally means green in CI.

## 4. Environment variables

Every variable is documented with a comment in [`.env.example`](./.env.example).
They are read through a Zod-validated loader in
[`backend/src/config/env.ts`](./backend/src/config/env.ts), which fails at
startup with a readable message if anything is missing or malformed.

| Variable                   | Required                         | Default                 | Purpose                                   |
| -------------------------- | -------------------------------- | ----------------------- | ----------------------------------------- |
| `PORT`                     | no                               | `3000`                  | Local API port                            |
| `NODE_ENV`                 | no                               | `development`           | Runtime mode                              |
| `CORS_ORIGIN`              | no                               | `http://localhost:5173` | Comma-separated allowed origins           |
| `DATA_SOURCE`              | no                               | `memory`                | `memory` or `postgres`                    |
| `DATABASE_URL`             | only when `DATA_SOURCE=postgres` | —                       | Supabase connection string                |
| `RATE_LIMIT_PER_MINUTE`    | no                               | `120`                   | Per-caller ceiling across the whole API   |
| `TRUST_PROXY`              | no                               | `false`                 | Believe forwarding headers. Vercel only   |
| `GEMINI_API_KEY`           | no                               | —                       | Enables the AI features. Backend only     |
| `GEMINI_MODEL`             | no                               | `gemini-flash-latest`   | Model id, swappable without a code change |
| `AI_RATE_LIMIT_PER_MINUTE` | no                               | `10`                    | Per-IP ceiling on AI requests             |
| `VITE_API_BASE_URL`        | no                               | `http://localhost:3000` | API base for the browser bundle           |

**Two rules this project holds to.** `.env` is never committed — only
`.env.example` is tracked, and CI scans the entire git history with `gitleaks`
on every push. And anything behind Vite's `VITE_` prefix is compiled into the
browser bundle, so it is public by definition; secrets never carry that prefix.

## 5. Optional: enable the AI features

Not required for the app to work, and not required to satisfy any part of the
brief.

1. Create a key at <https://aistudio.google.com/apikey> (Gemini Flash models
   have a free tier).
2. Add it to `.env`:

   ```bash
   GEMINI_API_KEY=your-key-here
   ```

3. Restart. `GET /api/health` reports `ai.enabled: true`.

That enables all three AI surfaces, each shipped end to end — endpoint and UI.

**Quick Log** — `POST /api/ai/quick-log` reads a sentence and returns a brew
proposal:

```bash
curl -X POST http://localhost:3000/api/ai/quick-log \
  -H 'Content-Type: application/json' \
  -d '{"text":"18g of the Ethiopian through the V60, 300 water, blackcurrant, solid 4"}'
```

It answers `200` with `{ brew, inferred }` — a candidate, not a record. Nothing
is written; `POST /api/brews` is still the only route that creates a brew. In
the app this is the sentence box at the top of the Add form: it pre-fills the
controls, marks the fields the model inferred rather than was told, and the user
confirms with Save.

**The Brew Coach** — `POST /api/ai/coach` takes one question about the log and
answers as a stream of server-sent events: text as it is generated, a readable
trace line for every tool the agent used, any brew it proposes, and what the
call cost. The Coach button beside Add opens the panel; the trace — "Read 12 of
12 matching brews (v60), newest first." — is shown to the reader, because an
answer grounded in your own data should say what it looked at. A proposed brew
opens in the Add form for confirmation, through the same door as everything
else.

**Flavour tagging** — `POST /api/ai/flavor-tags` reads a saved brew's tasting
notes and indexes them into a controlled vocabulary of fourteen categories,
stored with `source: 'ai'` and a confidence so a derived tag is never mistaken
for a chosen one. The client requests it after a save succeeds, in its own
request, so a slow model can never make saving feel slow; the tags appear on the
edit dialog.

The rule all three hold to: **the model proposes, the human commits.** Nothing a
model produces is written to the log without a person pressing Save, and the
tags — the one AI write — are an index over words the person already saved.

The AI routes carry their own rate limit (`AI_RATE_LIMIT_PER_MINUTE`, ten per
minute by default) because every request behind them spends money at a third
party. When the app runs on Postgres, those counts live in the database rather
than in process memory, so on serverless every instance draws from one budget
instead of each cold start opening a fresh one.

Without the key, `/api/ai/*` returns `503` with `AI_UNAVAILABLE`, the health
endpoint says so, and the UI hides all three surfaces rather than offering
something that breaks when pressed. That path is tested rather than assumed.

## 6. Connect Supabase — optional locally, required in production

The full schema ships as ordered SQL migrations in `supabase/migrations/`, and
persistence sits behind an interface, so which store runs is a deployment
decision rather than a code path. Local development defaults to the in-memory
adapter; **the deployed app runs on Supabase Postgres**, switched over with the
two variables below and nothing else. See
[PLANNING.md §5](./PLANNING.md#5-database-strategy--migrations-now-connection-later).

Optional is meant literally for local work: clone, install, run, and the app
works with nothing to provision. It does not extend to a deployment. The
in-memory store is per-instance, so on a serverless host every write would be
lost at the next cold start, and the environment loader refuses to boot a
production process on it rather than letting that happen quietly.

To switch over:

1. Create a project at <https://supabase.com>.
2. Apply the migrations with the repository's own runner — the same script CI
   uses, which records what it applied and skips it next time:

   ```bash
   DATABASE_URL=postgresql://... npm run db:apply
   ```

   (`npm run db:reset` applies and then seeds the demo data.)

3. Set both variables in `.env`:

   ```bash
   DATA_SOURCE=postgres
   DATABASE_URL=postgresql://...
   ```

4. Restart. `GET /api/health` reports `dataSource: postgres`.

No application code changes. If `DATA_SOURCE=postgres` is set without a
`DATABASE_URL`, the process refuses to start and says so. New migrations —
`0009_rate_limits.sql` was one — are a re-run of step 2: the ledger applies only
what is new.

## 7. Project layout

```
frontend/            React 19 + Vite single-page app
  src/app/           Shell, providers, router
  src/features/      Feature folders — brews, coach
  src/components/    Reusable UI primitives
  src/lib/           API client, query keys, formatters
  src/hooks/         Shared hooks

backend/             Hono JSON API
  src/app.ts         Route composition, no listener — testable in isolation
  src/server.ts      Entrypoint — locally and as the deployed service
  src/config/        Zod-validated environment
  src/routes/        HTTP layer only
  src/services/      Business rules, framework-agnostic
  src/repositories/  Persistence interface and adapters
  src/db/            Drizzle schema and client
  src/ai/            Agent, tools, prompts, guardrails
  src/middleware/    Errors, request id, rate limiting

shared/              Zod schemas and inferred types, imported by both sides
supabase/migrations/ Ordered SQL — the schema of record
docs/                Brief, architecture notes, decision records
```

Dependencies point inward: routes know about services, services know about
repositories, and nothing points back out. That is what allows the storage
adapter to be swapped without touching a route handler.

## 8. Testing

```bash
npm test                  # everything that needs no external service
npm run test:coverage     # with thresholds enforced
npm test -w @crema/backend
npm test -w @crema/frontend
npm run test:db           # against a real Postgres — see §10 for bringing one up
npm run test:ai           # against the real model — needs a key, costs money
```

| Layer      | Tool                           | What it covers                                                                                  |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Contract   | Vitest                         | Zod schemas — every validation rule the brief requires                                          |
| API        | Vitest + Hono test client      | The full middleware stack and every status code                                                 |
| Components | Vitest + React Testing Library | Behaviour, queried the way a user would                                                         |
| Database   | Vitest + Postgres 17           | Migrations applying, constraints rejecting, Drizzle–SQL drift, RLS, the shared rate-limit store |
| Provider   | Vitest, contract suite         | The fake and the real Gemini adapter held to one behavioural spec                               |
| Journey    | Playwright + axe               | Add, filter, edit, delete, and zero WCAG 2.2 AA violations, against a production build          |

Coverage thresholds: 80% lines, 75% branches. CI fails below either.

## 9. Git workflow

`main` is protected and always deployable. Work happens on short-lived branches
merged by pull request with squash merge and linear history.

Commits follow [Conventional Commits](https://www.conventionalcommits.org),
enforced by `commitlint` on a `commit-msg` hook. `lint-staged` runs ESLint and
Prettier on staged files before each commit.

```
feat(api): add method filter to brew list
fix(web): reset filter when the last matching brew is deleted
chore(repo): pin node to 24 lts
```

Allowed scopes: `repo`, `ci`, `api`, `web`, `shared`, `db`, `ai`, `docs`,
`deps`, `test`.

### Two remotes

The project lives in two places, with the same code in both.

| Remote      | Repository                                                  | Role                                       |
| ----------- | ----------------------------------------------------------- | ------------------------------------------ |
| `origin`    | `Umuzi-classroom/full-stack-developer-bootcamp-TUMO-MOGAME` | Assessment submission. Private.            |
| `portfolio` | `TUMO-MOGAME/crema`                                         | Public. Protected `main`, required checks. |

`main` cannot be protected on the classroom repository because it is owned by
the `Umuzi-classroom` organisation and this account has push access but not
admin. The public mirror is where the branch protection and the enforced PR
workflow actually live.

The two histories carried identical commits until 2026-08-14, when a sync was
merged on the mirror with a rebase and the shared commits were re-minted under
new ids. PLANNING section 11, decision 7 records the choice that followed: the
mirror now tracks content rather than commit identity, and the `git pushall`
alias is retired for `main` — a direct push can no longer fast-forward. A sync
is now a branch cherry-picked onto the mirror's own `main`, checked
tree-identical against the source (`git diff origin/main HEAD` must be empty)
and merged by pull request, which also means every sync passes the mirror's own
nine CI stages on the way in.

## 10. The pipeline

`.github/workflows/ci.yml` runs on every push and pull request. Eight stages run
in parallel; a ninth aggregates them.

| Stage           | What fails it                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint and format | Any ESLint error or Prettier drift                                                                                                                                                                                                     |
| Typecheck       | Any type error in any workspace, plus the root e2e project                                                                                                                                                                             |
| Unit tests      | Contract or web test failure, or web coverage under threshold                                                                                                                                                                          |
| API tests       | Route, middleware or env failure, or coverage under threshold                                                                                                                                                                          |
| Database        | A bad migration filename, duplicate or skipped sequence number, or unterminated statement; migrations failing to apply to a real Postgres 17; the Drizzle schema drifting from the SQL; any constraint not rejecting what it claims to |
| Security        | A high-severity advisory, or any secret found anywhere in git history                                                                                                                                                                  |
| Build           | Build failure, or the gzip bundle exceeding its budget                                                                                                                                                                                 |
| End-to-end      | Any Playwright journey failing against production builds                                                                                                                                                                               |
| **CI**          | Any of the above. This is the single required status check.                                                                                                                                                                            |

Coverage thresholds are 80% lines and 75% branches, enforced per workspace.

The secret scan uses the `gitleaks` binary rather than the marketplace action,
because that action requires a paid licence for organisation-owned repositories.
It scans **full history**, not the diff — a secret committed and later removed
is still a leaked secret.

Dependency installation is a composite action at `.github/actions/setup` rather
than a job of its own, because passing `node_modules` between jobs as an
artifact costs more than restoring the npm cache in each one.

Run everything the pipeline runs, locally:

```bash
npm run verify          # format, lint, typecheck, unit and API tests
npm run test:coverage   # the same tests with thresholds enforced
npm run lint:migrations
npm run build && npm run check:bundle
npm run test:e2e
```

The database stage needs a Postgres to talk to:

```bash
docker run -d --name crema-pg -p 55432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=crema postgres:17-alpine

export DATABASE_URL=postgres://postgres:postgres@localhost:55432/crema
npm run db:reset        # apply every migration, then seed
npm run test:db         # drift guard and constraint assertions
```

`npm run db:apply` applies the migrations without seeding. Neither command
changes how the app runs — it stays on the in-memory adapter until
`DATA_SOURCE=postgres` is set.

## 11. Troubleshooting

**`npm install` fails on the Node version.** `engines` requires Node 24. Check
with `node --version`, then `nvm use`.

**`npm install` fails with `EBADENGINE` on the npm version.** The project
requires npm 11.16 or newer, and `.npmrc` sets `engine-strict=true` so an older
one refuses rather than proceeding. Fix it with:

```bash
npm install -g npm@latest
```

This is enforced rather than suggested because npm 11.6 and npm 11.16 disagree
about whether `yaml` — an optional peer of `lint-staged` and `vite` — belongs in
the lockfile. Installing with the older one silently drops it; `npm ci` on the
newer one then fails with `Missing: yaml@2.9.0 from lock file`. The break shows
up in CI rather than on the machine that caused it, which is the worst place for
it to show up. Erroring at install time makes the mismatch impossible instead of
latent.

**The web app says "Not connected".** The API is not running. Start both with
`npm run dev`, or check <http://localhost:3000/api/health> directly.

**The API exits immediately with "Invalid environment configuration".** That is
the env loader working as intended — it names the variable and the problem. Most
often `DATA_SOURCE=postgres` is set without a `DATABASE_URL`.

**CORS errors in the browser console.** `CORS_ORIGIN` does not include the
origin the frontend is served from. It accepts a comma-separated list.

**The AI features are not visible.** Expected without `GEMINI_API_KEY`. Confirm
with `GET /api/health` — `ai.enabled` will be `false`.

**`npm run verify` fails on formatting.** Run `npm run format`.

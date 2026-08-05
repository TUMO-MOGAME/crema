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

That is the assessment brief. Beyond it, Crema adds two features that use the
log as data rather than as storage: natural-language brew capture, and a coach
agent that answers questions about your brewing using tools over your own
history. Both are optional at runtime and disable themselves cleanly when no AI
key is configured.

The system is a small monorepo: a React single-page app, a standalone JSON API,
and a package of Zod schemas that both import so the API contract exists in
exactly one place.

## 2. Requirements

|          |                                                                   |
| -------- | ----------------------------------------------------------------- |
| Node     | 24 LTS — pinned in `.nvmrc` and enforced by `engines`             |
| npm      | 11 or newer                                                       |
| Database | **Not required.** The app runs on an in-memory adapter by default |
| AI key   | **Not required.** AI features disable themselves when absent      |

The last two are deliberate. Cloning and running should take a minute, with
nothing to provision.

## 3. Setup

```bash
git clone https://github.com/Umuzi-classroom/full-stack-developer-bootcamp-TUMO-MOGAME.git
cd full-stack-developer-bootcamp-TUMO-MOGAME

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

3. Restart. `GET /api/health` reports `ai.enabled: true`, and the Quick Log and
   Brew Coach surfaces appear in the UI.

Without the key, `/api/coach/*` returns `503` with a clear code, the UI hides
those surfaces, and every other feature is unaffected.

## 6. Optional: connect Supabase

The full schema ships as ordered SQL migrations in `supabase/migrations/`. The
running app does not use them yet — it uses the in-memory adapter — because
persistence sits behind an interface. See
[PLANNING.md §5](./PLANNING.md#5-database-strategy--migrations-now-connection-later).

To switch over:

1. Create a project at <https://supabase.com>.
2. Apply the migrations:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```

3. Set both variables in `.env`:

   ```bash
   DATA_SOURCE=postgres
   DATABASE_URL=postgresql://...
   ```

4. Restart. `GET /api/health` reports `dataSource: postgres`.

No application code changes. If `DATA_SOURCE=postgres` is set without a
`DATABASE_URL`, the process refuses to start and says so.

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
  src/server.ts      Local Node entrypoint
  api/index.ts       Vercel Functions entrypoint
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
npm test                  # everything
npm run test:coverage     # with thresholds enforced
npm test -w @crema/backend
npm test -w @crema/frontend
```

| Layer      | Tool                           | What it covers                                         |
| ---------- | ------------------------------ | ------------------------------------------------------ |
| Contract   | Vitest                         | Zod schemas — every validation rule the brief requires |
| API        | Vitest + Hono test client      | The full middleware stack and every status code        |
| Components | Vitest + React Testing Library | Behaviour, queried the way a user would                |
| Journey    | Playwright                     | Add, filter, edit, delete against a production build   |

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

## 10. Troubleshooting

**`npm install` fails on the Node version.** `engines` requires Node 24. Check
with `node --version`, then `nvm use`.

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

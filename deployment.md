# Deployment

> **Status: live.** The app serves from a single origin, backed by Supabase,
> with both AI surfaces enabled. The log at the bottom records every failure on
> the way here and what fixed each — the brief asks for troubleshooting notes,
> and this is the real thing rather than a summary written afterwards. Progress:
> [STATUS.md](./STATUS.md).

## Live URLs

| Environment      | URL                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| Web              | <https://crema-backend-tumo-mogames-projects.vercel.app>            |
| API              | <https://crema-backend-tumo-mogames-projects.vercel.app/api/brews>  |
| API health check | <https://crema-backend-tumo-mogames-projects.vercel.app/api/health> |

The health check is the one to open first: it reports the environment, the
active data source, and whether the AI surfaces are enabled, from the same
objects the requests go to.

## Target setup

One Vercel project running both workspaces as services, configured by the
`vercel.json` at the repository root. The SPA is served at `/` and `/api` is
rewritten to the backend service, so the whole app answers on a single origin.

The plan called for two separate projects, one per workspace. Vercel's Services
preset detects both from this repository and routes between them, and taking it
removes three problems rather than solving them: no cross-origin request to
permit, no second domain to keep in step with a hardcoded CSP, and one URL to
record here instead of two that must agree.

| Service    | Root       | Framework | Serves                                                        |
| ---------- | ---------- | --------- | ------------------------------------------------------------- |
| `frontend` | `frontend` | Vite      | The SPA, at `/`                                               |
| `backend`  | `backend`  | Hono      | The API, at `/api`, from the app `backend/src/app.ts` exports |

The backend entrypoint is `app.ts`, not `server.ts`, and the distinction is
load-bearing: Vercel's Hono runtime imports the file's default export and serves
`app.fetch` itself, so the entry must be the file that exports the app.
`server.ts` — the file that binds a port — is the entrypoint only where a real
process listens, which is local development and the end-to-end suite.

The one project setting that matters is **Root Directory**, and it must be the
repository root — leave the field empty. Services mode only exists inside the
root `vercel.json`; point the project at `frontend/` instead and Vercel never
reads it, silently degrading to a single-workspace Vite build whose scoped
install skips the root devDependencies and never builds `@crema/shared`. That
exact misconfiguration was the first failed deploy in the log below.

The rewrite is a rewrite rather than a redirect, so `/api/health` reaches the
service with its path intact and Hono routes it exactly as it does locally. And
because the browser only ever talks to the origin it was loaded from, there is
no CORS exchange to configure and the tight `connect-src 'self'` in the frontend
service's headers already covers the API without naming a domain.

## Frontend headers and SPA fallback

The frontend's security headers, cache policy and SPA fallback live in the
`frontend` service object of the root `vercel.json`, not in a file of their own.
Vercel reads one `vercel.json`, at the project root; in services mode the
project root is the repository, so a `frontend/vercel.json` is dead
configuration — and the schema rejects `"//"` comment keys inside rules besides,
which is why the reasoning is recorded here instead:

- The API sets its own headers through Hono's `secureHeaders` middleware. The
  service-scoped headers are the other half: the SPA is served straight from the
  CDN, where no application code runs on the way out.
- The CSP is deliberately tight because the app needs almost nothing: no
  third-party scripts, no external fonts, no analytics, no frames. One origin
  serves everything, so `connect-src 'self'` covers the API with no domain
  named.
- `style-src` carries `'unsafe-inline'` and that is not an oversight: the rating
  dial sets its arc colour through an inline `style` attribute, which CSP counts
  as inline styling. A nonce needs a server rendering the document, which a
  static CDN deploy does not have. Inline styles cannot execute; the directive
  that matters for execution is `script-src`, and it allows nothing but this
  origin.
- Hashed `/assets` are cached indefinitely; `/index.html` is never served stale,
  or a new deploy's document would still point at deleted assets.
- The service-scoped rewrite to `/index.html` is what makes a deep link survive
  a hard refresh. Routing into a service is final — an unmatched path inside the
  frontend service returns its 404 rather than falling back to the top-level
  route table, so the fallback has to live inside the service.

Because the root directory is the repository itself, `@crema/shared` resolves
the way it does locally. The package builds to JavaScript through its own
`prepare` script, which the install already runs — it used to export TypeScript
straight from `src`, which every bundler here read happily and Node could not
execute at all.

## Environment variables

Set in the Vercel dashboard only. Nothing sensitive is ever committed.

| Variable                       | Value                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `DATA_SOURCE`                  | `postgres`                                                |
| `DATABASE_URL`                 | secret, the pooled string for the `app_runtime` role      |
| `MIGRATION_DATABASE_URL`       | secret, the owner string. Read only by `db:apply`         |
| `DATABASE_SSL`                 | `require`, or `verify` with a certificate below           |
| `DATABASE_CA_CERT`             | the project CA, PEM. Only needed for `verify`             |
| `TRUST_PROXY`                  | `true` — Vercel overwrites the forwarding header          |
| `GEMINI_API_KEY`               | secret, if the AI features are enabled for the deployment |
| `GEMINI_MODEL`                 | a Gemini Flash model id                                   |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, so the install honours `packageManager: npm@11.16.0` |

`CORS_ORIGIN` and `VITE_API_BASE_URL` are both absent on purpose. One origin
serves everything, so there is no cross-origin request to permit, and the client
defaults to a relative base in a built bundle. Setting either to the deployed
domain is harmless; leaving them unset is one less thing that can disagree with
reality after a rename.

Corepack is not optional here. `.npmrc` sets `engine-strict=true` and `engines`
requires npm 11.16 or newer, so without it the install fails outright with
`EBADENGINE`.

`NODE_ENV` is deliberately not set, and an earlier revision of this table that
said to set it was wrong. Vercel documents that a user-supplied
`NODE_ENV=production` makes the install omit devDependencies — which is where
vite, tsup and typescript live, so the build dies before it starts. The Node
runtime already runs production deployments with `NODE_ENV=production`, which is
what arms the env loader's refusal of the in-memory store; nothing needs the
variable set by hand.

The Supabase project is `gctoggnyblkqffpdzmcc`, and its transaction pooler is
`aws-1-eu-west-1.pooler.supabase.com:6543`. The host is recorded because it is
not a secret and because guessing it is expensive: Supavisor answers a wrong
region, a wrong `aws-N` prefix and a wrong project ref with the identical
message, `tenant/user not found`, so a typo in any of the three looks exactly
like the other two. Copy the string from the dashboard rather than assembling
it. Note also that a password containing `@`, `:`, `/`, `?`, `#`, `[` or `]`
must be percent-encoded, or the URI parser reads the password as part of the
host and the failure appears somewhere unrelated.

`DATA_SOURCE` must be `postgres` here, and the environment loader enforces it
rather than trusting the operator: a production process configured for `memory`
refuses to boot and says why. The store is per-instance, the deploy target is
serverless, and so every write would be lost at the next cold start with nothing
reporting it — a silent data-loss failure is worse than a loud startup one.
Provisioning the Supabase project and applying the migration set is therefore a
prerequisite of the first deploy, not a follow-up to it.

`GEMINI_API_KEY` is read server-side and is never included in a response or in
the browser bundle. Vite compiles anything prefixed `VITE_` into the client
bundle, so no secret is ever given that prefix.

## Database security runbooks

Two procedures and one drill, from PLANNING section 14. The first two are done
once; the third is worth repeating whenever the plan or the schema changes
enough that the last rehearsal no longer describes the system.

### Encrypting the connection

`postgres.js` sends no TLS request unless it is told to, and the Supabase pooler
does not insist, so a connection string alone produced a plaintext link across
the public internet. `DATABASE_SSL` now decides, defaults to `require`, and the
environment loader refuses `disable` in production.

`require` encrypts and accepts whatever certificate is presented, which stops
eavesdropping but not impersonation. To close both:

1. Supabase dashboard → Settings → Database → SSL configuration → download the
   certificate.
2. Add it to Vercel as `DATABASE_CA_CERT`, the whole PEM block including the
   `BEGIN`/`END` lines. Newlines survive the dashboard's multiline field.
3. Set `DATABASE_SSL=verify`.
4. Redeploy. A wrong or missing certificate fails at boot with a message naming
   the variable, rather than on the first query.

Do not verify against Node's own trust store: Supabase signs the pooler with a
private CA, so `rejectUnauthorized` without `DATABASE_CA_CERT` rejects every
connection rather than securing it. That is why the loader refuses `verify`
unless the certificate is present.

A note on measuring it, because the obvious instrument lies. `pg_stat_ssl`
reports the encryption state of the connection _the pooler_ holds to Postgres,
not the one the client holds to the pooler — through port 6543 it reads `false`
whatever the client does, which is a false alarm waiting to happen. The proof
that the client link is encrypted is that it connects at all: `postgres.js`
fails closed when it asks for TLS and the server refuses.

### Switching to the least-privileged role

Migration `0010_app_runtime_role.sql` creates `app_runtime`: DML on the
application's tables, no DDL, no ownership, no RLS bypass, and no `DELETE` on
`brews` because the domain soft-deletes. It is created without a password, so no
credential is written into the repository.

1. Apply the migration with the owner credential:

   ```bash
   MIGRATION_DATABASE_URL='postgresql://postgres.<ref>:<owner-password>@...:6543/postgres' \
     npm run db:apply
   ```

2. Give the role a generated password:

   ```sql
   alter role app_runtime with password '<generated>';
   ```

3. Point the deployment at it. **Through the pooler the username carries the
   project reference**, exactly as the owner's does — `app_runtime.<ref>`, not
   `app_runtime`. Getting this wrong produces "Tenant or user not found", which
   reads like a wrong password:

   ```
   DATABASE_URL=postgresql://app_runtime.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
   ```

4. Keep the owner string in Vercel as `MIGRATION_DATABASE_URL`. Nothing in the
   request path reads it; `db:apply` and `db:reset` do.
5. Redeploy, then confirm the app still serves: `/api/health` reports
   `dataSource: postgres`, and the log lists brews.

The privileges are held in place by `app-runtime-role.db.test.ts`, which asserts
the negatives — the role cannot drop a table, delete a brew, create objects, or
write the reference vocabularies. A boundary nobody asserts is a boundary that
grows back the first time someone debugs a permission error with the owner
credential.

When authentication lands, this is also what makes `0007_rls.sql` load-bearing:
the policies were always correct and always bypassed, because the owner bypasses
them and `app_runtime` does not.

### The backup restore drill

An untested backup is a belief. Supabase takes the backups; what has to be
rehearsed is the restore, because a procedure improvised during an incident is a
second incident.

1. Dashboard → Database → Backups. Note what the current plan retains and for
   how long. Free projects keep daily backups only; point-in-time recovery is a
   paid feature. Write down what you actually have rather than what you assume.
2. Create a scratch project in the same region and restore the most recent
   backup into it.
3. Check the data arrived whole, not merely that the restore reported success:

   ```sql
   select count(*) from brews where deleted_at is null;
   select count(*) from brew_flavor_tags;          -- the join survived
   select max(brewed_at) from brews;               -- the most recent brew is there
   select count(*) from crema_migrations.applied;  -- the ledger came with it
   ```

   Compare each against production. The flavour-tag count is the interesting
   one: it is the only table whose rows exist solely as references to two
   others.

4. Point a local checkout at the restored database with `DATA_SOURCE=postgres`
   and load the log. A backup that satisfies four counts and cannot serve a page
   has not been tested.
5. Delete the scratch project, and record the date and the row counts in the
   deployment log below.

Nothing in this repository has to change for a restore: `npm run db:apply`
rebuilds the schema from the migrations, and the ledger means it applies only
what a restored database is missing.

## Preview deployments

Every pull request produces a preview deployment of both projects, so each PR
carries a live URL a reviewer can open before merging.

## Deployment log

Recorded as it happens, including anything that went wrong and how it was
resolved — the brief asks for troubleshooting notes, and the useful version of
that is a real log rather than a summary written afterwards.

| Date       | Event                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | First deploy failed  | `vite build` could not resolve `vitest/config`. Two causes stacked: the project's Root Directory was `frontend`, so Vercel never read the services config and ran a single-workspace build whose scoped install (168 packages) skips root devDependencies — and `vite.config.ts` imported the test runner, which lives at the root.                                                                                                                                                                                                                                                                        |
| 2026-08-10 | Fixes applied        | Test configuration split into `vitest.config.ts` so the build never touches vitest, and Root Directory cleared to the repository root so the `services` config in `vercel.json` drives the deploy. Redeploy pending.                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-10 | Second deploy failed | `Service "backend" detected framework "hono" in "backend" and must specify an "entrypoint" for runtime "node".` Services mode was live — the failure moved into the backend. The entrypoint named `src/server.ts`, a file that calls `serve()` and exports nothing; Vercel's Hono runtime imports a default-exported app and rejects an entry that does not provide one.                                                                                                                                                                                                                                   |
| 2026-08-10 | Fix applied          | `app.ts` now default-exports the app and the service entrypoint names it, with the framework pinned to `hono`. `server.ts` stays the listening entrypoint for local development and the end-to-end suite. Redeploy pending.                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-12 | Third deploy green   | The five fixes merged to `main` and the production build completed. Services mode detected both workspaces, the backend built from the `app.ts` entrypoint, and Vercel reported the deployment successful.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-13 | URL not yet public   | Every URL the deployment answers on redirects to a Vercel login. Deployment Protection ships enabled ("Standard Protection") and covers the generated `.vercel.app` domains, so a working deploy reads as broken from outside. The fix is Settings → Deployment Protection → Require Log In off — a dashboard toggle, not a code change. Worth recording because the failure looks identical to a routing mistake: a `302` to `vercel.com/sso-api` on `/api/health` says the platform answered, not the app.                                                                                               |
| 2026-08-13 | Every request 500ed  | Protection off, the SPA served — and every `/api` route answered `FUNCTION_INVOCATION_FAILED`. A successful build with an instant runtime crash is the signature of the env loader refusing to boot, and it was: the project's variables dated from 2026-08-10, when the plan still said `DATA_SOURCE=memory` for v1. Production plus the in-memory store is the exact configuration the loader rejects on purpose, because on serverless every write would vanish at the next cold start with nothing saying so. The guard fired three days after it was written, at the first person it was written for. |
| 2026-08-13 | Fixed, verified live | `DATA_SOURCE` edited to `postgres`, and the stale `VITE_API_BASE_URL` and `CORS_ORIGIN` from the two-project plan deleted — the first is baked into the browser bundle at build time and would have pointed the SPA at a retired domain. Redeployed and verified end to end: health reports postgres with AI enabled, the log serves from Supabase, deep links survive a hard refresh, and `POST /api/ai/quick-log` read a sentence through real Gemini and returned a validated proposal.                                                                                                                 |

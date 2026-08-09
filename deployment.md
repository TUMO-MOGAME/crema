# Deployment

> **Status: not yet deployed.** Deployment is Phase 7 of the plan and has not
> been reached. This file describes the target and is updated with live URLs the
> moment the first deploy lands. Progress: [STATUS.md](./STATUS.md).

## Live URLs

| Environment      | URL       | Status  |
| ---------------- | --------- | ------- |
| Web              | _pending_ | Phase 7 |
| API              | _pending_ | Phase 7 |
| API health check | _pending_ | Phase 7 |

## Target setup

Vercel, two projects from this single repository. They are deployed separately
so the static frontend is served from the CDN while the API runs as functions,
and so either can be rolled back without touching the other.

| Vercel project | Root directory | Framework | Output                                     |
| -------------- | -------------- | --------- | ------------------------------------------ |
| `crema-web`    | `frontend`     | Vite      | Static SPA                                 |
| `crema-api`    | `backend`      | Other     | Node functions from `backend/api/index.ts` |

Both projects need **Include files outside the Root Directory in the Build
Step** enabled, so the build can resolve the `@crema/shared` workspace package.
Without it the build fails at module resolution — this is the single most common
way a monorepo deploy breaks on Vercel, and it is verified early in the plan
rather than discovered at the end.

## Environment variables

Set in the Vercel dashboard only. Nothing sensitive is ever committed.

**`crema-api`**

| Variable         | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| `NODE_ENV`       | `production`                                              |
| `CORS_ORIGIN`    | the `crema-web` production domain                         |
| `DATA_SOURCE`    | `postgres`                                                |
| `DATABASE_URL`   | secret, the Supabase pooled connection string             |
| `GEMINI_API_KEY` | secret, if the AI features are enabled for the deployment |
| `GEMINI_MODEL`   | a Gemini Flash model id                                   |

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

**`crema-web`**

| Variable            | Value                             |
| ------------------- | --------------------------------- |
| `VITE_API_BASE_URL` | the `crema-api` production domain |

`GEMINI_API_KEY` is set on the API project only. It is read server-side and is
never included in a response or in the browser bundle. Vite compiles anything
prefixed `VITE_` into the client bundle, so no secret is ever given that prefix.

## Preview deployments

Every pull request produces a preview deployment of both projects, so each PR
carries a live URL a reviewer can open before merging.

## Deployment log

Recorded as it happens, including anything that went wrong and how it was
resolved — the brief asks for troubleshooting notes, and the useful version of
that is a real log rather than a summary written afterwards.

| Date | Event            | Notes   |
| ---- | ---------------- | ------- |
| —    | Not yet deployed | Phase 7 |

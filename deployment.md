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

One Vercel project running both workspaces as services, configured by the
`vercel.json` at the repository root. The SPA is served at `/` and `/api` is
rewritten to the backend service, so the whole app answers on a single origin.

The plan called for two separate projects, one per workspace. Vercel's Services
preset detects both from this repository and routes between them, and taking it
removes three problems rather than solving them: no cross-origin request to
permit, no second domain to keep in step with a hardcoded CSP, and one URL to
record here instead of two that must agree.

| Service    | Root       | Framework | Serves                                           |
| ---------- | ---------- | --------- | ------------------------------------------------ |
| `frontend` | `frontend` | Vite      | The SPA, at `/`                                  |
| `backend`  | `backend`  | Hono      | The API, at `/api`, from `backend/src/server.ts` |

The rewrite is a rewrite rather than a redirect, so `/api/health` reaches the
service with its path intact and Hono routes it exactly as it does locally. And
because the browser only ever talks to the origin it was loaded from, there is
no CORS exchange to configure and the tight `connect-src 'self'` in
`frontend/vercel.json` already covers the API without naming a domain.

Because the root directory is the repository itself, `@crema/shared` resolves
the way it does locally. The package builds to JavaScript through its own
`prepare` script, which the install already runs — it used to export TypeScript
straight from `src`, which every bundler here read happily and Node could not
execute at all.

## Environment variables

Set in the Vercel dashboard only. Nothing sensitive is ever committed.

| Variable                       | Value                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `NODE_ENV`                     | `production`                                              |
| `DATA_SOURCE`                  | `postgres`                                                |
| `DATABASE_URL`                 | secret, the Supabase pooled connection string             |
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

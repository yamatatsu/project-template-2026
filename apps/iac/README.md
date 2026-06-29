# @icasu/iac

AWS CDK (TypeScript) infrastructure for the app. Two stacks:

| Stack               | Resources                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| `Icasu-<Stage>-Db`  | Aurora **DSQL** cluster (serverless, distributed Postgres)              |
| `Icasu-<Stage>-Web` | **Cognito**, **S3 + CloudFront** (static SPA), **API Gateway + Lambda** |

## Architecture

```
                         ┌──────────────────────── CloudFront ───────────────────────┐
   Browser ── HTTPS ──▶  │  default behavior  ─────────────────▶  S3 (private, OAC)   │
                         │    └─ CF Function: SPA fallback → index.html               │
                         │  /api/*            ─────────────────▶  API Gateway (HTTP)  │
                         │    └─ CF Function: strip /api prefix      └─ Lambda (Hono)  │
                         └────────────────────────────────────────────────┬──────────┘
                                                                           │ IAM token
                                                                           ▼
                                                                    Aurora DSQL
```

API and static content share **one origin**: CloudFront forwards `/api/*` to API
Gateway (stripping the `/api` prefix via a CloudFront Function), everything else
to S3. This matches the frontend, whose RPC client already targets `/api` in
production (`apps/frontend/src/shared/api/index.ts`). The Lambda runs the _same_
Hono `app` as local dev (`apps/backend`), so backend code is unchanged.

## Prerequisites

- An AWS account bootstrapped for CDK: `pnpm --filter @icasu/iac exec cdk bootstrap`
- Credentials in the environment (`AWS_PROFILE` / `AWS_REGION` or SSO).
- CDK executes the app with Node's native TS support (`node src/app.ts`, see
  `cdk.json`), the same way the backend runs `.ts` directly — no ts-node required.

## Deploy

```sh
# from the repo root
pnpm cdk:diff                       # preview
pnpm cdk:deploy                     # deploy both stacks (dev)

# build + upload the SPA in one go: the Web stack auto-uploads
# apps/frontend/dist if it exists, and invalidates CloudFront.
pnpm --filter @icasu/frontend build && pnpm cdk:deploy
```

## Configuration

The only runtime input is the `STAGE` environment variable (`dev`, `prod`, or
unset → `dev`). All other values (`region`, `account`, `stackPrefix`) are
constants defined per stage in [`src/config.ts`](src/config.ts) (`devConfig` /
`prodConfig`) — edit them there.

The Cognito JWT authorizer is always attached to `/api/*`.

```sh
STAGE=prod cdk deploy --all
```

## Assumptions made (change if needed)

These were chosen as sensible defaults because the build request couldn't be
clarified interactively:

1. **Region `ap-northeast-1` (Tokyo), single environment.** Multi-region DSQL is
   not set up; the per-stage constants in `src/config.ts` cover basic splits.
2. **HTTP API (API Gateway v2)** over REST API — cheaper, lower latency.
3. **`/api` prefix stripped at CloudFront** (a CloudFront Function), so the
   backend keeps serving root paths (`/tasks`). No `basePath` in Hono.
4. **`/api/*` is always protected by the Cognito JWT authorizer.** Cognito
   (user pool + hosted-UI client + JWT authorizer) is fully provisioned; the
   frontend must send `Authorization: Bearer <jwt>`.
5. **No custom domain / ACM cert** — the default CloudFront domain is used.

## ⚠️ DSQL application-level follow-ups

The **infrastructure** here is deployable as-is, but the existing app schema and
migration flow need DSQL-specific adjustments before the API will work against
DSQL (DSQL is Postgres-compatible but not a drop-in):

- **No `CREATE TYPE ... ENUM`.** `packages/db/src/schema.ts` uses `pgEnum`
  (`task_status`, `task_priority`); convert these to `text` + `CHECK`.
- **No sequences / `SERIAL`.** The `uuid().defaultRandom()` PK is fine.
- **No foreign keys.**
- **One DDL statement per transaction.** Drizzle's node-postgres migrator wraps
  a migration file in a single transaction, which DSQL rejects when the file has
  multiple DDL statements. Run migrations with a DSQL-aware runner (one
  statement per transaction) instead of `drizzle-orm/.../migrator`.

The runtime connection itself (IAM-token auth, SSL) is handled in
`packages/db/src/client.ts` whenever `DSQL_ENDPOINT` is set.

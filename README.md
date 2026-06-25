# project-template-2026

A TypeScript monorepo template: Hono backend on Node.js + React/Vite frontend,
with end-to-end type safety via the Hono RPC client.

## Stack

| Area        | Choice                                              |
| ----------- | --------------------------------------------------- |
| Runtime     | Node.js v24 (native TypeScript type stripping)      |
| Monorepo    | pnpm workspaces (`apps/*`, `packages/*`)            |
| Package mgr | pnpm                                                |
| Backend     | Hono on Node.js (`@hono/node-server`)               |
| Frontend    | React + Vite + Tailwind v4 + shadcn/ui (Base UI)    |
| Data layer  | Hono RPC client + TanStack Query (typed end-to-end) |
| Lint/format | oxlint + oxfmt                                      |
| Tests       | Vitest (both apps)                                  |
| Hooks / CI  | husky + lint-staged · GitHub Actions                |

## Layout

```
apps/
  backend/   Hono API — GET /hello-world, exports AppType for RPC
  frontend/  React app — shows the backend message via TanStack Query
packages/    (reserved for shared packages)
```

## Getting started

The toolchain (Node.js v24 + pnpm v10) is pinned in `mise.toml`. With
[mise](https://mise.jdx.dev) installed, run `mise install` to get both:

```bash
mise install         # installs Node v24 + pnpm v10 from mise.toml
pnpm install
pnpm dev             # runs backend (:3001) and frontend (:5001) together
```

Not using mise? Just ensure Node.js v24+ (see `.node-version`) and pnpm v10 are
on your PATH.

The backend runs `.ts` directly on Node.js via native type stripping — no build
step is needed.

Open http://localhost:5001 — the page fetches `hello world` from the backend
through the typed RPC client. Vite proxies `/api/*` to the backend in dev.

## Scripts (run from the repo root)

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `pnpm dev`          | Start both apps                 |
| `pnpm dev:backend`  | Backend only                    |
| `pnpm dev:frontend` | Frontend only                   |
| `pnpm build`        | Build both apps                 |
| `pnpm test`         | Run all tests                   |
| `pnpm typecheck`    | Type-check all workspaces       |
| `pnpm lint`         | oxlint                          |
| `pnpm format`       | oxfmt (write)                   |
| `pnpm format:check` | oxfmt (check only — used in CI) |

## Type-safe API calls

The backend exports its app type:

```ts
// apps/backend/src/app.ts
export type AppType = typeof app;
```

The frontend consumes it through the Hono RPC client (`apps/frontend/src/lib/api.ts`),
so routes and responses are fully typed with autocomplete.

## Adding shadcn components

```bash
cd apps/frontend
pnpm dlx shadcn@latest add <component>
```

Components use **Base UI** primitives (configured in `components.json`).

# Framework Integration

How to set up FSD within Vite + React, including directory placement,
routing integration with TanStack Router, and path alias configuration.

## General Principle

Place FSD layers inside `src/` to avoid naming conflicts with framework
directories. The FSD `app/` and `pages/` layers are conceptual layers, not
framework routing directories that happen to share the same names.

This project uses a single `@/*` path alias that maps to `src/*`, so imports
reference the layer path directly (`@/pages/home`, `@/shared/ui`,
`@/entities/user`). Configure the same alias in both `tsconfig.json` and the
Vite resolver so TypeScript and the bundler agree.

## Vite + React

### Directory structure

```text
my-vite-project/
  src/
    app/                   ← FSD app layer
      providers/
      router.tsx           ← Router definition (see TanStack Router below)
      styles/
      main.tsx             ← Entry point
    pages/
    shared/
  index.html
  vite.config.ts
  tsconfig.json
```

### Path aliases

Use a single `@/*` alias that maps to `src/*`. Configure it in
`tsconfig.json` and mirror it in `vite.config.ts` so the Vite resolver
agrees with TypeScript:

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

```typescript
// vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

Imports then reference the layer path directly: `@/pages/home`,
`@/shared/ui`, `@/entities/user`.

## TanStack Router

TanStack Router wires the application's routes. Place the router definition
in the FSD `app/` layer and point each route at a page's public API.

### Where things go

- **Router definition** lives in `app/` (for example `app/router.tsx`). Each
  route's component is imported from a page's public API (`@/pages/*`).
- **Prefer code-based routing.** Defining routes in code keeps a generated
  `routeTree` file from polluting `src/` and keeps routing under the `app/`
  layer where it belongs.
- **Route shell** (header, side navigation, and other layout chrome) goes on
  the app's root route, or in `widgets/` when the shell is a reusable
  composite block.
- **Keep route files thin.** Route definitions are wiring only; business
  logic, data fetching, and page UI live in the FSD `pages/` layer. Route
  files remain thin wrappers that import and render page components.

### Directory structure

```text
src/
  app/
    router.tsx             ← createRouter + route tree (code-based)
    providers/
    main.tsx               ← Entry point: wires <RouterProvider />
  pages/
    home/
      ui/HomePage.tsx
      index.ts             ← export { HomePage } from './ui/HomePage'
    profile/
      ui/ProfilePage.tsx
      index.ts
  widgets/
    app-shell/             ← Optional: header/side-nav layout chrome
      ui/AppShell.tsx
      index.ts
  shared/
```

### Code-based route definition (minimal example)

```typescript
// src/app/router.tsx
import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/react-router";
import { HomePage } from "@/pages/home";
import { ProfilePage } from "@/pages/profile";

// Root route: the app shell (layout chrome) renders around <Outlet />.
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/$id",
  component: ProfilePage,
});

const routeTree = rootRoute.addChildren([homeRoute, profileRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

```tsx
// src/app/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

The page components (`HomePage`, `ProfilePage`) come from `@/pages/*` public
APIs. The route files in `app/` stay thin: they map paths to page components
and own no business logic.

## Key Reminders

1. **FSD lives in `src/`**: the FSD `app/` and `pages/` layers are
   architectural layers, not bundler routing folders.
2. **Route files are thin wrappers**: they import and render FSD page
   components. Business logic stays in FSD pages.
3. **Path aliases are required**: configure the single `@/*` → `src/*` alias
   in both `vite.config.ts` and `tsconfig.json`.
4. **Pages First still applies**: start with code in FSD `pages/` and extract
   only when needed.

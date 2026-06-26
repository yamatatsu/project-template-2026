import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

// ルート定義は file-based routing（flat routes）。実体は app/routes/*.tsx で、
// tanstackRouter プラグインが routeTree.gen.ts を生成する（vite.config.ts 参照）。
// ここは生成された routeTree を createRouter に束ねるだけの薄い層。
export const router = createRouter({ routeTree });

// routeTree も re-export し、テスト（router.test.tsx / __tests__/render-route.tsx）が
// 生成物のパスに直接依存しないようにする。
export { routeTree };

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

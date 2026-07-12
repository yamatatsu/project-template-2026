# CLAUDE.md — apps/frontend

フロントエンド（React + Vite + Tailwind v4 + shadcn/ui）で作業する際のルール。

## アーキテクチャ: Feature-Sliced Design (FSD v2.1)

`src` は **FSD v2.1** に従う。コードの置き場所・public API・import 境界を判断するときは
`feature-sliced-design` skill（`.claude/skills/feature-sliced-design/`）を参照すること。

### レイヤー（上位 → 下位）

```
app/        # エントリ・providers・ルーティング・ルートレイアウト（main.tsx, router.tsx, routes/, routeTree.gen.ts, app-layout.tsx, styles/）
pages/      # ルート単位の画面（例: pages/tasks, pages/users）
widgets/    # 複数 feature/entity を束ねる大きな UI ブロック（例: app-header, app-sidebar）
features/   # ユーザー操作・ユースケース
entities/   # ビジネスエンティティ
shared/     # 横断的に再利用する基盤（ui/ lib/ api/ など、ビジネス非依存）
```

### ルーティング（TanStack Router / file-based routing）

ルーティングは **app レイヤーの責務**。**file-based routing（flat routes）** を採用する。ルートが増えても 1 ファイルが肥大化せず破綻しにくい。

**配置（FSDでどこに書くか）**

- ルート定義ファイルは `app/routes/*.tsx`。トップレベルに `src/routes/`（FSD 非レイヤー）は**作らない**。`tanstackRouter` プラグインで `routesDirectory` と `generatedRouteTree` を `app/` 配下に向ける（`vite.config.ts`）。
- 生成物 `app/routeTree.gen.ts` は手で触らない。コミットはするが oxlint/oxfmt/steiger の対象外（各設定で除外済み。`tsc` 単独の typecheck/CI を壊さないため commit する）。
- `app/router.tsx` は生成 `routeTree` を `createRouter` に束ねるだけの薄い層（テスト互換のため `routeTree` を re-export）。
- レイアウトシェル（providers + ヘッダー/サイドナビ）はルートルート `app/routes/__root.tsx` → `app/app-layout.tsx`（`@/widgets/*` を合成）。

**ルートファイルは薄く保つ**。`createFileRoute(...)` で `component` に `@/pages/*` の public API を渡すだけ。データ取得・画面ロジックは pages に置く。

**flat routes 命名規約**（`.` 区切りでパスを表現。子を持つ葉は `*.index.tsx`、`tasks.tsx` のような中間レイアウトは作らない）

| URL                   | ファイル                         | route id                      |
| --------------------- | -------------------------------- | ----------------------------- |
| `/`                   | `routes/index.tsx`               | `/`（→ `/tasks` へ redirect） |
| `/tasks`              | `routes/tasks.index.tsx`         | `/tasks/`                     |
| `/tasks/new`          | `routes/tasks.new.tsx`           | `/tasks/new`                  |
| `/tasks/$taskId`      | `routes/tasks.$taskId.index.tsx` | `/tasks/$taskId/`             |
| `/tasks/$taskId/edit` | `routes/tasks.$taskId.edit.tsx`  | `/tasks/$taskId/edit`         |
| `/users`              | `routes/users.tsx`               | `/users`                      |

**ルート追加の手順**: ① `app/routes/` に薄いルートファイルを足す → ② 画面実体は `@/pages/*` に作り public API を import → ③ `pnpm dev`（または `pnpm build`）で `routeTree.gen.ts` が再生成される。

**path params は route ファイルで取り出し、pages には prop で渡す**。pages（下位レイヤー）が
`useParams({ from: '<route id>' })` で自分の route id を知るのは、app 層（ルーティング）への
依存の逆流であり、そのページを別 path で再利用できなくする。route ファイル（app 層）側で
`Route.useParams()`（`Route` に紐づくので `from` 文字列が不要・型安全）から取り出し、page には
値を prop で注入する。

```tsx
// app/routes/tasks.$taskId.index.tsx（app 層 — ここだけが path を知る）
export const Route = createFileRoute('/tasks/$taskId/')({ component: RouteComponent });

function RouteComponent() {
  const { taskId } = Route.useParams();
  return <TaskDetailPage taskId={taskId} />;
}
```

```tsx
// pages/task-detail/ui/task-detail-page.tsx（下位 — path を知らず、prop 駆動）
export function TaskDetailPage({ taskId }: { taskId: string }) {
  /* ... */
}
```

### ルール

- **import は下位レイヤー方向のみ**（例: `pages` → `features`/`entities`/`shared`。逆流禁止）。違反は `pnpm steiger` が検出する。
- **slice は public API 経由で import する**。slice 直下の `index.ts` で公開し、`@/pages/home` のように index から import する（深い相対 import を slice 外から行わない）。
- `shared` はセグメント単位（`@/shared/ui/button`, `@/shared/lib/utils`, `@/shared/api`）で import する（`steiger.config.mjs` で `shared` の public-api ルールは緩和済み）。
- パスエイリアスは `@/*` → `src/*`（`tsconfig.json` / `vite.config.ts`）。
- shadcn コンポーネントは `src/shared/ui/` に置く（`components.json` の alias 設定済み。`shadcn add` の出力先も `shared/ui`）。追加は `pnpm dlx shadcn@latest add <component>`。プリミティブは **Base UI** を使う（`components.json` で設定済み）。
- 「まず単純に、必要になってから抽出する」。entities 層を最初から無理に作らない。判断は skill の reference を参照。

## バックエンド連携（型とフォーム検証）

バックエンドへの依存は **`AppType`（Hono RPC 型）一本**に集約する。backend の内部モジュール
（zod 検証スキーマなど）を **runtime import しない**（`@icasu/backend/schema` のような参照は禁止。
drizzle/DB 層まで越境して bundle に漏れる）。

- **ペイロード/レスポンスの型は RPC から取り出す**。`InferResponseType` / `InferRequestType`
  を使い、`shared/api` の `client` から導出する。型は entities または利用スライス側に置く。

  ```ts
  import type { InferRequestType, InferResponseType } from 'hono/client';
  type Task = InferResponseType<typeof client.tasks.$get, 200>[number];
  type CreateTaskInput = InferRequestType<typeof client.tasks.$post>['json'];
  ```

- **クライアント側のフォーム検証は、各フォームが自前の検証スキーマを持つ**。backend の
  検証スキーマを共有・import しない。理由: サーバ検証（信頼できない入力の門番）とフォーム検証
  （送信前の即時 UX）は目的が別で、`datetime-local` 変換・空文字→null・`defaultValues` など
  フォーム固有の関心はどのみちフロントにしか無い。ペイロード形状のサーバ一致は上記 RPC 型が担保し、
  サーバは受信時に必ず独立に再検証する（フロント検証は信頼の根拠にしない）。
- 置き場所: フォーム検証スキーマはそのスライスの `model/` に置く（例:
  `features/task-form/model/schema.ts`）。UI からは相対 import で使う。

## アーキテクチャ検査（steiger）

`steiger`（`@feature-sliced/steiger-plugin`）が FSD 違反を検出する。設定は `steiger.config.mjs`。
pre-commit と CI で実行される（ルートから `pnpm steiger`）。開発中の常駐監視は `pnpm run steiger:watch`。

## コマンド（このパッケージ内から）

| 目的                | コマンド                              |
| ------------------- | ------------------------------------- |
| 開発サーバ          | `pnpm dev`                            |
| ビルド / プレビュー | `pnpm build` / `pnpm preview`         |
| 型チェック / テスト | `pnpm typecheck` / `pnpm test`        |
| FSD 検査 / 常駐監視 | `pnpm steiger` / `pnpm steiger:watch` |

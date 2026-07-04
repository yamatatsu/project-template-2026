# project-template-2026

TypeScript モノレポのテンプレート。Node.js 上の Hono バックエンドと React/Vite フロントエンドを、
Hono RPC クライアントによるエンドツーエンドの型安全性でつなぐ。

## 技術スタック

| 領域           | 採用技術                                                           |
| -------------- | ------------------------------------------------------------------ |
| ランタイム     | Node.js v24（ネイティブの TypeScript 型ストリッピング）            |
| モノレポ       | pnpm workspaces（`apps/*`, `packages/*`）                          |
| パッケージ管理 | pnpm                                                               |
| バックエンド   | Hono on Node.js（`@hono/node-server`）                             |
| フロントエンド | React + Vite + Tailwind v4 + shadcn/ui（Base UI）                  |
| データ層       | Hono RPC クライアント + TanStack Query（エンドツーエンドで型付け） |
| Lint/format    | oxlint + oxfmt                                                     |
| テスト         | Vitest（両アプリ）                                                 |
| Hooks / CI     | husky + lint-staged · GitHub Actions                               |

## 構成

```
apps/
  backend/   Hono API — GET /hello-world を提供し、RPC 用に AppType を公開
  frontend/  React アプリ — TanStack Query 経由でバックエンドのメッセージを表示
packages/    （共有パッケージ用に予約）
```

## はじめ方

ツールチェーン（Node.js v24 + pnpm v10）は `mise.toml` に固定してある。
[mise](https://mise.jdx.dev) をインストール済みなら、`mise install` で両方が入る:

```bash
mise install         # mise.toml から Node v24 + pnpm v10 をインストール
pnpm install
pnpm dev             # バックエンド (:3001) とフロントエンド (:5001) を同時起動
```

mise を使わない場合は、Node.js v24 以上（`.node-version` を参照）と pnpm v10 が
PATH にあることを確認すればよい。

バックエンドはネイティブの型ストリッピングにより `.ts` を Node.js で直接実行する —
ビルドステップは不要。

http://localhost:5001 を開くと、型付き RPC クライアント経由でバックエンドから
`hello world` を取得して表示する。開発時は Vite が `/api/*` をバックエンドへプロキシする。

## スクリプト（リポジトリルートから実行）

| コマンド            | 説明                              |
| ------------------- | --------------------------------- |
| `pnpm dev`          | 両アプリを起動                    |
| `pnpm dev:backend`  | バックエンドのみ                  |
| `pnpm dev:frontend` | フロントエンドのみ                |
| `pnpm build`        | 両アプリをビルド                  |
| `pnpm test`         | 全テストを実行                    |
| `pnpm typecheck`    | 全ワークスペースを型チェック      |
| `pnpm lint`         | oxlint                            |
| `pnpm format`       | oxfmt（書き込み）                 |
| `pnpm format:check` | oxfmt（チェックのみ — CI で使用） |

## 型安全な API 呼び出し

バックエンドはアプリの型を公開する:

```ts
// apps/backend/src/app.ts
export type AppType = typeof app;
```

フロントエンドはこれを Hono RPC クライアント（`apps/frontend/src/lib/api.ts`）経由で
取り込むため、ルートとレスポンスが完全に型付けされ、補完も効く。

## shadcn コンポーネントの追加

```bash
cd apps/frontend
pnpm dlx shadcn@latest add <component>
```

コンポーネントは **Base UI** プリミティブを使う（`components.json` で設定済み）。

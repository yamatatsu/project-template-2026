# CLAUDE.md

このリポジトリで作業する際のガイダンス。

## 概要

pnpm workspaces のモノレポ。`apps/backend`（Hono on Node.js v24）と `apps/frontend`（React + Vite + Tailwind v4 + shadcn/ui）。Hono RPC + TanStack Query でエンドツーエンド型安全。Lint/format は oxlint + oxfmt、テストは Vitest。

## よく使うコマンド（リポジトリルートから）

| 目的                      | コマンド                                 |
| ------------------------- | ---------------------------------------- |
| 開発サーバ（両app並列）   | `pnpm dev`                               |
| フロントのみ / バックのみ | `pnpm dev:frontend` / `pnpm dev:backend` |
| Lint / フォーマット確認   | `pnpm lint` / `pnpm format:check`        |
| 型チェック / テスト       | `pnpm typecheck` / `pnpm test`           |
| FSD アーキテクチャ検査    | `pnpm steiger`                           |

## パッケージ別ルール

- **フロントエンド（`apps/frontend`）**: Feature-Sliced Design (FSD v2.1) に従う。詳細は
  [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md)（frontend 内で作業すると自動で読み込まれる）。
- **インフラ（`apps/iac`）**: AWS CDK (TypeScript)。設定は環境変数 `STAGE` のみ・CDK context 不使用、
  `CfnOutput` 不使用など規約は [`apps/iac/CLAUDE.md`](apps/iac/CLAUDE.md)（iac 内で作業すると自動で読み込まれる）。

## コミットの方針

- `git commit --no-verify`（および `-n`）は**使用禁止**。pre-commit / commit-msg などの
  フックは必ず通すこと。フックが失敗する場合はバイパスせず、原因を直してから再コミットする。

## ツール導入の方針

パッケージ固有のツール（依存・設定・スクリプト）は、そのワークスペースパッケージ内に閉じる
（例: steiger は `apps/frontend`）。ルートには `pnpm --filter <pkg> run <script>` への薄い委譲スクリプトのみ置く。
横断的な lint/format（oxlint/oxfmt）は意図的にルートに集約している。

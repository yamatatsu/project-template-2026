# CLAUDE.md

このリポジトリで作業する際のガイダンス。

## 概要

pnpm workspaces のモノレポ。`apps/backend`（Hono on Node.js v24）と `apps/frontend`（React + Vite + Tailwind v4 + shadcn/ui）。Hono RPC + TanStack Query でエンドツーエンド型安全。Lint/format は oxlint + oxfmt、テストは Vitest。

## よく使うコマンド（リポジトリルートから）

| 目的                      | コマンド                                     |
| ------------------------- | -------------------------------------------- |
| 開発サーバ（両app並列）   | `pnpm dev`                                   |
| フロントのみ / バックのみ | `pnpm dev:frontend` / `pnpm dev:backend`     |
| Lint / フォーマット確認   | `pnpm lint` / `pnpm format:check`            |
| 型チェック / テスト       | `pnpm typecheck` / `pnpm test`               |
| FSD アーキテクチャ検査    | `pnpm steiger`                               |
| ローカル基盤の起動        | `pnpm local:up`（DB + DynamoDB + OIDC mock） |

## ローカル開発（BFF 認証）

認証は OAuth BFF パターン（バックエンドが OAuth クライアントとしてトークンを保持し、ブラウザは
HttpOnly セッション Cookie のみを持つ）。ローカルは実 Cognito の代わりに docker-compose の
エミュレータ（DynamoDB Local + mock-oauth2-server）を使うため AWS 認証情報は不要。

1. `pnpm local:up` — Postgres + DynamoDB Local + OIDC mock を起動し、セッションテーブルを作成。
2. `apps/backend/.env` を用意（`apps/backend/.env.example` をコピー。OIDC/Cookie/DynamoDB の
   ローカル既定値入り）。
3. `pnpm dev` — フロント（:5001）とバック（:3001 = BFF）を並列起動。
4. http://localhost:5001 へアクセス → 未認証なら mock のログイン画面へ。任意のユーザー名で
   ログインすると SPA に戻る。

本番は実 Cognito（Hosted UI）を使い、同じ BFF コードが環境変数で切り替わる（詳細は `apps/iac`）。

## パッケージ別ルール

- **フロントエンド（`apps/frontend`）**: Feature-Sliced Design (FSD v2.1) に従う。詳細は
  [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md)（frontend 内で作業すると自動で読み込まれる）。
- **インフラ（`apps/iac`）**: AWS CDK (TypeScript)。設定は環境変数 `STAGE` のみ・CDK context 不使用、
  `CfnOutput` 不使用など規約は [`apps/iac/CLAUDE.md`](apps/iac/CLAUDE.md)（iac 内で作業すると自動で読み込まれる）。

## コミットの方針

- 作業は原則 `main` ブランチに直接コミットする（トピックブランチや PR は基本使わない）。
- `git commit --no-verify`（および `-n`）は**使用禁止**。pre-commit / commit-msg などの
  フックは必ず通すこと。フックが失敗する場合はバイパスせず、原因を直してから再コミットする。

## ツール導入の方針

パッケージ固有のツール（依存・設定・スクリプト）は、そのワークスペースパッケージ内に閉じる
（例: steiger は `apps/frontend`）。ルートには `pnpm --filter <pkg> run <script>` への薄い委譲スクリプトのみ置く。
横断的な lint/format（oxlint/oxfmt）は意図的にルートに集約している。

## docker-compose のコンテナ設定ファイル

`docker-compose.yml`（ルート）から volume マウントするコンテナの設定ファイルは、ルート直下の
`docker/<service>/` に置く（例: mock-oauth2-server の設定は `docker/mock-oauth2-server/config.json`）。
アプリのソース（`apps/*`）には置かない。1 サービスが複数ファイルを持っても破綻しないよう、
サービス名でディレクトリを分ける。

# CLAUDE.md

このリポジトリで作業する際のガイダンス。

## 概要

pnpm workspaces のモノレポ。`apps/backend`（Hono on Node.js v24）と `apps/frontend`（React + Vite + Tailwind v4 + shadcn/ui）。Hono RPC + TanStack Query でエンドツーエンド型安全。Lint/format は oxlint + oxfmt、テストは Vitest。

## モノレポ構成

`pnpm-workspace.yaml` の対象は `apps/*` と `packages/*` の2系統。デプロイ単位（実行可能な
アプリ）を `apps/`、それらから `workspace:*` で参照される内部ライブラリを `packages/` に置く。
内部パッケージは `@icasu/*` で名前空間を切り、ビルド無しの TS ソースを `exports` で直接公開する
（`tsconfig.base.json` の `allowImportingTsExtensions` 前提）。

| パッケージ                                         | 役割                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/frontend`                                    | React SPA（Feature-Sliced Design）。バックの `AppType` を Hono RPC で型として取り込む。                                           |
| `apps/backend`                                     | Hono の BFF。`createApp(config)` が合成点で、`@icasu/backend-auth` を `/auth` にマウントし `tasks` API を提供。Node / Lambda。    |
| `apps/iac`                                         | AWS CDK（TypeScript）。フロント配信・API・Cognito・セッションテーブル等のインフラ。                                               |
| `packages/db`（`@icasu/db`）                       | Drizzle のスキーマ / DB クライアント（`./schema`・`./client`・`./migrations`）。                                                  |
| `packages/backend-auth`（`@icasu/backend-auth`）   | BFF 認証（OIDC 認可コード + PKCE）。設定注入の `createAuth(config)` と `loadAuthConfigFromEnv` を公開し、認証機能のテストも同梱。 |
| `packages/simple-result`（`@icasu/simple-result`） | 失敗を throw せず値で返すための最小 `Result<T, E>`（`ok` / `err`）。全パッケージ共有の実体。                                      |

依存の向き: `apps/*` → `packages/*` の一方向のみ（`packages` から `apps` は参照しない）。
各パッケージ固有の規約はそのパッケージの `CLAUDE.md` に書く（後述の「ドキュメントの置き場所」）。

## よく使うコマンド（リポジトリルートから）

| 目的                      | コマンド                                     |
| ------------------------- | -------------------------------------------- |
| 開発サーバ（両app並列）   | `pnpm dev`                                   |
| フロントのみ / バックのみ | `pnpm dev:frontend` / `pnpm dev:backend`     |
| Lint / フォーマット確認   | `pnpm lint` / `pnpm format:check`            |
| 型チェック / テスト       | `pnpm typecheck` / `pnpm test`               |
| FSD アーキテクチャ検査    | `pnpm steiger`                               |
| ローカル基盤の起動        | `pnpm local:up`（DB + DynamoDB + OIDC mock） |

## ローカル開発

ローカルは docker-compose のエミュレータ（Postgres + DynamoDB Local + mock-oauth2-server）を
使うため AWS 認証情報は不要。

1. `pnpm local:up` — Postgres + DynamoDB Local + OIDC mock を起動し、セッションテーブルを作成。
2. `apps/backend/.env` を用意（`apps/backend/.env.example` をコピー。OIDC/Cookie/DynamoDB の
   ローカル既定値入り）。
3. `pnpm dev` — フロント（:5001）とバック（:3001 = BFF）を並列起動。
4. http://localhost:5001 へアクセス → 未認証なら mock のログイン画面へ。任意のユーザー名で
   ログインすると SPA に戻る。

認証（OAuth BFF パターン）の仕組み・設計・本番 Cognito との切り替えは
[`packages/backend-auth/CLAUDE.md`](packages/backend-auth/CLAUDE.md) を参照。

## ドキュメントの言語

- **コメント・ドキュメントは日本語で書く**（コード内コメント、`CLAUDE.md` / `README` などの
  Markdown、`.env.example` の説明、コミットメッセージ等）。コード上の識別子や技術用語・コマンドは
  原語のままでよい。

## コードコメントの方針

- コメントには **why（なぜそうするのか）と非自明な前提**を書く。コードを読めば分かる
  **what（何をしているか）や how（どうやっているか）は書かない**。
- 具体的には、選択の理由・トレードオフ、外部仕様や制約（RFC・プロバイダの挙動・ブラウザ仕様
  など）、一見不要／不自然に見えるコードが必要な事情、ハマりどころや将来の落とし穴を残す。
- コメントで補うより、まず名前と構造で意図が伝わるコードにする。コメントが what の言い換えに
  なっているなら、コメントではなくコードを直す。

## ドキュメントの置き場所

- **プロジェクト全体に効くルール**（モノレポ構成・共通コマンド・ローカル開発・コミット/ツール
  導入の方針など）はこのルート `CLAUDE.md` に書く。
- **特定のローカルパッケージにしか効かないルール**は、そのパッケージ直下の `CLAUDE.md` に書く
  （そのディレクトリ内で作業すると自動で読み込まれる）。ルート `CLAUDE.md` にはパッケージ固有の
  詳細を持ち込まず、必要ならリンクで参照する。

パッケージ別 `CLAUDE.md`:

- **バックエンド（`apps/backend`）**: Hono の BFF。合成点・公開面（`AppType` 一本）・入力検証の
  方針は [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md)。
- **フロントエンド（`apps/frontend`）**: Feature-Sliced Design (FSD v2.1) に従う。詳細は
  [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md)。
- **インフラ（`apps/iac`）**: AWS CDK (TypeScript)。設定は環境変数 `STAGE` のみ・CDK context 不使用、
  `CfnOutput` 不使用など規約は [`apps/iac/CLAUDE.md`](apps/iac/CLAUDE.md)。
- **BFF 認証（`packages/backend-auth`）**: OIDC 認可コード + PKCE の Hono app。設計・公開 API・
  テスト方針は [`packages/backend-auth/CLAUDE.md`](packages/backend-auth/CLAUDE.md)。

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

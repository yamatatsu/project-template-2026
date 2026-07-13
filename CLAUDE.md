# CLAUDE.md

このリポジトリで作業する際のガイダンス。

## 概要

pnpm workspaces のモノレポ。Hono RPC + TanStack Query でエンドツーエンド型安全。Lint/format は
oxlint + oxfmt、テストは Vitest。

セットアップ・ローカル起動・ログイン手順は [`README.md`](README.md)（「はじめ方」）。**ここには
書かない**。

## モノレポ構成

`pnpm-workspace.yaml` の対象は `apps/*` と `packages/*`。デプロイ単位（実行可能なアプリ）を `apps/`、
それらから `workspace:*` で参照される内部ライブラリを `packages/` に置く。**依存は `apps/*` →
`packages/*` の一方向のみ**（`packages` から `apps` は参照しない）。

内部パッケージは `@icasu/*` で名前空間を切り、**ビルド無しの TS ソースを `exports` で直接公開する**
（`tsconfig.base.json` の `allowImportingTsExtensions` 前提）。

パッケージ固有の規約は**そのパッケージの `CLAUDE.md` に書く**（ルートに持ち込まない）。新しい
パッケージに `CLAUDE.md` を足したらこの表にも追記する。

| パッケージ             | 役割と、そのパッケージ固有の規約                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend`         | Hono の BFF（Node / Lambda）。合成点・`AppType` 一本の公開面・入力検証・認可 → [`CLAUDE.md`](apps/backend/CLAUDE.md)                                           |
| `apps/frontend`        | React SPA。Feature-Sliced Design (FSD v2.1)。backend の `AppType` を Hono RPC で型として取り込む → [`CLAUDE.md`](apps/frontend/CLAUDE.md)                      |
| `apps/iac`             | AWS CDK。設定は環境変数 `STAGE` のみ・CDK context 不使用・`CfnOutput` 不使用 → [`CLAUDE.md`](apps/iac/CLAUDE.md)                                               |
| `@icasu/db`            | Drizzle のスキーマ / DB クライアント。DSQL 互換のスキーマルール（`pgEnum`/FK/連番 PK 不可）・マイグレーション適用フロー → [`CLAUDE.md`](packages/db/CLAUDE.md) |
| `@icasu/backend-auth`  | BFF 認証（OIDC 認可コード + PKCE）の Hono app。`createAuth(config)` / `loadAuthConfigFromEnv` を公開 → [`CLAUDE.md`](packages/backend-auth/CLAUDE.md)          |
| `@icasu/logger`        | 構造化ログと監査ログ（AWS Lambda Powertools Logger のラッパ） → [`CLAUDE.md`](packages/logger/CLAUDE.md)                                                       |
| `@icasu/simple-result` | 失敗を throw せず値で返すための最小 `Result<T, E>`（`ok` / `err`）                                                                                             |

## 変更したら通すもの（リポジトリルートから）

コミット前に通す。`pnpm test` / `pnpm typecheck` はルートから全パッケージを再帰実行する（パッケージに
`cd` して個別に回す必要はない）。

| 目的                    | コマンド                                |
| ----------------------- | --------------------------------------- |
| Lint / フォーマット確認 | `pnpm lint` / `pnpm format:check`       |
| 型チェック / テスト     | `pnpm typecheck` / `pnpm test`          |
| FSD アーキテクチャ検査  | `pnpm steiger`（frontend を触ったとき） |

その他のスクリプト（`dev` / `db:*` / `cdk:*` / `local:up`）は [`README.md`](README.md)「スクリプト」。

## ドキュメントの言語

**コメント・ドキュメントは日本語で書く**（コード内コメント、`CLAUDE.md` / `README` などの Markdown、
`.env.example` の説明、コミットメッセージ等）。コード上の識別子や技術用語・コマンドは原語のままでよい。

## コードコメントの方針

- コメントには **why（なぜそうするのか）と非自明な前提**を書く。**what / how は書かない**（コードを
  読めば分かる）。
- 具体的には、選択の理由・トレードオフ、外部仕様や制約（RFC・プロバイダの挙動・ブラウザ仕様）、一見
  不要／不自然に見えるコードが必要な事情、ハマりどころを残す。
- コメントが what の言い換えになっているなら、**コメントではなくコードを直す**（名前と構造で意図を
  伝える）。
- **設計判断・アーキテクチャの根拠はコードに書かない**。`CLAUDE.md` か `docs/specs/` に集約し、コードには
  局所の why だけ残す（両方に書くと drift する）。
- **経緯を書かない**（「かつて〜だった」「〜を撤去したため」）。現在のコードの状態と理由だけを書く。
- **依存方向に逆らう知識を書かない**。下位レイヤ（`entities` などドメイン）のコメントに、上位（wire /
  routes / repo / DB）がそれをどう使うかの知識を持たせない（例: enum の値配列に「wire も DB もここから
  派生させる」と書かない——それは派生させる側の関心）。

## コードの並び順（stepdown）

ファイル内の関数・定義は**上から下へ抽象度が下がる**ように並べる。**呼ぶ側を呼ばれる側より上に置く**
（公開エントリ／オーケストレーション関数が先、そこから呼ばれるヘルパが後）。意図だけ掴みたい人が
ファイル上部だけ読めば済むようにするため。「定義を使う前に書く」ためだけの機械的な bottom-up 順にしない。

## ドキュメントの置き場所

`CLAUDE.md` は毎セッション全文がコンテキストに載る。何でもここに足すと肥大化して**指示が効かなくなる**
ので、1 ファイル **200 行未満**を守る。

| 内容                                                           | 置き場所                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| プロジェクト全体の恒久ルール（構成・共通コマンド・コミット等） | ルート `CLAUDE.md`                                            |
| 特定パッケージにしか効かないルール                             | そのパッケージ直下の `CLAUDE.md`（上表）                      |
| 特定のファイル型・パスでだけ効かせたいルール                   | `.claude/rules/*.md`（`paths:` frontmatter でスコープ）       |
| 手順的で、必要なときだけ読めばよいもの                         | `.claude/skills/<name>/`（常時ロードしない）                  |
| 設計の根拠・仕様の全体像（長文）                               | `docs/specs/*.md`（`CLAUDE.md` からリンクし、両方に書かない） |
| セットアップ・起動手順など人間向けの導入                       | `README.md`                                                   |
| **破られたら困ること**                                         | hook / `.claude/settings.json` の `permissions.deny`          |

**`CLAUDE.md` / `.claude/rules/` / auto memory を書く・直す・削るときは、先に `claude-md-memory` skill
（[`.claude/skills/claude-md-memory/`](.claude/skills/claude-md-memory/)）を読む。**

現行の `.claude/rules/`: [`result-type.md`](.claude/rules/result-type.md)（失敗は throw せず
`@icasu/simple-result` の `Result` で返す。全 `.ts`/`.tsx` に適用）。

現行の `docs/specs/`: [`backend-architecture.md`](docs/specs/backend-architecture.md)（BFF のレイヤ設計）・
[`authentication.md`](docs/specs/authentication.md)（認証の全体像）・[`logs.md`](docs/specs/logs.md)
（ログ／監査ログ）・[`optimistic-lock.md`](docs/specs/optimistic-lock.md)（楽観ロック）。

## コミットの方針

作業は原則 `main` ブランチに直接コミットする（トピックブランチや PR は基本使わない）。
pre-commit / commit-msg フックが落ちたら、**バイパスせず原因を直して再コミットする**。

## ツール導入の方針

パッケージ固有のツール（依存・設定・スクリプト）は、**そのワークスペースパッケージ内に閉じる**
（例: steiger は `apps/frontend`）。ルートには `pnpm --filter <pkg> run <script>` への薄い委譲スクリプトの
み置く。横断的な lint/format（oxlint/oxfmt）は意図的にルートに集約している。

## 依存の追加・更新

**依存や `pnpm-lock.yaml` を触るときは `pnpm-dependencies` skill（`.claude/skills/pnpm-dependencies/`）を
読む。** registry は Takumi Guard プロキシで `pnpm-workspace.yaml` に `minimumReleaseAge`（21 日）があり、
素の pnpm とは挙動が違う（手元で `pnpm install` が通っても CI で落ちうる）。

## docker-compose のコンテナ設定ファイル

`docker-compose.yml`（ルート）から volume マウントする設定ファイルは、ルート直下の `docker/<service>/` に
サービス名でディレクトリを分けて置く（例: `docker/oidc-server-mock/clients.json` / `users.json`）。アプリの
ソース（`apps/*`）には置かない。

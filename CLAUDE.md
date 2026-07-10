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
| `packages/logger`（`@icasu/logger`）               | 構造化ログと監査ログ（AWS Lambda Powertools Logger のラッパ）。全パッケージ共有の実体。                                           |
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

ローカルは docker-compose のエミュレータ（Postgres + DynamoDB Local + oidc-server-mock）を
使うため AWS 認証情報は不要。

1. `pnpm local:up` — Postgres + DynamoDB Local + OIDC mock を起動し、セッションテーブルを作成。
2. `pnpm db:migrate` — ローカル Postgres に drizzle マイグレーションを適用（初回とスキーマ
   変更時。`packages/db/.env` の `DATABASE_URL` を使う）。
3. `apps/backend/.env` を用意（`apps/backend/.env.example` をコピー。OIDC/Cookie/DynamoDB の
   ローカル既定値入り）。
4. `pnpm dev` — フロント（:5001）とバック（:3001 = BFF）を並列起動。
5. http://localhost:5001 へアクセス → 未認証なら OIDC フローが走り、oidc-server-mock の
   ログイン画面へ。事前定義ユーザーでログインすると SPA に戻る（`member` / `member`、または
   `admin` / `admin`。どちらも email 付き）。

ローカル認証の補足:

- OIDC プロバイダは oidc-server-mock（Duende IdentityServer ベース）。ユーザーは email 付きで
  `docker/oidc-server-mock/users.json` に事前定義する（`member-user` / `admin-user`）。BFF クライアントの
  登録は `clients.json`。ユーザーやクレームを増やすなら users.json を編集して `pnpm local:up`
  （または oidc-server-mock コンテナ再起動）。
- **admin を試す**: `admin` / `admin` でログインすると `sub=admin-user`。ただし role は DB 側の責務で、
  初回アクセス時に JIT で `role='member'` の行が作られる。admin として認可を通すには
  `update users set role='admin' where user_sub='admin-user';` で昇格する（認可の設計は
  [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md)「認証・認可」節）。

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
- **設計判断・アーキテクチャの根拠（レイヤ分割の理由・複数ファイルに跨る規約・命名思想など）は
  `CLAUDE.md` に集約し、コードコメントで再説しない**。コードには局所の why だけ残し、背景は
  「詳細は CLAUDE.md」で参照させる。両方に書くとコードが冗長になり、CLAUDE.md との drift も生む。
- **経緯は書かない**（「かつて〜だった」「〜を撤去したため」など過去の変遷）。コメントは現在の
  コードの状態と理由だけを説明する（このリポはテンプレなので経緯は残す価値がない）。
- **依存方向に逆らう知識を書かない**。下位レイヤ（`entities` などドメイン）のコメントに、上位
  （wire / routes / repo / DB）がそれをどう使うかの知識を持たせない。コメントもコードと同じく
  依存の向きに従う（例: enum の値配列に「wire も DB もここから派生させる」と書かない——それは
  派生させる側の関心）。

## コードの並び順（抽象度順・stepdown）

- ファイル内の関数・定義は **抽象度と依存関係の順に、上から下へ抽象度が下がる**ように並べる。
  上部に「意図・全体の流れ（高抽象＝呼び出す側）」、下部に「その実装ディテール（低抽象＝呼ばれる側）」を置く。
- 狙いは**読み方の段階制御**: 意図だけ掴みたい人はファイル上部を読めば済み、より深く実装を知りたい人は
  読み下がるほど詳細に降りていける（Clean Code の "The Stepdown Rule"）。
- 具体的には、公開エントリ／オーケストレーション関数を先に、そこから呼ばれるヘルパを後に置く
  （呼ぶ側が呼ばれる側より上）。「定義を使う前に書く」ためだけの機械的な bottom-up 順にしない
  （関数宣言の巻き上げやモジュールスコープでは前方参照できるので、順序は読者のために選べる）。

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
- **DB（`packages/db`）**: drizzle のスキーマとマイグレーション。DSQL 互換のスキーマルール
  （`pgEnum`/FK/連番 PK 不可など）と自前マイグレーションランナー・適用フロー（CDK デプロイ中に
  自動適用）は [`packages/db/CLAUDE.md`](packages/db/CLAUDE.md)。
- **BFF 認証（`packages/backend-auth`）**: OIDC 認可コード + PKCE の Hono app。設計・公開 API・
  テスト方針は [`packages/backend-auth/CLAUDE.md`](packages/backend-auth/CLAUDE.md)。
- **ログ（`packages/logger`）**: 公開 API と作業ルールは [`packages/logger/CLAUDE.md`](packages/logger/CLAUDE.md)、
  監査ログの仕掛け所は [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md)「監査ログ」。
  **設計の根拠は [`docs/specs/logs.md`](docs/specs/logs.md)**。

## コミットの方針

- 作業は原則 `main` ブランチに直接コミットする（トピックブランチや PR は基本使わない）。
- `git commit --no-verify`（および `-n`）は**使用禁止**。pre-commit / commit-msg などの
  フックは必ず通すこと。フックが失敗する場合はバイパスせず、原因を直してから再コミットする。

## ツール導入の方針

パッケージ固有のツール（依存・設定・スクリプト）は、そのワークスペースパッケージ内に閉じる
（例: steiger は `apps/frontend`）。ルートには `pnpm --filter <pkg> run <script>` への薄い委譲スクリプトのみ置く。
横断的な lint/format（oxlint/oxfmt）は意図的にルートに集約している。

## 依存の追加・更新

依存や `pnpm-lock.yaml` を触るときは `pnpm-dependencies` skill
（`.claude/skills/pnpm-dependencies/`）を読むこと。registry は Takumi Guard プロキシ、
`pnpm-workspace.yaml` には `minimumReleaseAge`（21 日）があり、素の pnpm とは挙動が違う。

要点だけ:

- `minimumReleaseAgeExclude` への追加は**一時的な措置**。各エントリに「いつ待機期間を満たして
  除外を消せるか」の期日をコメントで書き、期日を過ぎたら削除する（バージョンを上げたら期日も更新）。
- **lockfile を変更したらコミット前に cold cache で検証する**
  （`.claude/skills/pnpm-dependencies/scripts/verify-lockfile-cold.sh`）。pnpm は supply-chain
  policy の検査結果をキャッシュするため、手元の `pnpm install` が通っても CI で落ちることがある。

## docker-compose のコンテナ設定ファイル

`docker-compose.yml`（ルート）から volume マウントするコンテナの設定ファイルは、ルート直下の
`docker/<service>/` に置く（例: oidc-server-mock の設定は `docker/oidc-server-mock/clients.json` /
`users.json`）。アプリのソース（`apps/*`）には置かない。1 サービスが複数ファイルを持っても破綻
しないよう、サービス名でディレクトリを分ける。

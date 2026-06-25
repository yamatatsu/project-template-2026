# CLAUDE.md — apps/frontend

フロントエンド（React + Vite + Tailwind v4 + shadcn/ui）で作業する際のルール。

## アーキテクチャ: Feature-Sliced Design (FSD v2.1)

`src` は **FSD v2.1** に従う。コードの置き場所・public API・import 境界を判断するときは
`feature-sliced-design` skill（`.claude/skills/feature-sliced-design/`）を参照すること。

### レイヤー（上位 → 下位）

```
app/        # エントリ・providers・合成ルート（main.tsx, app.tsx, styles/）
pages/      # ルート単位の画面（例: pages/home）
widgets/    # 複数 feature/entity を束ねる大きな UI ブロック
features/   # ユーザー操作・ユースケース
entities/   # ビジネスエンティティ
shared/     # 横断的に再利用する基盤（ui/ lib/ api/ など、ビジネス非依存）
```

### ルール

- **import は下位レイヤー方向のみ**（例: `pages` → `features`/`entities`/`shared`。逆流禁止）。違反は `pnpm steiger` が検出する。
- **slice は public API 経由で import する**。slice 直下の `index.ts` で公開し、`@/pages/home` のように index から import する（深い相対 import を slice 外から行わない）。
- `shared` はセグメント単位（`@/shared/ui/button`, `@/shared/lib/utils`, `@/shared/api`）で import する（`steiger.config.ts` で `shared` の public-api ルールは緩和済み）。
- パスエイリアスは `@/*` → `src/*`（`tsconfig.json` / `vite.config.ts`）。
- shadcn コンポーネントは `src/shared/ui/` に置く（`components.json` の alias 設定済み。`shadcn add` の出力先も `shared/ui`）。フォーマット対象外（`.oxfmtrc.json`）。
- 「まず単純に、必要になってから抽出する」。entities 層を最初から無理に作らない。判断は skill の reference を参照。

## アーキテクチャ検査（steiger）

`steiger`（`@feature-sliced/steiger-plugin`）が FSD 違反を検出する。設定は `steiger.config.ts`。
pre-commit と CI で実行される（ルートから `pnpm steiger`）。開発中の常駐監視は `pnpm run steiger:watch`。

## コマンド（このパッケージ内から）

| 目的                | コマンド                              |
| ------------------- | ------------------------------------- |
| 開発サーバ          | `pnpm dev`                            |
| ビルド / プレビュー | `pnpm build` / `pnpm preview`         |
| 型チェック / テスト | `pnpm typecheck` / `pnpm test`        |
| FSD 検査 / 常駐監視 | `pnpm steiger` / `pnpm steiger:watch` |

---
name: pnpm-dependencies
description: >
  このモノレポ（project-template-2026）で依存を追加・更新・削除するとき、および
  `pnpm-lock.yaml` を変更・レビューするときの実装ガイド。このリポジトリは
  `.npmrc` の registry に Takumi Guard プロキシ（npm.flatt.tech）を、
  `pnpm-workspace.yaml` に `minimumReleaseAge`（21日）を設定しており、素の pnpm とは
  挙動が違う。以下のいずれかのとき必ず読むこと —— (1) `pnpm add` / `pnpm update` /
  依存のバージョンを上げる・下げる、(2) `pnpm install` が
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION` / `ERR_PNPM_TARBALL_URL_MISMATCH` /
  `Lockfile failed supply-chain policy check` で失敗する、(3) `minimumReleaseAge` /
  `minimumReleaseAgeExclude` / Takumi Guard / npm.flatt.tech / supply-chain policy を
  扱う、(4) `pnpm-lock.yaml` の差分をコミット・レビューする、(5) ローカルでは
  `pnpm install` が通るのに CI だけ落ちる。依存と lockfile に触るならまずこれを読む。
---

# pnpm 依存管理（Takumi Guard + minimumReleaseAge）

このリポジトリの pnpm は 2 つの安全装置で守られている。どちらも素の pnpm には無い挙動なので、
依存を触ると素直に通らないことがある。

| 装置                                       | 場所                 | 何をするか                                                       |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| Takumi Guard（registry プロキシ）          | `.npmrc`             | 既知の悪性パッケージを遮断する。全取得がここを通る前提。         |
| `minimumReleaseAge: 30240`（21日）         | `pnpm-workspace.yaml`| publish 直後のパッケージをインストールさせない。                 |

## 鉄則: lockfile を変えたらコミット前に cold cache で検証する

```bash
.claude/skills/pnpm-dependencies/scripts/verify-lockfile-cold.sh
```

**`pnpm install` が手元で通ったことは、CI で通る根拠にならない。** pnpm は supply-chain policy の
検査結果をキャッシュし、2 回目以降は実際には検査せずに

```
✓ Lockfile passes supply-chain policies (verified 3m ago)
```

と表示する。CI（`pnpm install --frozen-lockfile` / 空の cache）は必ず全件検査するため、
**壊れた lockfile がローカルでは緑、CI では赤になる**。過去に実際、壊れた lockfile が
気づかれずに `main` に乗ったことがある。

上記スクリプトは store と cache を使い捨てディレクトリに逃がして検査を強制する。
終了コード 0 なら CI の `pnpm install --frozen-lockfile` が通る。

## 症状別の対処

### `ERR_PNPM_NO_MATURE_MATCHING_VERSION`

publish から 21 日経っていない。待てないなら `pnpm-workspace.yaml` の
`minimumReleaseAgeExclude` に追加する。**除外は一時的な措置なので、必ず期日をコメントで残す**
（この運用はルート `CLAUDE.md`「依存の追加（minimumReleaseAge）」にも明文化されている）。

```yaml
minimumReleaseAgeExclude:
  # 7.0.2（publish: 2026-07-08）→ 2026-07-29 に除外不要
  - typescript
```

期日は publish 日 + 21 日。publish 日はこう調べる:

```bash
npm view <pkg> time --json | grep '"<version>"'
```

**ネイティブバイナリを持つパッケージに注意。** 本体だけ除外しても、同時 publish される
プラットフォーム別バイナリが 21 日ルールに掛かって解決に失敗する。scope ごと除外する。

```yaml
  - typescript
  - '@typescript/*'   # TS 7 はネイティブ実装。本体と同時 publish
```

期日を過ぎたらエントリを削除し、`pnpm install` が通ることを確認する。

### `ERR_PNPM_TARBALL_URL_MISMATCH` / `Lockfile failed supply-chain policy check`

lockfile の `resolution:` に `tarball: https://registry.npmjs.org/...` が直書きされている。
この URL は Takumi Guard を迂回するので、ポリシーが拒否する。

```yaml
# 悪い（npmjs 直リンク = guard を通らない）
resolution: {integrity: sha512-..., tarball: https://registry.npmjs.org/foo/-/foo-1.0.0.tgz}
# 良い（URL は設定済み registry から導出される）
resolution: {integrity: sha512-...}
```

**直し方は `tarball:` フィールドの削除だけ**:

```bash
perl -pi -e 's/, tarball: https:\/\/registry\.npmjs\.org\/[^}]*\}/}/' pnpm-lock.yaml
pnpm install                                                    # 書き戻されないことを確認
.claude/skills/pnpm-dependencies/scripts/verify-lockfile-cold.sh
```

`integrity` の sha512 は lockfile に残るので**内容の検証は一切弱まらない**。変わるのは取得経路だけ。

- **`pnpm clean --lockfile` は使わない。** エラーメッセージはこれを勧めるが、依存全体を再解決する
  大鉈で、無関係なバージョンが動く。必要なのは tarball フィールドの削除だけ。
- **エラーが報告する件数を全件だと思わない。** 検査キャッシュの状態によって、同じ lockfile でも
  「1 件失敗」と「12 件失敗」が両方起きる。件数ではなく `grep -c 'tarball:' pnpm-lock.yaml` が 0 に
  なることを基準にする。
- **混入経路**: 通常の `pnpm add` では起きない（検証済み）。`.npmrc` の registry をバイパスした
  install（registry 上書き、別ツール、`.npmrc` の無い環境）が原因。差分に `tarball:` が現れたら、
  誰がどう入れたかを疑う。

## コミット時の注意

- **pre-commit（`pnpm exec lint-staged`）は依存の整合性チェックを走らせる。** `package.json` と
  `pnpm-lock.yaml` と `node_modules` が食い違っていると、lint 以前に落ちる。lockfile 修正と依存更新を
  別コミットに分けるなら、各コミットの時点でツリーが自己整合している必要がある
  （片方だけ stage しても、pre-commit は**作業ツリー**を見る）。必要なら該当ファイルを一時的に
  `git checkout HEAD --` で戻し、`pnpm install` で `node_modules` を合わせてからコミットする。
- `git commit --no-verify` は禁止（ルート `CLAUDE.md`）。フックが落ちたら原因を直す。

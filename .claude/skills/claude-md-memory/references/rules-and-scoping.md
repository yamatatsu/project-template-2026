# `.claude/rules/` と path スコープ

大きめのプロジェクトで指示を複数ファイルに分けたいとき、`.claude/rules/` を使う。
CLAUDE.md 本体を膨らませずにモジュール化でき、**特定のファイル型／パスのときだけ**
ロードするよう絞れる。出典: code.claude.com/docs/en/memory。

## CLAUDE.md / rules / skill の使い分け

- **CLAUDE.md**: 毎セッション常時載せたい、プロジェクト全体の指示。
- **`.claude/rules/`**: トピック別に分割した指示。`paths:` を付けなければ CLAUDE.md と同じく
  毎回ロード、付ければ**マッチするファイルを開いたときだけ**ロード（常時載せる必要がない
  ファイル型限定のルールに向く）。
- **skill**: 手順的で、呼び出したときや関連するときだけロードしたいもの。常時コンテキストに
  載せない。「毎回のルール」ではなく「必要なときのワークフロー」はこちら。

## 置き方

`.claude/rules/` に 1 トピック 1 ファイルで置く。`testing.md`・`api-design.md` のように内容が
分かるファイル名にする。`.md` は再帰的に発見されるので `frontend/`・`backend/` 等のサブ
ディレクトリに整理してよい。

```text
your-project/
├── .claude/
│   ├── CLAUDE.md           # メインのプロジェクト指示
│   └── rules/
│       ├── code-style.md
│       ├── testing.md
│       └── security.md
```

`paths` frontmatter が**無い**ルールは launch 時に `.claude/CLAUDE.md` と同じ優先度で無条件ロード。

## path スコープ（`paths:` frontmatter）

YAML frontmatter の `paths` で、マッチするファイルを Claude が扱うときだけ効くルールにできる:

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
- 全 API エンドポイントは入力バリデーションを含む
- 標準のエラーレスポンス形式を使う
```

- `paths` 無し = 無条件（全ファイルに適用）。
- path スコープは、**マッチするファイルを Claude が読むとき**にトリガーされる（毎ツール呼び出し
  ごとではない）。v2.1.198 以降は project ディレクトリへの symlink 経由でもマッチする。
- glob 例:

  | パターン | マッチ |
  | --- | --- |
  | `**/*.ts` | 任意ディレクトリの全 TS |
  | `src/**/*` | `src/` 配下の全ファイル |
  | `*.md` | プロジェクトルート直下の Markdown |
  | `src/components/*.tsx` | 特定ディレクトリの React コンポーネント |

- 複数パターン・brace 展開も可:
  ```markdown
  ---
  paths:
    - "src/**/*.{ts,tsx}"
    - "lib/**/*.ts"
    - "tests/**/*.test.ts"
  ---
  ```

## symlink で複数プロジェクト間で共有

`.claude/rules/` は symlink を解決してロードする（循環も検出・処理される）。共有ルール集を
リンクして使い回せる:

```bash
ln -s ~/shared-claude-rules .claude/rules/shared
ln -s ~/company-standards/security.md .claude/rules/security.md
```

## user レベルの rules

`~/.claude/rules/` の個人ルールは全プロジェクトに適用される（プロジェクト非依存の好みに）。
user レベルは project レベルより**先に**ロードされるので、project 側が優先される。

```text
~/.claude/rules/
├── preferences.md
└── workflows.md
```

## このリポジトリでの位置づけ

このリポは現状 `.claude/rules/` を使わず、**パッケージ別 CLAUDE.md** で局所ルールを分けている
（ルート CLAUDE.md「ドキュメントの置き場所」）。`.claude/rules/` を新設するのは、
「ファイル型限定で、かつパッケージ境界に一致しない横断ルール」を常時ではなく条件付きで
効かせたいときに限る。まずはパッケージ別 CLAUDE.md で足りないかを検討する。

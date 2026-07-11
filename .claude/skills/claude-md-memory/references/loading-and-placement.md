# ロードと配置の詳細

CLAUDE.md がどこから・どの順でロードされるか、`@path` import、モノレポでの除外。
出典: code.claude.com/docs/en/memory。

## ロード順（broadest → most specific）

すべての scope の CLAUDE.md は**上書きではなく concat**される。後にロードされたものほど
「近い」指示として最後に読まれる。

1. **Managed policy**（組織配布・個人設定では除外不可）
   - macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`
   - Linux / WSL: `/etc/claude-code/CLAUDE.md`
   - Windows: `C:\Program Files\ClaudeCode\CLAUDE.md`
   - `managed-settings.json` の `claudeMd` キーで、別ファイルを置かず設定内に直接書くこともできる。
2. **User**: `~/.claude/CLAUDE.md`（自分の全プロジェクト）
3. **Project**: `./CLAUDE.md` または `./.claude/CLAUDE.md`（チーム共有）
4. **Local**: `./CLAUDE.local.md`（個人・非共有。`.gitignore` に入れる）

## ディレクトリツリーの歩き方

作業ディレクトリから**ルートに向かって上に**歩き、各階層の `CLAUDE.md` と `CLAUDE.local.md` を
拾う。`foo/bar/` で起動したら `foo/bar/CLAUDE.md`・`foo/CLAUDE.md`・それぞれの `CLAUDE.local.md` が
ロードされる。並び順はファイルシステムのルート側から作業ディレクトリ側へ——`foo/CLAUDE.md` が
`foo/bar/CLAUDE.md` より先。同じ階層内では `CLAUDE.local.md` が `CLAUDE.md` の後（自分のメモが最後）。

**作業ディレクトリより下**のサブディレクトリの CLAUDE.md は launch 時にはロードされず、
Claude がそのサブディレクトリのファイルを読むときに初めて含まれる。だから各パッケージ直下に
CLAUDE.md を置くのが効く（このリポの構成）。

## HTML コメントは剥がされる

CLAUDE.md 内のブロックレベル HTML コメント（`<!-- メンテナ向けメモ -->`）は、コンテキストに
注入される前に**除去される**。人間のメンテナ向けメモをトークンを消費せず残せる。ただし
コードブロック内のコメントは保持される。Read ツールで直接開くとコメントは見える。

## `@path` import

- `@path/to/file` で他ファイルを取り込む。取り込まれた内容は launch 時に呼び出し元 CLAUDE.md と
  並んでコンテキストに展開される。
- 相対パスは**その import を含むファイルからの相対**（作業ディレクトリ基準ではない）。絶対パスも可。
- import 先はさらに import でき、**最大 4 hop**。
- **Markdown のコードスパン／フェンスは import 解析からスキップ**される。パスを import せず
  文字として書きたいならバッククォートで囲む: `` `@README` `` はリテラル、`@README` は import。
- 例:
  ```text
  See @README for project overview and @package.json for available commands.

  # Additional Instructions
  - git workflow @docs/git-instructions.md
  ```
- **注意**: import は整理には役立つが**コンテキスト削減にはならない**。import 先も全部 launch 時に
  ロードされる。サイズを減らしたいなら import ではなく path スコープ rules や下位 CLAUDE.md へ。
- 外部 import を初めて見たとき approval ダイアログが出る。拒否すると以後 import は無効のまま。
- worktree を跨いで個人設定を共有したいなら、gitignore された `CLAUDE.local.md` は各 worktree に
  しか無いので、ホームからの import を使う: `- @~/.claude/my-project-instructions.md`。

## AGENTS.md 連携

Claude Code は `AGENTS.md` ではなく `CLAUDE.md` を読む。既に AGENTS.md を使うリポなら、CLAUDE.md で
import して二重管理を避ける:

```markdown
@AGENTS.md

## Claude Code
Use plan mode for changes under `src/billing/`.
```

Claude 固有の追記が不要なら symlink でもよい（`ln -s AGENTS.md CLAUDE.md`。Windows は
symlink に管理者権限が要るので `@AGENTS.md` import を使う）。`/init` は既存の AGENTS.md や
`.cursorrules` 等も読んで取り込む。

## `--add-dir` からのロード

`--add-dir` で追加したディレクトリの CLAUDE.md は**既定ではロードされない**。ロードするには
`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` を設定する:

```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../shared-config
```

これで追加ディレクトリの `CLAUDE.md`・`.claude/CLAUDE.md`・`.claude/rules/*.md`・`CLAUDE.local.md`
がロードされる。

## モノレポで無関係な CLAUDE.md を除外する

祖先ディレクトリに他チームの CLAUDE.md があって拾われてしまう場合、`claudeMdExcludes` で
パス／glob 指定でスキップする。`.claude/settings.local.json` に置けば除外は手元だけに閉じる:

```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

絶対パスに対する glob マッチ。user / project / local / managed のどの層でも設定でき、配列は
層を跨いでマージされる。**managed policy の CLAUDE.md は除外できない**。

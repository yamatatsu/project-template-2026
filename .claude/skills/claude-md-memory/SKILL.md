---
name: claude-md-memory
description: >
  Claude Code の記憶（CLAUDE.md / CLAUDE.local.md / `.claude/rules/` / auto memory）を
  作成・編集・レビューするときの実装ガイド。CLAUDE.md に何を書き何を書かないか、どこに置くか
  （scope とロード順・モノレポでの階層ロード）、`@path` import、path スコープの rules、
  200 行の目安、`/init` `/memory` の使い方を、公式ドキュメント（code.claude.com/docs/en/memory）と
  このリポジトリの規約に沿って集約する。以下のいずれかのとき必ず読むこと ——
  (1) CLAUDE.md / CLAUDE.local.md を新規作成する・追記する・整理する・レビューする、
  (2) パッケージ直下やサブディレクトリに CLAUDE.md を置くか迷う／ルートに書くべきか迷う、
  (3) `.claude/rules/` や path スコープのルール、`@path` import、AGENTS.md 連携を扱う、
  (4) 「CLAUDE.md が効かない」「大きすぎる」「compact 後に消える」等の記憶のトラブルを調べる、
  (5) auto memory（Claude が自分で書くメモ）と CLAUDE.md の使い分けを知りたい。
  記憶ファイルに触るならまずこれを読む。
---

# CLAUDE.md / 記憶ファイルの書き方

Claude Code はセッションごとにコンテキストが白紙から始まる。それを跨いで知識を運ぶ仕組みが
**CLAUDE.md**（人が書く指示）と **auto memory**（Claude が自分で書くメモ）。どちらも
毎セッション頭でロードされる。CLAUDE.md は「毎回守ってほしい指示」を書く場所で、
**強制ではなくコンテキスト**——具体的で簡潔なほど従われやすい。

> このリポジトリ固有のドキュメント配置規約（ルート／パッケージ別 CLAUDE.md、日本語で書く、
> コメント方針、抽象度順の並び）は**ルート [`CLAUDE.md`](../../../CLAUDE.md) が正典**。
> このスキルは Claude Code の記憶の仕組み全般と、それをこのリポジトリでどう使うかに絞る。
> 両者が食い違ったらルート CLAUDE.md を優先し、このスキルを直す。

## まず判断: CLAUDE.md か、それ以外か

書きたい内容がどこに属するかを先に決める。ここを外すとルート CLAUDE.md が肥大化して
adherence が落ちる。

- **毎セッション効かせたい、プロジェクト全体の恒久ルール**（ビルド／テストコマンド、命名規約、
  アーキテクチャ、「常に X する」）→ **CLAUDE.md**。
- **特定パッケージ／ディレクトリにしか効かないルール** → そのディレクトリ直下の **CLAUDE.md**
  （サブディレクトリのものは、Claude がそのディレクトリのファイルを読むとき初めてロードされる。
  ルート CLAUDE.md には詳細を持ち込まずリンクで参照する——このリポの既存規約どおり）。
- **手順的（複数ステップ）で、必要なときだけ読めばよいもの** → **skill**（`.claude/skills/`）。
  常時コンテキストに載せない。
- **特定のファイル型／パスのときだけ効かせたいルール** → **`.claude/rules/`** の path スコープ
  ルール（`paths:` frontmatter）。詳細は [`references/rules-and-scoping.md`](references/rules-and-scoping.md)。
- **個人的・非共有の設定**（自分のサンドボックス URL 等、git に入れない）→ **CLAUDE.local.md**
  （`.gitignore` 済み）。

「Claude が同じミスを 2 回した」「レビューで毎回同じ指摘をした」「先週と同じ訂正をまた入力した」
——これらが CLAUDE.md に書く合図。

## どこに置くか（scope とロード順）

broadest → most specific の順にロードされ、後にロードされたものほど「近い」指示として効く。

| scope | 置き場所 | 共有範囲 |
| --- | --- | --- |
| user（個人・全プロジェクト） | `~/.claude/CLAUDE.md` | 自分だけ |
| project（チーム共有） | `./CLAUDE.md` または `./.claude/CLAUDE.md` | チーム（VCS 経由） |
| project 内の下位 | 各ディレクトリの `CLAUDE.md` | チーム。**そのディレクトリのファイルを読むとき**ロード |
| local（個人・当プロジェクト） | `./CLAUDE.local.md` | 自分だけ（`.gitignore`） |

ルートから作業ディレクトリまでの各階層の CLAUDE.md が**全部 concat される**（上書きではない）。
ロード順・サブディレクトリの遅延ロード・`--add-dir`・monorepo の除外は
[`references/loading-and-placement.md`](references/loading-and-placement.md)。

## 書き方（効く CLAUDE.md にする）

CLAUDE.md は毎セッション**全文が**コンテキストに載る（MEMORY.md と違い行数で切られない）。
だから書き方が adherence を左右する。

- **サイズ**: 1 ファイル **200 行未満**を目安。長いほどコンテキストを食い adherence が下がる。
  膨らんだら path スコープの rules に逃がすか、下位 CLAUDE.md に分ける。`@path` import は
  **整理にはなるがコンテキスト削減にはならない**（import 先も launch 時に全部載る）。
- **具体性**: 検証できる粒度で書く。「コードを整形する」ではなく「2 スペースインデント」、
  「テストする」ではなく「コミット前に `pnpm test`」、「整理する」ではなく「API ハンドラは
  `src/api/handlers/` に置く」。
- **構造**: 見出しと箇条書きで束ねる。密な段落より読み下せる。
- **無矛盾**: CLAUDE.md 同士・下位 CLAUDE.md・`.claude/rules/` の間で指示が矛盾すると Claude が
  どちらか一方を恣意的に選ぶ。定期的に見直して古い／衝突する指示を消す。
- **what ではなく守ってほしい規約**を書く（このリポのコメント方針と同じく、背景・理由は
  CLAUDE.md に、局所の why はコードに）。

このリポで書くときは追加で: **日本語で書く**、**設計判断の根拠は CLAUDE.md に集約しコード
コメントで再説しない**、**経緯（かつて〜だった）は書かない**、**関数は抽象度順（stepdown）に
並べる**——いずれもルート CLAUDE.md の規約。新規パッケージに CLAUDE.md を足したら、
ルート CLAUDE.md の「ドキュメントの置き場所」節のリンク一覧にも追記する。

## `@path` import と AGENTS.md

CLAUDE.md は `@path/to/file` で他ファイルを取り込める（相対パスは**その CLAUDE.md からの相対**、
再帰は最大 4 hop）。バッククォートで囲むと import されずリテラルになる（`` `@README` ``）。
AGENTS.md を併用するリポでは、CLAUDE.md 先頭に `@AGENTS.md` と書いて取り込むのが定石。
詳細は [`references/loading-and-placement.md`](references/loading-and-placement.md)。

## 作った後の検証

- **`/memory`**: いまロードされている CLAUDE.md / CLAUDE.local.md / rules を一覧・編集する。
  「効かない」ときはまずここで**そのファイルがロードされているか**を確認する。
- **`/init`**: コードベースを解析して CLAUDE.md の叩き台を生成する（既存があれば上書きせず改善提案）。
  ゼロから書く前の出発点に。

## トラブルシュート（詳細は references）

- **効かない** → `/memory` でロード確認、指示をより具体的に、矛盾を除去。特定タイミングで
  必ず実行させたい（コミット前など）なら CLAUDE.md ではなく **hook** にする。
- **大きすぎる** → path スコープ rules に逃がす／不要行を削る（import では減らない）。
- **compact 後に消えた** → ルート CLAUDE.md は compact 後に再注入される。下位 CLAUDE.md は
  そのディレクトリのファイルを次に読むまで再ロードされない。会話だけで与えた指示は消えるので
  恒久化したいなら CLAUDE.md に書く。

より詳しい原因切り分けと auto memory（`~/.claude/projects/<project>/memory/`）の仕組みは
[`references/writing-and-troubleshooting.md`](references/writing-and-troubleshooting.md)。

# 強制の境界・トラブルシュート・auto memory

出典: code.claude.com/docs/en/memory。SKILL.md（あるべき姿・書く基準・チェックリスト）を補う仕組み側の詳細。

## 強制の境界: CLAUDE.md / settings / hook

CLAUDE.md は**行動を方向づける**が、**止められない**。「守られなかったら壊れる」ものは設定側へ移す。

| やりたいこと | 置き場所 |
| --- | --- |
| 特定のツール・コマンド・パスを**禁止**する | settings の `permissions.deny`（クライアントが実行を止める） |
| サンドボックス隔離を強制する | settings の `sandbox.enabled` |
| 環境変数・API プロバイダの向き先を固定する | settings の `env` |
| **必ず**あるタイミングで走らせる（コミット前・編集後など） | **hook**（Claude の判断に関わらずライフサイクルで実行） |
| コードスタイル・品質の指針 | CLAUDE.md |
| 行動の指示（「〜のときは plan mode を使う」等） | CLAUDE.md |

組織全体に配る CLAUDE.md（managed policy）は `managed-settings.json` の `claudeMd` キーに直接
本文を書くこともできる。managed の CLAUDE.md は個人設定で**除外できない**（`claudeMdExcludes`
の対象外）。`claudeMd` は managed / policy 設定でのみ有効で、user / project / local に書いても効かない。

システムプロンプトのレベルで効かせたいなら `--append-system-prompt`。毎回渡す必要があるので
対話利用よりスクリプト・自動化向き。

## トラブルシュート

### CLAUDE.md が効かない

CLAUDE.md はシステムプロンプトではなく、その直後の user メッセージとして届く。読んで従おうとは
するが、曖昧・矛盾した指示は厳密には守られない。

- `/memory` で CLAUDE.md / CLAUDE.local.md が**ロードされているか**確認（一覧に無ければ見えていない）。
- そのファイルがセッションでロードされる場所にあるか確認（配置は loading-and-placement.md）。
- 指示をより具体的にする。**CLAUDE.md 群・下位 CLAUDE.md・`.claude/rules/` を跨いだ矛盾を除去する**
  （矛盾すると Claude はどちらかを恣意的に選ぶ）。
- **特定タイミングで必ず実行させたい**なら CLAUDE.md ではなく **hook**（上表）。
- どの指示ファイルがいつ・なぜロードされたかを追うには `InstructionsLoaded` hook が使える
  （path スコープ rule や遅延ロードされる下位 CLAUDE.md のデバッグ向き）。

### 大きすぎる

200 行超はコンテキストを食い遵守率を下げる。削る／逃がすの判断は SKILL.md「サイズと構造」。

### compact 後に消えた

**プロジェクトルートの CLAUDE.md は compact を生き延びる**（compact 後にディスクから再読込・
再注入）。サブディレクトリの下位 CLAUDE.md は自動再注入されず、そのディレクトリのファイルを
次に読むとき再ロードされる。消えた指示は「会話でしか与えていなかった」か「まだ再ロードされて
いない下位 CLAUDE.md」のどちらか。会話だけの指示を恒久化したいなら CLAUDE.md に書く。

## auto memory（Claude が自分で書くメモ）

CLAUDE.md（人が書く指示）と対になる仕組み。Claude が作業しながらビルドコマンド・デバッグの
知見・アーキテクチャメモ・好みを**自分で**書き溜める。毎セッション保存するわけではなく、
将来の会話で役立つかで判断して残す。要 v2.1.59 以降。既定 ON。

- **使い分け**: CLAUDE.md は「人が書く指示・ルール」、auto memory は「Claude が学習したパターン」。
  「常に pnpm を使う」のような**指示**は CLAUDE.md に入れる（"add this to CLAUDE.md" と頼む）。
  単に「覚えておいて」と言うと auto memory に入る。**チームで共有すべきルールを auto memory に
  入れない**——マシンローカルで、他人にも CI にも届かない。
- **保存先**: `~/.claude/projects/<project>/memory/`。git リポジトリ単位で、worktree・サブ
  ディレクトリで共有。マシンローカルで、マシン間・クラウド環境では共有されない。
  ```text
  ~/.claude/projects/<project>/memory/
  ├── MEMORY.md          # 索引。毎セッション先頭 200 行 / 25KB だけロード
  ├── debugging.md       # トピック別詳細（起動時はロードされず、必要時に読む）
  └── ...
  ```
- **ロード**: `MEMORY.md` の**先頭 200 行または 25KB**（早い方）だけが毎セッション頭でロード。
  トピックファイルは起動時ロードされず、必要時に Claude が読む。この打ち切りは MEMORY.md 限定で、
  CLAUDE.md は長さに関わらず全文ロードされる。
- **監査・編集**: すべてプレーンな Markdown。`/memory` から閲覧・編集・削除できる。
- **無効化**: `/memory` のトグル、`settings.json` の `"autoMemoryEnabled": false`、または
  環境変数 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。保存先変更は `autoMemoryDirectory`（絶対パスか
  `~/` 始まり。プロジェクト設定に書いた場合は workspace trust の承認後にのみ有効）。
- subagent も自前の auto memory を持てる（subagent 設定の persistent memory）。

## `/memory` と `/init` の細部

使いどころは SKILL.md「作った後」。ここは挙動の細部だけ。

- **`/memory`**: ロード中の CLAUDE.md・CLAUDE.local.md・rules の一覧に加え、auto memory のトグルと
  フォルダへのリンク、各ファイルをエディタで開く導線を持つ。
- **`/init`**: 既存の CLAUDE.md があれば上書きせず改善提案を出す。既存の AGENTS.md・`.cursorrules`・
  `.devin/rules/`・`.windsurfrules` も読んで取り込む。`CLAUDE_CODE_NEW_INIT=1` でインタラクティブな
  多段フロー（CLAUDE.md / skill / hook のどれを作るか尋ね、subagent で探索し、確認画面を出してから
  書き込む）になる。

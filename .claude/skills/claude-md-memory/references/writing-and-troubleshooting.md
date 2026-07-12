# 効く指示の書き方・トラブルシュート・auto memory

出典: code.claude.com/docs/en/memory。SKILL.md の要約を補う詳細。

## いつ CLAUDE.md に足すか

CLAUDE.md は「毎回チャットに書き直すことになる内容」を置く場所。次のときに足す:

- Claude が**同じミスを 2 回**した。
- コードレビューが、このコードベースについて Claude が知っておくべきことを指摘した。
- **先週と同じ**訂正・補足をまたチャットに打ち込んだ。
- 新しいチームメンバーが生産的になるのに同じ前提が要る。

毎セッション持っていてほしい事実（ビルドコマンド、規約、レイアウト、「常に X」ルール）に絞る。
手順的（複数ステップ）なもの、コードベースの一部でしか効かないものは **skill** か
**path スコープ rule** に移す。

## 効く指示の 4 原則

1. **サイズ**: 1 ファイル 200 行未満が目安。長いほどコンテキストを食い adherence が落ちる。
   ※この 200 行は CLAUDE.md への推奨。CLAUDE.md は長さに関わらず**全文ロード**される
   （MEMORY.md の「先頭 200 行 / 25KB」制限とは別物）。
2. **構造**: Markdown の見出しと箇条書きで束ねる。
3. **具体性**: 検証できる粒度。「2 スペースインデント」＞「きれいに整形」、
   「コミット前に `pnpm test`」＞「テストする」、「API ハンドラは `src/api/handlers/`」＞「整理する」。
4. **無矛盾**: CLAUDE.md 群・下位 CLAUDE.md・`.claude/rules/` の間で矛盾すると恣意的に選ばれる。
   定期的に見直して古い／衝突する指示を消す。

## トラブルシュート

### CLAUDE.md が効かない

CLAUDE.md はシステムプロンプトではなく、その直後の user メッセージとして届く。Claude は読んで
従おうとするが、曖昧・矛盾した指示は特に厳密には守られない。

- `/memory` で CLAUDE.md / CLAUDE.local.md が**ロードされているか**確認（一覧に無ければ見えていない）。
- そのファイルがセッションでロードされる場所にあるか確認（配置は loading-and-placement.md）。
- 指示をより具体的にする。矛盾を除去する。
- **特定タイミングで必ず実行させたい**（コミット前・編集後など）→ CLAUDE.md ではなく **hook**。
  hook は Claude の判断に関わらずライフサイクルイベントでシェルコマンドとして走る。
- システムプロンプトレベルで効かせたい → `--append-system-prompt`（毎回渡す必要があり自動化向き）。
- どの指示ファイルがいつ・なぜロードされたかを追うには `InstructionsLoaded` hook が使える。

### 大きすぎる

200 行超はコンテキストを食い adherence を下げる。path スコープ rule でマッチ時だけロードするか、
毎回不要な内容を削る。`@path` import は**整理にはなるがコンテキストは減らない**（import 先も
launch 時に全部載る）。

### compact 後に消えた

**プロジェクトルートの CLAUDE.md は compact を生き延びる**（compact 後にディスクから再読込・
再注入）。サブディレクトリの下位 CLAUDE.md は自動再注入されず、そのディレクトリのファイルを
次に読むとき再ロードされる。消えた指示は「会話でしか与えていなかった」か「まだ再ロードされて
いない下位 CLAUDE.md」のどちらか。会話だけの指示を恒久化したいなら CLAUDE.md に書く。

## auto memory（Claude が自分で書くメモ）

CLAUDE.md（人が書く指示）と対になる仕組み。Claude が作業しながらビルドコマンド・デバッグの
知見・アーキテクチャメモ・好みを**自分で**書き溜める。毎セッション保存するわけではなく、
将来の会話で役立つかで判断して残す。要 v2.1.59 以降。既定 ON。

- **CLAUDE.md との違い**: CLAUDE.md は「人が書く指示・ルール」、auto memory は「Claude が学習した
  パターン」。「常に pnpm を使う」のような**指示**は CLAUDE.md に書くよう頼む（"add this to
  CLAUDE.md"）。単に「覚えておいて」と言うと auto memory に入る。
- **保存先**: `~/.claude/projects/<project>/memory/`。git リポジトリ単位で、worktree・サブ
  ディレクトリで共有。マシンローカルで、マシン間・クラウド環境では共有されない。
  ```text
  ~/.claude/projects/<project>/memory/
  ├── MEMORY.md          # 索引。毎セッション先頭 200 行 / 25KB だけロード
  ├── debugging.md       # トピック別詳細（起動時はロードされず、必要時に読む）
  └── ...
  ```
- **ロード**: `MEMORY.md` の**先頭 200 行または 25KB**（早い方）だけが毎セッション頭でロード。
  トピックファイルは起動時ロードされず、必要時に Claude が読む。この制限は MEMORY.md 限定で、
  CLAUDE.md は長さに関わらず全文ロードされる。
- **監査・編集**: すべてプレーンな Markdown。`/memory` から閲覧・編集・削除できる。
- **無効化**: `/memory` のトグル、`settings.json` の `"autoMemoryEnabled": false`、または
  環境変数 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。保存先変更は `autoMemoryDirectory`
  （絶対パスか `~/` 始まり）。

## `/memory` と `/init`

- **`/memory`**: ロード中の CLAUDE.md・CLAUDE.local.md・rules を一覧、auto memory のトグルと
  フォルダへのリンク、各ファイルをエディタで開く。
- **`/init`**: コードベースを解析して CLAUDE.md の叩き台を生成（既存があれば上書きせず改善提案）。
  `CLAUDE_CODE_NEW_INIT=1` でインタラクティブな多段フロー（CLAUDE.md / skill / hook のどれを
  作るか尋ね、subagent で探索し、確認画面を出してから書き込む）。既存の AGENTS.md・
  `.cursorrules`・`.devin/rules/`・`.windsurfrules` も読んで取り込む。

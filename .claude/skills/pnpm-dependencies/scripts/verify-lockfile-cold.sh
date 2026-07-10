#!/usr/bin/env bash
# lockfile を cold cache で検証する。
#
# pnpm は supply-chain policy の検査結果をキャッシュし、2 回目以降は
# 「✓ Lockfile passes supply-chain policies (verified 3m ago)」と出して実際には検査しない。
# そのため通常の `pnpm install` は、CI（クリーンな cache）なら落ちる lockfile を通してしまう。
# store と cache を使い捨てディレクトリに逃がすことで、検査を必ず実行させる。
#
# 使い方（リポジトリルートから）:
#   .claude/skills/pnpm-dependencies/scripts/verify-lockfile-cold.sh          # 作業ツリーを検証
#   .claude/skills/pnpm-dependencies/scripts/verify-lockfile-cold.sh --head   # HEAD のコミット内容を検証
#
# 終了コード: 0 = 検査通過（CI の pnpm install --frozen-lockfile が通る）

set -uo pipefail

target="${1:---worktree}"
repo_root="$(git rev-parse --show-toplevel)" || exit 1
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

case "$target" in
  --head)
    git -C "$repo_root" archive HEAD | tar -x -C "$work" || exit 1
    ;;
  --worktree)
    # node_modules と .git を除いた作業ツリーの写し。未コミットの lockfile 変更も検証対象になる。
    rsync -a --exclude 'node_modules' --exclude '.git' "$repo_root"/ "$work"/ || exit 1
    ;;
  *)
    echo "usage: $0 [--worktree|--head]" >&2
    exit 2
    ;;
esac

echo "▶ cold cache で検証中（数分かかることがある）..."
cd "$work" || exit 1

# --ignore-scripts: 検証したいのは解決とポリシーであってビルドではない
# --store-dir/--cache-dir: 共有キャッシュを避け、ポリシー検査を必ず走らせる
pnpm install --frozen-lockfile --ignore-scripts \
  --store-dir "$work/.store" --cache-dir "$work/.cache" 2>&1 |
  grep -E '^(✓|✗|\[ERR_|Lockfile|Done|  )' | head -30
status="${PIPESTATUS[0]}"

if [ "$status" -eq 0 ]; then
  echo "✅ lockfile は cold cache で検査を通過した"
else
  echo "❌ lockfile が検査に落ちた（この状態でコミットすると CI が壊れる）"
fi
exit "$status"

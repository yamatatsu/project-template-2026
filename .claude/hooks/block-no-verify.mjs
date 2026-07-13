#!/usr/bin/env node
// PreToolUse(Bash) hook: git のフックバイパスを拒否する。
//
// CLAUDE.md に「--no-verify を使うな」と書いても遵守は確率的にしか保証されない
// （CLAUDE.md は指示ではなくコンテキスト）。バイパスされると lint / format / commitlint が
// 素通りするので、ツール実行そのものを止める。

const HOOK_BYPASS_MESSAGE = [
  'git のフック（pre-commit / commit-msg）のバイパスは禁止です。',
  'フックが落ちるのは、lint・format・commitlint のいずれかが通っていないというシグナルです。',
  'バイパスせず、報告されたエラーを直してから再度コミットしてください',
  '（`pnpm lint` / `pnpm format` / `pnpm typecheck` / `pnpm test`）。',
].join('\n');

const input = await readStdin();
const command = input?.tool_input?.command;
if (typeof command !== 'string') {
  process.exit(0);
}

const violation = findHookBypass(command);
if (violation) {
  deny(`\`${violation}\` は使用できません。\n\n${HOOK_BYPASS_MESSAGE}`);
}
process.exit(0);

/**
 * シェルの区切り（&& || ; | 改行）で分割し、git のフックバイパスを含むセグメントを探す。
 * 分割するのは `foo && git commit --no-verify` のような複合コマンドを見逃さないため。
 *
 * @param {string} bashCommand
 * @returns {string | null} 検出したバイパスの表記。無ければ null。
 */
function findHookBypass(bashCommand) {
  for (const segment of bashCommand.split(/&&|\|\||[;|\n]/)) {
    // `git -c core.hooksPath=/dev/null commit` はフックを空にする実質的なバイパス。
    if (/\bgit\b/.test(segment) && /core\.hooksPath\s*=/.test(segment)) {
      return 'git -c core.hooksPath=...';
    }
    if (!/\bgit\b[\s\S]*\bcommit\b/.test(segment)) continue;
    if (/(?:^|\s)--no-verify(?:\s|$|=)/.test(segment)) return 'git commit --no-verify';
    // 短縮フラグは束ねられる（`git commit -nm "msg"`）ので、`--` 始まりでない
    // フラグトークンに n が含まれるかを見る。
    if (/(?:^|\s)-[a-zA-Z]*n[a-zA-Z]*(?=\s|$)/.test(segment)) return 'git commit -n';
  }
  return null;
}

/** @param {string} reason Claude に返す拒否理由。 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

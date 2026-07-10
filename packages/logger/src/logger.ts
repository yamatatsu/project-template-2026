import { AsyncLocalStorage } from 'node:async_hooks';

import { Logger } from '@aws-lambda-powertools/logger';

/** 持続キーに載せてよい値。構造体を丸ごと吐かせないようスカラーに限る（肥大と PII 混入の予防）。 */
export type LogKeys = Record<string, string | number | boolean>;

/** アプリケーションログ。レベルは `POWERTOOLS_LOG_LEVEL`（既定 INFO）で運用側が調整する。 */
export const logger = new Logger();

/** 現在のリクエストに紐づく logger。リクエスト外（起動処理など）ではルートの logger を返す。 */
export function getLogger(): Logger {
  return requestScope.getStore()?.app ?? logger;
}

/**
 * `fn` をリクエストスコープで実行する。合成点の最外周ミドルウェアから 1 回だけ呼ぶ。
 *
 * スコープを切るのは `appendKeys` が Logger インスタンスに残るため（Node サーバでは並行リクエストが
 * 単一の Logger を共有し、他人の `userSub` が混ざる）。詳細は `docs/specs/logs.md`。
 */
export function runInRequestScope<T>(keys: LogKeys, fn: () => T): T {
  const scope: RequestScope = { app: logger.createChild(), audit: auditLogger.createChild() };
  scope.app.appendKeys(keys);
  scope.audit.appendKeys(keys);
  return requestScope.run(scope, fn);
}

/** 以降このリクエストの全ログに載るキーを足す（認証後に判明する `userSub` など）。 */
export function appendRequestKeys(keys: LogKeys): void {
  const scope = requestScope.getStore();
  // スコープ外で呼ばれたら捨てる。ルートの logger に足すと以降の全リクエストに残り続ける。
  if (!scope) {
    return;
  }
  scope.app.appendKeys(keys);
  scope.audit.appendKeys(keys);
}

/** 監査ログの出力先。`audit.ts` からのみ使う（パッケージ内部）。 */
export function getAuditLogger(): Logger {
  return requestScope.getStore()?.audit ?? auditLogger;
}

/**
 * 監査ログ専用インスタンス。コンストラクタ引数は `POWERTOOLS_LOG_LEVEL` より優先されるので、
 * ここでレベルを焼き込むと運用がアプリのログレベルを上げても監査証跡が消えない。
 * レベルの優先順位と、それでも消せる唯一の経路（ALC）は `docs/specs/logs.md`。
 */
const auditLogger = new Logger({ logLevel: 'INFO' });

interface RequestScope {
  readonly app: Logger;
  readonly audit: Logger;
}

const requestScope = new AsyncLocalStorage<RequestScope>();

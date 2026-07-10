import { randomUUID } from 'node:crypto';

import { getLogger, runInRequestScope } from '@icasu/logger';
import type { LambdaContext } from 'hono/aws-lambda';
import { createMiddleware } from 'hono/factory';

/**
 * リクエストスコープのロガーを確立し、全リクエストにアクセスログを 1 行出す。
 * 合成点の最外周に 1 回だけ差す（`/auth` 配下も覆うため）。ここが確立する `requestId` が、
 * アクセスログと監査ログを結ぶ相関キーになる。監査ログをここで出さない理由は `docs/specs/logs.md`。
 */
export const requestLogger = () =>
  createMiddleware(async (c, next) => {
    const isColdStart = coldStart;
    coldStart = false;

    const requestId = lambdaRequestId(c.env) ?? randomUUID();
    const startedAt = performance.now();

    await runInRequestScope({ requestId }, async () => {
      await next();
      getLogger().info('request', {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
        coldStart: isColdStart,
      });
    });
  });

/**
 * Lambda の呼び出し ID。CloudWatch の他のログや X-Ray と突き合わせられるので相関キーに使う。
 * `hono/aws-lambda` が `c.env` に載せるため、Node サーバ実行時（`index.ts`）は存在しない。
 */
function lambdaRequestId(env: unknown): string | undefined {
  return (env as { lambdaContext?: LambdaContext } | undefined)?.lambdaContext?.awsRequestId;
}

// Lambda の初期化を挟んだ最初の呼び出しか。レイテンシの外れ値を説明できるようアクセスログにだけ載せる。
// Powertools の `addContext` に任せない（`createChild` と干渉して常に true になる。`docs/specs/logs.md`）。
let coldStart = true;

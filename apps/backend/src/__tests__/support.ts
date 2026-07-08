/**
 * テスト共通のインフラ（feature 非依存）。DB クライアントの差し替えとマイグレーション適用など、
 * DB に触れるテストならどこからでも使う。特定 feature に閉じたヘルパ（seed 等）はここに置かず、
 * その feature 配下の `__tests__/` に置く。
 *
 * `createTestDbModule` は vi.mock のファクトリから **動的 import 経由で**呼ぶこと
 * （`vi.mock('@icasu/db/client', () => import('../../__tests__/support.ts').then((m) => m.createTestDbModule()))`）。
 * vi.mock ファクトリはファイル先頭へ巻き上げられるため、トップレベル import した関数を直接
 * 参照すると初期化前アクセスになる。動的 import ならその制約を回避できる。
 */

import type { AuthEnv, SessionContext } from '@icasu/backend-auth';
import { type Env, Hono, type Schema } from 'hono';

/** `@icasu/db/client` の差し替えモジュール。PGlite 上の drizzle クライアントを返す。 */
export async function createTestDbModule() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@icasu/db/schema');
  return { db: drizzle(new PGlite(), { schema }) };
}

/** マイグレーションを適用する（各テストの `beforeAll` で呼ぶ）。 */
export async function migrateTestDb(db: unknown) {
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const { migrationsFolder } = await import('@icasu/db/migrations');
  await migrate(db as never, { migrationsFolder });
}

export const JSON_HEADERS = { 'content-type': 'application/json' };

/** テスト用の既定 session。`userSub` を上書きして role 別ケースを作る。 */
export function testSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return { sessionId: 'test-session', userSub: 'test-user', email: undefined, ...overrides };
}

/**
 * ルート単体テスト用ハーネス。本番は合成点の `requireSession` が session を Context に載せるが、
 * ルート単体（`app.request`）にはそれが無く、authZ ミドルウェアが `c.get('session')` で落ちる。
 * リクエスト前に session を注入する薄い親 app で対象ルートを包み、認可まで込みで検証できるようにする。
 */
export function withSession<E extends Env, S extends Schema, P extends string>(
  app: Hono<E, S, P>,
  session: SessionContext,
) {
  return new Hono<AuthEnv>()
    .use('*', (c, next) => {
      c.set('session', session);
      return next();
    })
    .route('/', app);
}

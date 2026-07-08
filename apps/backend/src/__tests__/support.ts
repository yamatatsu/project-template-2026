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

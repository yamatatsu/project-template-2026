import { type Column, sql } from 'drizzle-orm';

// レコードのメタデータ（版・監査タイムスタンプ）は業務ルールと直交する永続化の関心なので、
// ドメイン型に載せず repo が値と対にして運ぶ。値の決定（版の初期値・増分・タイムスタンプ）も
// 各 repo に閉じる（docs/specs/optimistic-lock.md）。
export type Persisted<T> = {
  value: T;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

// 新規行の版の起点。
export const INITIAL_VERSION = 1;

/**
 * 楽観ロックの版を DB 側で 1 つ進める SQL 片。CAS の `WHERE version = expectedVersion` と同じ UPDATE 文で
 * 使うことで、版の一致判定と増分が 1 文の中で原子的に起きる。マッチした行では version === expectedVersion
 * なので、DB 側の `version + 1` はアプリが計算する `expectedVersion + 1` と必ず一致する。
 */
export function incrementVersion({ version }: { version: Column }) {
  return sql`${version} + 1`;
}

/**
 * DB 行（フラット）を、ドメイン値と記録メタデータの対に写す。「ドメイン型 = 行から記録列を除いたもの」
 * という対応が成り立つ間だけ使える（行にドメインへ写さない列を足した entity は個別 mapper に戻す）。
 */
export function toPersisted<Row extends RecordColumns>(
  row: Row,
): Persisted<Omit<Row, keyof RecordColumns>> {
  const { version, createdAt, updatedAt, ...value } = row;
  return { value, version, createdAt, updatedAt };
}

type RecordColumns = { version: number; createdAt: Date; updatedAt: Date };

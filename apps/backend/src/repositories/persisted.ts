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

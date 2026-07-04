/**
 * 例外を throw せずに成否を値で返すための最小の Result 型。
 *
 * 方針（throw ではなく Result を返す・throw してよい境界）は
 * `.claude/rules/result-type.md` と typescript-error-handling skill を参照。
 * ここは「共有される実体」であり、各パッケージで再定義しないこと。
 */

/** 成功。`value` に結果を持つ。 */
export type Ok<T> = { readonly ok: true; readonly value: T };

/** 失敗。`error` に失敗理由を持つ（例外ではなく値として扱う）。 */
export type Err<E> = { readonly ok: false; readonly error: E };

/**
 * 成功か失敗かの直和。`ok` が discriminant なので、`if (!res.ok)` で
 * `res.error` 側・`res.value` 側へ型が絞り込まれる。
 */
export type Result<T, E> = Ok<T> | Err<E>;

// 戻り値を Result<T, E> ではなく Ok<T> / Err<E> にするのは合成のため。
// Ok<T> は任意の E の Result<T, E> に、Err<E> は任意の T の Result<T, E> に代入できるので、
// 呼び出し側で E / T を明示していれば ok(...) / err(...) がそのまま通る。
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

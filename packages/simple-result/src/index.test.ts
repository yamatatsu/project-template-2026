import { describe, expect, expectTypeOf, it } from 'vitest';

import { type Result, err, ok } from './index.ts';

// ユーザー提供のイメージと同じ、失敗しうる関数のサンプル。
function parse(input: string): Result<string, 'empty'> {
  if (input.length === 0) return err('empty');
  return ok(input.toUpperCase());
}

describe('ok / err', () => {
  it('ok は value を持つ成功を作る', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('err は error を持つ失敗を作る', () => {
    expect(err('empty')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('discriminant による narrowing', () => {
  it('res.ok が false のとき error 側へ絞り込まれる', () => {
    const res = parse('');
    if (res.ok) throw new Error('unreachable');
    expectTypeOf(res.error).toEqualTypeOf<'empty'>();
    expect(res.error).toBe('empty');
  });

  it('res.ok が true のとき value 側へ絞り込まれる', () => {
    const res = parse('hello');
    if (!res.ok) throw new Error('unreachable');
    expectTypeOf(res.value).toEqualTypeOf<string>();
    expect(res.value).toBe('HELLO');
  });
});

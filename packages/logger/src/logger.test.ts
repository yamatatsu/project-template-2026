import { afterEach, describe, expect, it, vi } from 'vitest';

import { appendRequestKeys, getLogger, logger, runInRequestScope } from './logger.ts';

/** Powertools は `console.<level>` に JSON 文字列 1 引数で書き出す。 */
function captureInfo() {
  return vi.spyOn(console, 'info').mockImplementation(() => {});
}

function records(spy: ReturnType<typeof captureInfo>): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getLogger', () => {
  it('リクエストスコープ外ではルートの logger を返す', () => {
    expect(getLogger()).toBe(logger);
  });

  it('リクエストスコープ内ではルートとは別の子 logger を返す', () => {
    runInRequestScope({ requestId: 'r-1' }, () => {
      expect(getLogger()).not.toBe(logger);
    });
  });
});

describe('runInRequestScope', () => {
  it('スコープのキーがログに載る', () => {
    const spy = captureInfo();

    runInRequestScope({ requestId: 'r-1' }, () => {
      getLogger().info('hello');
    });

    expect(records(spy)[0]).toMatchObject({ message: 'hello', requestId: 'r-1' });
  });

  // これが無いと Node サーバ実行時（並行リクエスト）に他人の userSub が自分のログに載る。
  it('並行するスコープのキーは互いに混ざらない', async () => {
    const spy = captureInfo();

    const request = async (requestId: string, userSub: string, delayMs: number) =>
      runInRequestScope({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        appendRequestKeys({ userSub });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        getLogger().info('done');
      });

    await Promise.all([request('r-a', 'user-a', 20), request('r-b', 'user-b', 1)]);

    expect(records(spy)).toEqual([
      expect.objectContaining({ requestId: 'r-b', userSub: 'user-b' }),
      expect.objectContaining({ requestId: 'r-a', userSub: 'user-a' }),
    ]);
  });
});

describe('appendRequestKeys', () => {
  it('スコープ外の呼び出しはルートの logger を汚さない', () => {
    const spy = captureInfo();

    appendRequestKeys({ userSub: 'leaked' });
    logger.info('after');

    expect(records(spy)[0]).not.toHaveProperty('userSub');
  });
});

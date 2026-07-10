import { afterEach, describe, expect, it, vi } from 'vitest';

import { auditLog } from './audit.ts';
import { runInRequestScope } from './logger.ts';

function captureInfo() {
  return vi.spyOn(console, 'info').mockImplementation(() => {});
}

function records(spy: ReturnType<typeof captureInfo>): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('auditLog', () => {
  it('logType=audit と action / outcome / actor / target を 1 レコードに出す', () => {
    const spy = captureInfo();

    auditLog({
      action: 'task.deleted',
      outcome: 'success',
      actor: { userSub: 'user-1', role: 'admin' },
      target: { type: 'task', id: 'task-1' },
    });

    expect(records(spy)[0]).toMatchObject({
      logType: 'audit',
      message: 'task.deleted',
      action: 'task.deleted',
      outcome: 'success',
      actor: { userSub: 'user-1', role: 'admin' },
      target: { type: 'task', id: 'task-1' },
    });
  });

  it('リクエストスコープのキー（requestId / userSub）を引き継ぐ', () => {
    const spy = captureInfo();

    runInRequestScope({ requestId: 'r-1' }, () => {
      auditLog({ action: 'authz.denied', outcome: 'failure', reason: 'missing-permission' });
    });

    expect(records(spy)[0]).toMatchObject({ requestId: 'r-1', reason: 'missing-permission' });
  });

  // 監査ログをアプリログと同じインスタンスで出すと、運用がノイズ削減で WARN に上げた瞬間に
  // 証跡が黙って消える。専用インスタンスにレベルを焼き込んである根拠がこれ。
  it('POWERTOOLS_LOG_LEVEL=WARN でアプリログが黙っても監査ログは残る', async () => {
    vi.stubEnv('POWERTOOLS_LOG_LEVEL', 'WARN');
    vi.resetModules();
    const { auditLog: freshAuditLog } = await import('./audit.ts');
    const { getLogger: freshGetLogger } = await import('./logger.ts');
    const spy = captureInfo();

    freshGetLogger().info('診断ログ');
    freshAuditLog({ action: 'task.created', outcome: 'success' });

    expect(records(spy)).toEqual([expect.objectContaining({ action: 'task.created' })]);
  });
});

import { type AuditActor, type AuditOutcome, auditLog } from '@icasu/logger';

/**
 * 認証（authN）の監査イベント名の単一定義源。認可・データ変更の監査イベントはホスト
 * （`apps/backend`）が所有する —— このパッケージは identity までしか知らないため。
 */
export const authAuditActionValues = [
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.logout',
  'auth.session.invalidated',
] as const;
export type AuthAuditAction = (typeof authAuditActionValues)[number];

interface AuthAuditParams {
  readonly outcome?: AuditOutcome;
  readonly actor?: AuditActor;
  /** 失敗の理由タグ。集計できるよう固定語彙で書く。 */
  readonly reason?: string;
}

/** 認証イベントを 1 件記録する。`outcome` の既定は成功。 */
export function auditAuth(action: AuthAuditAction, params: AuthAuditParams = {}): void {
  auditLog({ ...params, action, outcome: params.outcome ?? 'success' });
}

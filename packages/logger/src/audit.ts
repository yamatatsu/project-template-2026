import { getAuditLogger } from './logger.ts';

/** 監査レコードの詳細に載せてよい値。構造体を丸ごと吐かせない（PII 混入と肥大の予防）。 */
export type AuditDetailValue = string | number | boolean | null | readonly string[];

/** 試行の結末。action 名から自明に見えても、「全 failure を横断で引く」ために独立した項目にする。 */
export type AuditOutcome = 'success' | 'failure';

/** 誰が。identity の真実源は IdP なので `userSub` で表し、email は載せない。 */
export interface AuditActor {
  readonly userSub: string;
  readonly role?: string;
}

/** 何に対して。 */
export interface AuditTarget {
  readonly type: string;
  readonly id: string;
}

export interface AuditEvent {
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly actor?: AuditActor;
  readonly target?: AuditTarget;
  /** 失敗の理由タグ（自由文でなく固定語彙で書く。集計できるように）。 */
  readonly reason?: string;
  readonly detail?: Readonly<Record<string, AuditDetailValue>>;
}

/**
 * 監査レコードを 1 件出力する。action の値集合は呼び出し側のパッケージが所有する
 * （このパッケージは形だけを決め、語彙は持たない）。
 */
export function auditLog(event: AuditEvent): void {
  getAuditLogger().info(event.action, { logType: AUDIT_LOG_TYPE, ...event });
}

/** 監査レコードを他のログから選り分ける目印（CloudWatch Logs Insights の `filter logType = "audit"`）。 */
const AUDIT_LOG_TYPE = 'audit';

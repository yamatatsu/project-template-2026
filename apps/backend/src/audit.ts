import { type AuditActor, type AuditDetailValue, type AuditTarget, auditLog } from '@icasu/logger';

import type { User } from './entities/user.ts';

// 監査イベント名の単一定義源。RBAC の action（`authorization.ts` の `actionValues`）とは別物なので
// 混ぜない。認証（authN）のイベントは `@icasu/backend-auth` が所有する。詳細は `docs/specs/logs.md`。
export const auditActionValues = [
  'user.provisioned',
  'authz.denied',
  'task.created',
  'task.updated',
  'task.deleted',
] as const;
export type AuditAction = (typeof auditActionValues)[number];

interface AuditParams {
  readonly target?: AuditTarget;
  /** 既定は成功。失敗を記録するときだけ明示する。 */
  readonly outcome?: 'failure';
  /** 失敗の理由タグ。集計できるよう固定語彙で書く。 */
  readonly reason?: string;
  readonly detail?: Readonly<Record<string, AuditDetailValue>>;
}

/**
 * 監査が Context から読む範囲。`Context<AppEnv>` を直接受け取ると、Hono の Env が `set` を通じて
 * 不変（invariant）なため `Context<AppEnv & AuthEnv>` を渡せない。必要な取り出し口だけを要求する。
 */
interface ActorContext {
  get(key: 'user'): User;
}

/**
 * 状態を変えた事実をハンドラから記録する。actor は authZ が解決した User から採るので、
 * 呼び出し側が「誰が」を渡す余地がない（詐称も取り違えも起こらない）。
 */
export function audit(c: ActorContext, action: AuditAction, params: AuditParams = {}): void {
  auditWithActor(action, c.get('user'), params);
}

/** actor を明示して記録する。User を Context に載せる前の authZ ミドルウェア自身が使う。 */
export function auditWithActor(
  action: AuditAction,
  actor: AuditActor,
  params: AuditParams = {},
): void {
  // 呼び出し側は User をそのまま渡せる（構造的部分型で余剰プロパティが通る）ため、ここで証跡の
  // 形（userSub / role のみ。docs/specs/logs.md「監査レコードの形」）に絞る。絞らないと id や
  // meta までレコードに写り、形が崩れる。
  const { userSub, role } = actor;
  auditLog({ ...params, action, outcome: params.outcome ?? 'success', actor: { userSub, role } });
}

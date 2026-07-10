/**
 * `@icasu/logger` — 構造化ログと監査ログの実体（AWS Lambda Powertools Logger のラッパ）。
 *
 * `apps/*` と `packages/*` が共有する横断的関心事なので、`@icasu/simple-result` と同じく
 * ビルド無しの TS ソースを直接公開する。作業ルールは `packages/logger/CLAUDE.md`、
 * 設計の根拠は `docs/specs/logs.md`。
 */
export {
  type AuditActor,
  type AuditDetailValue,
  type AuditEvent,
  type AuditOutcome,
  type AuditTarget,
  auditLog,
} from './audit.ts';
export { type LogKeys, appendRequestKeys, getLogger, logger, runInRequestScope } from './logger.ts';

/* oxlint-disable no-await-in-loop -- マイグレーションは定義順の逐次適用が正しく、並列化できない */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Result, err, ok } from '@icasu/simple-result';
import { type SQL, sql } from 'drizzle-orm';
import type { QueryResult } from 'pg';

import { db } from '../client.ts';
import { migrationsFolder } from './folder.ts';

/**
 * DSQL 対応の自前マイグレーションランナー。
 *
 * drizzle 標準の `drizzle-orm/node-postgres/migrator` を使わない理由:
 *
 * - migrator はマイグレーションファイル全体を 1 トランザクションで実行するが、Aurora DSQL は
 *   「1 トランザクションにつき DDL は 1 文まで・DDL と DML の混在不可」を課すため拒否される。
 * - migrator の管理テーブル（`drizzle.__drizzle_migrations`）は `SERIAL` を使っており、
 *   これも DSQL では作成できない。
 *
 * そのため `--> statement-breakpoint` で分割した SQL 文を 1 文ずつ（= それぞれ独立した
 * 暗黙トランザクションで）実行し、適用済みタグを自前テーブルに記録する。ローカル Postgres
 * でも同じ経路を使い、環境差を作らない。
 *
 * 制約: ファイル途中で失敗すると「一部適用・記録なし」の状態になり、再実行は同ファイルの
 * 先頭からになる（DSQL では複数 DDL をまとめてロールバックできないため原理的に避けられない）。
 * その場合は失敗した文を直すか DB 側を手で前進させて解消する（forward-only 運用）。
 */

export type MigrateError =
  | { kind: 'file_unreadable'; path: string; cause: unknown }
  | { kind: 'journal_invalid'; path: string }
  | { kind: 'applied_migration_changed'; tag: string }
  | { kind: 'query_failed'; statement: string; cause: unknown };

/** 人が読めるエラーメッセージへ変換する（CLI / Lambda ハンドラ共用）。 */
export function formatMigrateError(error: MigrateError): string {
  switch (error.kind) {
    case 'file_unreadable':
      return `マイグレーションファイルを読み込めません: ${error.path}`;
    case 'journal_invalid':
      return `_journal.json の形式が不正です: ${error.path}`;
    case 'applied_migration_changed':
      return (
        `適用済みマイグレーション ${error.tag} の内容が変更されています。` +
        '適用済みファイルは編集せず、新しいマイグレーションを追加してください'
      );
    case 'query_failed':
      // DB の生エラー（DSQL の制約違反・構文エラー等）を必ず添える。これが無いと statement しか
      // 分からず、CloudFormation Trigger 経由の失敗を原因まで追えない（実際に切り分けを遅らせた）。
      return `SQL の実行に失敗しました: ${error.statement}\n原因: ${describeCause(error.cause)}`;
  }
}

/** 未知の cause（多くは Error / DB ドライバのエラー）から表示用の文字列を取り出す。 */
function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return String(cause);
}

/** 適用済みマイグレーションの管理テーブル。SERIAL を避け tag（ファイル名）を PK にする。 */
const MIGRATIONS_TABLE = '__migrations';

/** drizzle-kit がマイグレーションファイルに挿入する文区切りマーカー。 */
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

/** 未適用のマイグレーションを順に適用し、適用したタグの一覧を返す。 */
export async function runMigrations(): Promise<Result<{ applied: string[] }, MigrateError>> {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journalRes = await readText(journalPath);
  if (!journalRes.ok) return journalRes;

  const tags = parseJournal(journalRes.value);
  if (tags === null) return err({ kind: 'journal_invalid', path: journalPath });

  const ensureTable = await execute(
    sql.raw(
      `create table if not exists ${MIGRATIONS_TABLE} ` +
        '(tag text primary key, hash text not null, applied_at timestamptz not null default now())',
    ),
    `create table ${MIGRATIONS_TABLE}`,
  );
  if (!ensureTable.ok) return ensureTable;

  const appliedRows = await execute(
    sql.raw(`select tag, hash from ${MIGRATIONS_TABLE}`),
    `select from ${MIGRATIONS_TABLE}`,
  );
  if (!appliedRows.ok) return appliedRows;

  const appliedHashByTag = new Map<string, string>();
  for (const row of appliedRows.value.rows) {
    appliedHashByTag.set(String(row.tag), String(row.hash));
  }

  const applied: string[] = [];
  for (const tag of tags) {
    const path = join(migrationsFolder, `${tag}.sql`);
    const contentRes = await readText(path);
    if (!contentRes.ok) return contentRes;

    const hash = createHash('sha256').update(contentRes.value).digest('hex');
    const appliedHash = appliedHashByTag.get(tag);
    if (appliedHash !== undefined) {
      if (appliedHash !== hash) return err({ kind: 'applied_migration_changed', tag });
      continue;
    }

    for (const statement of splitStatements(contentRes.value)) {
      const res = await execute(sql.raw(statement), statement);
      if (!res.ok) return res;
    }

    const record = await execute(
      sql`insert into ${sql.raw(MIGRATIONS_TABLE)} (tag, hash) values (${tag}, ${hash})`,
      `record migration ${tag}`,
    );
    if (!record.ok) return record;

    applied.push(tag);
  }

  return ok({ applied });
}

async function readText(path: string): Promise<Result<string, MigrateError>> {
  try {
    return ok(await readFile(path, 'utf8'));
  } catch (cause) {
    return err({ kind: 'file_unreadable', path, cause });
  }
}

/** ライブラリが throw する境界。その場で Result に変換して以降へ流す。 */
async function execute(
  query: SQL,
  statement: string,
): Promise<Result<QueryResult<Record<string, unknown>>, MigrateError>> {
  try {
    return ok(await db.execute(query));
  } catch (cause) {
    return err({ kind: 'query_failed', statement, cause });
  }
}

/** `_journal.json` から適用順のタグ一覧を取り出す。形式が想定外なら null。 */
function parseJournal(content: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;

  const tags: string[] = [];
  for (const entry of entries) {
    const tag = (entry as { tag?: unknown } | null)?.tag;
    if (typeof tag !== 'string') return null;
    tags.push(tag);
  }
  return tags;
}

function splitStatements(content: string): string[] {
  return content
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

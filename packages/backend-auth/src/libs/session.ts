import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import type { AuthConfig } from './config.ts';

/**
 * DynamoDB を使ったセッション & 一時 state ストア。
 *
 * 単一テーブルを `pk` で名前空間分けする:
 *  - `sess#<sessionId>` — ユーザーのトークン（サーバ側のみ）。
 *  - `state#<state>`    — ログインリダイレクト中だけ生きる PKCE/nonce データ。
 *
 * `ttl`（epoch 秒）が DynamoDB TTL を駆動する。DynamoDB Local は実際にはアイテムを失効
 * させないため、読み取り時にも `ttl` を明示的にチェックする。
 */
const STATE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface PendingAuth {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly returnTo: string;
}

export interface SessionData {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly idToken: string;
  /** アクセストークンが失効する時刻（epoch 秒）。 */
  readonly accessTokenExpiresAt: number;
  readonly userSub: string;
  readonly email: string | undefined;
}

export interface SessionStore {
  saveState(state: string, data: PendingAuth): Promise<void>;
  /** 認証途中の state を読み取り、同時に削除する（ワンタイム利用）。 */
  consumeState(state: string): Promise<PendingAuth | undefined>;
  saveSession(sessionId: string, data: SessionData): Promise<void>;
  getSession(sessionId: string): Promise<SessionData | undefined>;
  deleteSession(sessionId: string): Promise<void>;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** セッションストアを組み立てる。DynamoDB document client は1つだけ開く。 */
export function createSessionStore(cfg: AuthConfig['dynamo']): SessionStore {
  const client = new DynamoDBClient({
    region: cfg.region,
    ...(cfg.endpoint
      ? {
          endpoint: cfg.endpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  const doc = DynamoDBDocumentClient.from(client);
  const tableName = cfg.tableName;

  return {
    async saveState(state, data) {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: `state#${state}`, ...data, ttl: nowSeconds() + STATE_TTL_SECONDS },
        }),
      );
    },
    async consumeState(state) {
      // Get→Delete の 2 コマンドだと並行する callback が同じ state を両方読めてしまう。
      // Delete の ReturnValues: ALL_OLD で「削除できた側だけが中身を得る」1 コマンドにし、
      // ワンタイム消費（CSRF・リプレイ対策の前提）をアトミックにする。
      const res = await doc.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: `state#${state}` },
          ReturnValues: 'ALL_OLD',
        }),
      );
      const item = res.Attributes;
      if (!item) return undefined;
      if (typeof item.ttl === 'number' && item.ttl < nowSeconds()) return undefined;
      return {
        codeVerifier: item.codeVerifier,
        nonce: item.nonce,
        returnTo: item.returnTo,
      };
    },
    async saveSession(sessionId, data) {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: `sess#${sessionId}`, ...data, ttl: nowSeconds() + SESSION_TTL_SECONDS },
        }),
      );
    },
    async getSession(sessionId) {
      const res = await doc.send(
        new GetCommand({ TableName: tableName, Key: { pk: `sess#${sessionId}` } }),
      );
      if (!res.Item) return undefined;
      if (typeof res.Item.ttl === 'number' && res.Item.ttl < nowSeconds()) return undefined;
      return {
        accessToken: res.Item.accessToken,
        refreshToken: res.Item.refreshToken,
        idToken: res.Item.idToken,
        accessTokenExpiresAt: res.Item.accessTokenExpiresAt,
        userSub: res.Item.userSub,
        email: res.Item.email,
      };
    },
    async deleteSession(sessionId) {
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk: `sess#${sessionId}` } }));
    },
  };
}

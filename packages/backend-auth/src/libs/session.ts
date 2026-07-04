import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import type { AuthConfig } from './config.ts';

/**
 * DynamoDB-backed session & transient-state store.
 *
 * Single table, namespaced by `pk`:
 *  - `sess#<sessionId>` — the user's tokens (server-side only).
 *  - `state#<state>`    — short-lived PKCE/nonce data during the login redirect.
 *
 * `ttl` (epoch seconds) drives DynamoDB TTL. DynamoDB Local does not actually
 * expire items, so reads also check `ttl` explicitly.
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
  /** Epoch seconds at which the access token expires. */
  readonly accessTokenExpiresAt: number;
  readonly userSub: string;
  readonly email: string | undefined;
}

export interface SessionStore {
  saveState(state: string, data: PendingAuth): Promise<void>;
  /** Read the pending-auth state and delete it (one-time use). */
  consumeState(state: string): Promise<PendingAuth | undefined>;
  saveSession(sessionId: string, data: SessionData): Promise<void>;
  getSession(sessionId: string): Promise<SessionData | undefined>;
  deleteSession(sessionId: string): Promise<void>;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Build the session store, opening a single DynamoDB document client. */
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
      const key = `state#${state}`;
      const res = await doc.send(new GetCommand({ TableName: tableName, Key: { pk: key } }));
      if (!res.Item) return undefined;
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk: key } }));
      if (typeof res.Item.ttl === 'number' && res.Item.ttl < nowSeconds()) return undefined;
      return {
        codeVerifier: res.Item.codeVerifier,
        nonce: res.Item.nonce,
        returnTo: res.Item.returnTo,
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

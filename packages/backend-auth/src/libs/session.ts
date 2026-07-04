import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

import { getAuthConfig } from './config.ts';

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

let doc: DynamoDBDocumentClient | undefined;

function getDoc(): DynamoDBDocumentClient {
  if (!doc) {
    const cfg = getAuthConfig();
    const client = new DynamoDBClient({
      region: cfg.dynamo.region,
      ...(cfg.dynamo.endpoint
        ? {
            endpoint: cfg.dynamo.endpoint,
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          }
        : {}),
    });
    doc = DynamoDBDocumentClient.from(client);
  }
  return doc;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function tableName(): string {
  return getAuthConfig().dynamo.tableName;
}

// --- Transient login state -------------------------------------------------

export interface PendingAuth {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly returnTo: string;
}

export async function saveState(state: string, data: PendingAuth): Promise<void> {
  await getDoc().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: `state#${state}`, ...data, ttl: nowSeconds() + STATE_TTL_SECONDS },
    }),
  );
}

/** Read the pending-auth state and delete it (one-time use). */
export async function consumeState(state: string): Promise<PendingAuth | undefined> {
  const key = `state#${state}`;
  const res = await getDoc().send(new GetCommand({ TableName: tableName(), Key: { pk: key } }));
  if (!res.Item) return undefined;
  await getDoc().send(new DeleteCommand({ TableName: tableName(), Key: { pk: key } }));
  if (typeof res.Item.ttl === 'number' && res.Item.ttl < nowSeconds()) return undefined;
  return {
    codeVerifier: res.Item.codeVerifier,
    nonce: res.Item.nonce,
    returnTo: res.Item.returnTo,
  };
}

// --- Session ---------------------------------------------------------------

export interface SessionData {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly idToken: string;
  /** Epoch seconds at which the access token expires. */
  readonly accessTokenExpiresAt: number;
  readonly userSub: string;
  readonly email: string | undefined;
}

export async function saveSession(sessionId: string, data: SessionData): Promise<void> {
  await getDoc().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: `sess#${sessionId}`, ...data, ttl: nowSeconds() + SESSION_TTL_SECONDS },
    }),
  );
}

export async function getSession(sessionId: string): Promise<SessionData | undefined> {
  const res = await getDoc().send(
    new GetCommand({ TableName: tableName(), Key: { pk: `sess#${sessionId}` } }),
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
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDoc().send(
    new DeleteCommand({ TableName: tableName(), Key: { pk: `sess#${sessionId}` } }),
  );
}

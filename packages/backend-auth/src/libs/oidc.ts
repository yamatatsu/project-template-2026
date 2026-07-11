import type { AuthConfig } from './config.ts';

/** プロバイダのトークンエンドポイントが返すトークン一式。 */
export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly idToken: string;
  /** アクセストークンの有効期間（秒）。 */
  readonly expiresIn: number;
}

/** トークンエンドポイントのエラー。`isInvalidGrant` はリフレッシュトークンが使えないことを示す。 */
export class TokenError extends Error {
  readonly status: number;
  readonly body: string;

  // 注: constructor parameter properties ではなく明示的なフィールド代入にしている。
  // Node の strip-only な TypeScript 実行が前者をサポートしないため。
  constructor(status: number, body: string) {
    super(`Token endpoint error (${status}): ${body}`);
    this.name = 'TokenError';
    this.status = status;
    this.body = body;
  }

  get isInvalidGrant(): boolean {
    // RFC 6749 §5.2: トークンエンドポイントのエラーは JSON ボディの `error` メンバーで運ばれる。
    // 文字列一致（includes）だと error_description 内の言及だけでも真になるため、パースして判定する。
    try {
      return (JSON.parse(this.body) as { error?: unknown }).error === 'invalid_grant';
    } catch {
      return false;
    }
  }
}

export interface OidcClient {
  /** プロバイダの `/authorize` リダイレクト URL を組み立てる（authorization code + PKCE）。 */
  buildAuthorizeUrl(params: { state: string; nonce: string; codeChallenge: string }): string;
  /** authorization code をトークンに交換する（PKCE verifier 付き）。 */
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  /** リフレッシュトークンを新しいトークン一式に交換する。 */
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  /**
   * プロバイダのログアウト URL を組み立てる。テンプレート（`AUTH_LOGOUT_URL`）中の
   * `{redirect}` はアプリのベース URL に、`{id_token_hint}` は現在のセッションの id_token に置換する。
   * id_token_hint は OIDC RP-initiated logout でプロバイダが `post_logout_redirect_uri` を検証する
   * のに要る（Duende 等）。テンプレートに該当プレースホルダが無いプロバイダ（Cognito）では未使用。
   */
  buildLogoutUrl(idTokenHint?: string): string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
}

/** プロバイダ設定に束縛された OIDC クライアントを組み立てる。 */
export function createOidcClient(cfg: AuthConfig): OidcClient {
  const { oidc } = cfg;

  async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
    // Confidential client: HTTP Basic（client_id:client_secret）で認証する。
    const basic = Buffer.from(`${oidc.clientId}:${oidc.clientSecret}`).toString('base64');
    const res = await fetch(oidc.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basic}`,
      },
      body,
    });

    if (!res.ok) {
      throw new TokenError(res.status, await res.text());
    }

    const json = (await res.json()) as TokenResponse;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      idToken: json.id_token,
      expiresIn: json.expires_in,
    };
  }

  return {
    buildAuthorizeUrl(params) {
      const url = new URL(oidc.authorizeUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', oidc.clientId);
      url.searchParams.set('redirect_uri', cfg.redirectUri);
      url.searchParams.set('scope', oidc.scopes);
      url.searchParams.set('state', params.state);
      url.searchParams.set('nonce', params.nonce);
      url.searchParams.set('code_challenge', params.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    },
    exchangeCode(code, codeVerifier) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
          code_verifier: codeVerifier,
        }),
      );
    },
    refreshTokens(refreshToken) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );
    },
    buildLogoutUrl(idTokenHint?: string) {
      return cfg.logoutUrl
        .replace('{redirect}', encodeURIComponent(cfg.appBaseUrl))
        .replace('{id_token_hint}', idTokenHint ? encodeURIComponent(idTokenHint) : '');
    },
  };
}

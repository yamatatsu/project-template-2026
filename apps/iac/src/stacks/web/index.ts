import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { Stack, type StackProps } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

import { Api } from './api.ts';
import { Cdn } from './cdn.ts';
import { Cognito } from './cognito.ts';
import { Sessions } from './sessions.ts';

export interface WebStackProps extends StackProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
  /** {@link DbStack} の DSQL クラスタ。 */
  readonly dsqlCluster: ICluster;
}

/**
 * Web スタック — すべてを単一の CloudFront distribution の背後で配信する:
 *
 *  - 認証用の Cognito（user pool + hosted UI クライアント）。
 *  - 静的 SPA は S3（private、OAC）から配信。クライアントサイドルートが
 *    `index.html` に解決されるよう CloudFront Function でフォールバックする。
 *  - API Gateway（HTTP API）+ Hono バックエンドを動かす Lambda。
 *  - CloudFront は `/api/*` を API Gateway へ転送（プレフィックスは CloudFront
 *    Function で除去）し、API と静的コンテンツが単一オリジンを共有する。
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // --- API Gateway + Lambda（Hono） -------------------------------------
    const api = new Api(this, 'Api', {
      stage: props.stage,
      dsqlCluster: props.dsqlCluster,
    });

    // --- CloudFront（静的 SPA + /api プロキシ） ----------------------------
    const cdn = new Cdn(this, 'Cdn', {
      stage: props.stage,
      apiHost: api.apiHost,
    });

    // --- Cognito（コールバックに CloudFront の URL が必要） -----------------
    const cognito = new Cognito(this, 'Cognito', {
      stage: props.stage,
      appUrl: cdn.appUrl,
    });

    // --- セッションストア（DynamoDB）+ Cookie 署名シークレット --------------
    const sessions = new Sessions(this, 'Sessions', { stage: props.stage });
    const cookieSecret = new Secret(this, 'CookieSecret', {
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    // --- BFF Lambda の配線: セッションストア・OIDC 設定・ルート -------------
    // API Gateway の authorizer は付けない — ブラウザはセッション Cookie しか持たず、
    // 認証は Lambda 内の Hono セッションミドルウェアが行う。クライアントシークレットと
    // Cookie シークレットは Lambda の環境変数として注入する（保存時は KMS で暗号化）。
    // 将来の強化策として、実行時に Secrets Manager から読む方式に変える余地がある。
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${cognito.userPool.userPoolId}`;
    api.grantSessionStore(sessions.table);
    api.addEnvironment({
      OIDC_ISSUER: issuer,
      OIDC_AUTHORIZE_URL: `${cognito.domainBaseUrl}/oauth2/authorize`,
      OIDC_TOKEN_URL: `${cognito.domainBaseUrl}/oauth2/token`,
      OIDC_JWKS_URL: `${issuer}/.well-known/jwks.json`,
      OIDC_CLIENT_ID: cognito.userPoolClient.userPoolClientId,
      OIDC_CLIENT_SECRET: cognito.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      OIDC_SCOPES: 'openid email profile',
      AUTH_REDIRECT_URI: `${cdn.appUrl}/api/auth/callback`,
      AUTH_LOGOUT_URL: `${cognito.domainBaseUrl}/logout?client_id=${cognito.userPoolClient.userPoolClientId}&logout_uri={redirect}`,
      APP_BASE_URL: cdn.appUrl,
      COOKIE_NAME: '__Host-sid',
      COOKIE_SECURE: 'true',
      COOKIE_SECRET: cookieSecret.secretValue.unsafeUnwrap(),
      SESSION_TABLE_NAME: sessions.table.tableName,
    });
    api.addRoutes();
  }
}

import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  OAuthScope,
  UserPool,
  type UserPoolClient,
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
  /** CloudFront の URL。アプリクライアントの OAuth コールバック / ログアウト URL に使う。 */
  readonly appUrl: string;
}

/**
 * 認証用の Cognito user pool + hosted UI クライアント。
 *
 * アプリクライアントはコールバック / ログアウト URL に CloudFront の URL を必要と
 * するため、この construct は distribution ができた後に作成する。
 */
export class Cognito extends Construct {
  /** User pool。 */
  readonly userPool: UserPool;
  /** Hosted UI 用の Web アプリクライアント。 */
  readonly userPoolClient: UserPoolClient;
  /** Hosted UI のベース URL（`https://<prefix>.auth.<region>.amazoncognito.com`）。 */
  readonly domainBaseUrl: string;

  constructor(scope: Construct, id: string, props: CognitoProps) {
    super(scope, id);

    const { account } = Stack.of(this);
    const isProd = props.stage === 'prod';

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      userVerification: { emailStyle: VerificationEmailStyle.CODE },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const domain = this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: `icasu-${props.stage}-${account}` },
    });
    this.domainBaseUrl = domain.baseUrl();

    // Confidential クライアント（`generateSecret`）: BFF がクライアントシークレットで
    // token endpoint に対して認証するため、ブラウザは一切トークンを持たない。
    // コールバック URL は SPA ではなく BFF の OAuth 遷移ルート（`/auth/callback`）を指す。
    // localhost の URL はローカル BFF 向け（Vite が `/api`・`/auth` を BFF にプロキシする）。
    this.userPoolClient = this.userPool.addClient('WebClient', {
      generateSecret: true,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [`${props.appUrl}/auth/callback`, 'http://localhost:5001/auth/callback'],
        logoutUrls: [props.appUrl, 'http://localhost:5001'],
      },
    });
  }
}

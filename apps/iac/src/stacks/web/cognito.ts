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
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
  /** CloudFront URL, used for the app client's OAuth callback/logout URLs. */
  readonly appUrl: string;
}

/**
 * Cognito user pool + hosted UI client for authentication.
 *
 * The app client needs the CloudFront URL for its callback/logout URLs, so this
 * construct is created after the distribution exists.
 */
export class Cognito extends Construct {
  /** The user pool. */
  readonly userPool: UserPool;
  /** The hosted-UI web app client. */
  readonly userPoolClient: UserPoolClient;

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

    this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: `icasu-${props.stage}-${account}` },
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [props.appUrl, 'http://localhost:5173'],
        logoutUrls: [props.appUrl, 'http://localhost:5173'],
      },
    });
  }
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, type IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AccountRecovery,
  OAuthScope,
  UserPool,
  type UserPoolClient,
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const here = fileURLToPath(new URL('.', import.meta.url));
const LAMBDA_ENTRY = join(here, '../lambda/api.ts');
const DEPS_LOCK_FILE = join(here, '../../../pnpm-lock.yaml');
const FRONTEND_DIST = join(here, '../../frontend/dist');
const STRIP_API_FN = join(here, '../cloudfront/strip-api-prefix.js');
const SPA_FALLBACK_FN = join(here, '../cloudfront/spa-fallback.js');

export interface WebStackProps extends StackProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
  /** Attach the Cognito JWT authorizer to `/api/*` routes. */
  readonly apiAuth: boolean;
  /** DSQL cluster endpoint from {@link DbStack}. */
  readonly dsqlEndpoint: string;
  /** DSQL cluster ARN from {@link DbStack}, for the IAM connect grant. */
  readonly dsqlClusterArn: string;
}

/**
 * Web stack — everything served behind a single CloudFront distribution:
 *
 *  - Cognito (user pool + hosted UI client) for authentication.
 *  - S3 (private, OAC) for the static SPA, with a CloudFront Function fallback
 *    so client-side routes resolve to `index.html`.
 *  - API Gateway (HTTP API) + Lambda running the Hono backend.
 *  - CloudFront forwards `/api/*` to API Gateway (prefix stripped by a
 *    CloudFront Function) so API and static content share one origin.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const isProd = props.stage === 'prod';

    // --- Cognito ----------------------------------------------------------
    const userPool = new UserPool(this, 'UserPool', {
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

    userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: `icasu-${props.stage}-${this.account}` },
    });

    // --- API Lambda (Hono) ------------------------------------------------
    const apiFn = new NodejsFunction(this, 'ApiFn', {
      entry: LAMBDA_ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: {
        DSQL_ENDPOINT: props.dsqlEndpoint,
        DSQL_REGION: this.region,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        format: OutputFormat.CJS,
        target: 'node22',
        sourceMap: true,
        // pg lazily requires its optional native binding; keep it external.
        externalModules: ['pg-native'],
      },
    });

    // Connect to DSQL with a short-lived IAM token (admin role).
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['dsql:DbConnectAdmin'],
        resources: [props.dsqlClusterArn],
      }),
    );

    // --- HTTP API ---------------------------------------------------------
    const httpApi = new HttpApi(this, 'HttpApi', {
      description: `${props.stage} task API`,
    });
    const apiHost = `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`;
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn);

    // --- Static site bucket ----------------------------------------------
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // --- CloudFront -------------------------------------------------------
    const stripApiFn = new cloudfront.Function(this, 'StripApiPrefixFn', {
      code: cloudfront.FunctionCode.fromFile({ filePath: STRIP_API_FN }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });
    const spaFallbackFn = new cloudfront.Function(this, 'SpaFallbackFn', {
      code: cloudfront.FunctionCode.fromFile({ filePath: SPA_FALLBACK_FN }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${props.stage} app (SPA + /api)`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: spaFallbackFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiHost, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forward Authorization etc. to the API, but let CloudFront set the
          // Host header so API Gateway routes the request correctly.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            {
              function: stripApiFn,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
    });

    const appUrl = `https://${distribution.distributionDomainName}`;

    // --- Cognito app client (needs the CloudFront URL for callbacks) ------
    const userPoolClient: UserPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [appUrl, 'http://localhost:5173'],
        logoutUrls: [appUrl, 'http://localhost:5173'],
      },
    });

    // --- API routes (optionally protected by Cognito) ---------------------
    const authorizer: IHttpRouteAuthorizer | undefined = props.apiAuth
      ? new HttpJwtAuthorizer(
          'JwtAuthorizer',
          `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
          { jwtAudience: [userPoolClient.userPoolClientId] },
        )
      : undefined;

    for (const path of ['/', '/{proxy+}']) {
      httpApi.addRoutes({ path, methods: [HttpMethod.ANY], integration, authorizer });
    }

    // --- Optional: upload a pre-built frontend ----------------------------
    if (existsSync(FRONTEND_DIST)) {
      new BucketDeployment(this, 'DeploySite', {
        sources: [Source.asset(FRONTEND_DIST)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
      });
    }

    // --- Outputs ----------------------------------------------------------
    new CfnOutput(this, 'AppUrl', { value: appUrl });
    new CfnOutput(this, 'ApiEndpoint', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'ApiAuthEnabled', { value: String(props.apiAuth) });
  }
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { type IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

import { Api } from './api.ts';
import { Cognito } from './cognito.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND_DIST = join(here, '../../../../frontend/dist');
const STRIP_API_FN = join(here, '../../../cloudfront/strip-api-prefix.js');
const SPA_FALLBACK_FN = join(here, '../../../cloudfront/spa-fallback.js');

export interface WebStackProps extends StackProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
  /** Attach the Cognito JWT authorizer to `/api/*` routes. */
  readonly apiAuth: boolean;
  /** DSQL cluster from {@link DbStack}, for the IAM connect grant. */
  readonly dsqlCluster: ICluster;
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

    // --- API Gateway + Lambda (Hono) -------------------------------------
    const api = new Api(this, 'Api', {
      stage: props.stage,
      dsqlCluster: props.dsqlCluster,
    });

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
          origin: new origins.HttpOrigin(api.apiHost, {
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

    // --- Cognito (needs the CloudFront URL for callbacks) -----------------
    const cognito = new Cognito(this, 'Cognito', {
      stage: props.stage,
      appUrl,
    });

    // --- API routes (optionally protected by Cognito) ---------------------
    const authorizer: IHttpRouteAuthorizer | undefined = props.apiAuth
      ? new HttpJwtAuthorizer(
          'JwtAuthorizer',
          `https://cognito-idp.${this.region}.amazonaws.com/${cognito.userPool.userPoolId}`,
          { jwtAudience: [cognito.userPoolClient.userPoolClientId] },
        )
      : undefined;

    api.addRoutes(authorizer);

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
    new CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
    new CfnOutput(this, 'UserPoolId', { value: cognito.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: cognito.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'ApiAuthEnabled', { value: String(props.apiAuth) });
  }
}

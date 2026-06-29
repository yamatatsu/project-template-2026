import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type { Construct } from 'constructs';

import { Api } from './api.ts';
import { Cdn } from './cdn.ts';
import { Cognito } from './cognito.ts';

export interface WebStackProps extends StackProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
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

    // --- API Gateway + Lambda (Hono) -------------------------------------
    const api = new Api(this, 'Api', {
      stage: props.stage,
      dsqlCluster: props.dsqlCluster,
    });

    // --- CloudFront (static SPA + /api proxy) ----------------------------
    const cdn = new Cdn(this, 'Cdn', {
      stage: props.stage,
      apiHost: api.apiHost,
    });

    // --- Cognito (needs the CloudFront URL for callbacks) -----------------
    const cognito = new Cognito(this, 'Cognito', {
      stage: props.stage,
      appUrl: cdn.appUrl,
    });

    // --- API routes (always protected by the Cognito JWT authorizer) ------
    const authorizer = new HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${cognito.userPool.userPoolId}`,
      { jwtAudience: [cognito.userPoolClient.userPoolClientId] },
    );

    api.addRoutes(authorizer);

    // --- Outputs ----------------------------------------------------------
    new CfnOutput(this, 'AppUrl', { value: cdn.appUrl });
    new CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
    new CfnOutput(this, 'SiteBucketName', { value: cdn.siteBucket.bucketName });
    new CfnOutput(this, 'UserPoolId', { value: cognito.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: cognito.userPoolClient.userPoolClientId });
  }
}

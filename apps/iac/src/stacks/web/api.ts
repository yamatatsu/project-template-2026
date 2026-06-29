import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { Duration, Stack } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, type IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

const here = fileURLToPath(new URL('.', import.meta.url));
const LAMBDA_ENTRY = join(here, '../../../../backend/src/lambda.ts');
const DEPS_LOCK_FILE = join(here, '../../../../../pnpm-lock.yaml');

export interface ApiProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
  /** DSQL cluster from {@link DbStack}. */
  readonly dsqlCluster: ICluster;
}

/**
 * API Gateway (HTTP API) + Lambda running the Hono backend.
 *
 * Routes are not added in the constructor: the JWT authorizer depends on the
 * CloudFront URL (via Cognito), which in turn depends on this API's host. Call
 * {@link addRoutes} once the authorizer is known.
 */
export class Api extends Construct {
  /** Lambda-backed HTTP API. */
  readonly httpApi: HttpApi;
  /** API Gateway host (`<id>.execute-api.<region>.amazonaws.com`). */
  readonly apiHost: string;
  /** Public API endpoint URL. */
  readonly apiEndpoint: string;

  private readonly integration: HttpLambdaIntegration;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { region } = Stack.of(this);

    const apiFn = new NodejsFunction(this, 'ApiFn', {
      entry: LAMBDA_ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: {
        DSQL_ENDPOINT: props.dsqlCluster.clusterEndpoint,
        DSQL_REGION: region,
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

    props.dsqlCluster.grantConnect(apiFn);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      description: `${props.stage} task API`,
    });
    this.apiHost = `${this.httpApi.apiId}.execute-api.${region}.amazonaws.com`;
    this.apiEndpoint = this.httpApi.apiEndpoint;
    this.integration = new HttpLambdaIntegration('ApiIntegration', apiFn);
  }

  /** Wire the proxy routes, protected by a Cognito JWT authorizer. */
  addRoutes(authorizer: IHttpRouteAuthorizer): void {
    for (const path of ['/', '/{proxy+}']) {
      this.httpApi.addRoutes({
        path,
        methods: [HttpMethod.ANY],
        integration: this.integration,
        authorizer,
      });
    }
  }
}

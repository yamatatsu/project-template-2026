import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const here = fileURLToPath(new URL('.', import.meta.url));
const LAMBDA_ENTRY = join(here, '../../../../backend/src/lambda.ts');
const DEPS_LOCK_FILE = join(here, '../../../../../pnpm-lock.yaml');

export interface ApiProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
  /** {@link DbStack} の DSQL クラスタ。 */
  readonly dsqlCluster: ICluster;
}

/**
 * API Gateway（HTTP API）+ Hono バックエンド（BFF）を動かす Lambda。
 *
 * ルートと OIDC 環境変数はコンストラクタでは追加しない: それらの設定は
 * （Cognito 経由で）CloudFront の URL に依存し、その CloudFront はこの API の
 * ホストに依存するため。Cognito とセッションストアが揃ってから
 * {@link addEnvironment} / {@link grantSessionStore} / {@link addRoutes} を呼ぶこと。
 */
export class Api extends Construct {
  /** API Gateway のホスト（`<id>.execute-api.<region>.amazonaws.com`）。 */
  readonly apiHost: string;

  private readonly httpApi: HttpApi;
  private readonly integration: HttpLambdaIntegration;
  private readonly apiFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { region } = Stack.of(this);
    const isProd = props.stage === 'prod';

    // 監査ログ（logType=audit）がここに流れるため、保持期間はデバッグの都合ではなく証跡の
    // 要件で決める。LogGroup の既定 removalPolicy は RETAIN だが、他のリソース（Sessions）と
    // そろえて stage で明示する。
    const logGroup = new LogGroup(this, 'ApiFnLogs', {
      retention: isProd ? RetentionDays.ONE_YEAR : RetentionDays.ONE_WEEK,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Lambda Advanced Logging Controls（applicationLogLevelV2）は設定しない。有効にすると Lambda が
    // AWS_LAMBDA_LOG_LEVEL を注入し、監査ログのレベル固定を貫通して証跡が黙って消える（docs/specs/logs.md）。
    this.apiFn = new NodejsFunction(this, 'ApiFn', {
      entry: LAMBDA_ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      depsLockFilePath: DEPS_LOCK_FILE,
      logGroup,
      environment: {
        DSQL_ENDPOINT: props.dsqlCluster.clusterEndpoint,
        DSQL_REGION: region,
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: 'backend',
        POWERTOOLS_LOG_LEVEL: 'INFO',
      },
      bundling: {
        format: OutputFormat.CJS,
        target: 'node24',
        sourceMap: true,
        // pg はオプショナルなネイティブバインディングを遅延 require するため external に残す。
        externalModules: ['pg-native'],
      },
    });

    // Lambda は admin ロールで接続するため admin の connect 権限を付与する
    // （packages/db/src/client.ts は DSQL_USER 未設定時に admin + admin トークンを使う。
    // grant と接続ロールは必ず揃えること）。
    // TODO: AWS は admin を日常運用に使わずカスタム DB ロール + dsql:DbConnect を推奨。
    // 将来 app 用ロールを作成し DSQL_USER を渡したうえで grantConnect に切り替える。
    props.dsqlCluster.grantConnectAdmin(this.apiFn);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      description: `${props.stage} task API`,
    });
    this.apiHost = `${this.httpApi.apiId}.execute-api.${region}.amazonaws.com`;
    this.integration = new HttpLambdaIntegration('ApiIntegration', this.apiFn);
  }

  /** ランタイム環境変数を注入する（Cognito / DynamoDB が揃った後に呼ぶ）。 */
  addEnvironment(vars: Record<string, string>): void {
    for (const [key, value] of Object.entries(vars)) {
      this.apiFn.addEnvironment(key, value);
    }
  }

  /** Lambda にセッションストアへの読み書き権限を付与する。 */
  grantSessionStore(table: ITable): void {
    table.grantReadWriteData(this.apiFn);
  }

  /**
   * プロキシルートを配線する。API Gateway の authorizer は付けない: これは BFF であり、
   * ブラウザはセッション Cookie しか持たない（JWT を持たない）ため。認証は Lambda 内の
   * Hono セッションミドルウェアが行う。
   */
  addRoutes(): void {
    for (const path of ['/', '/{proxy+}']) {
      this.httpApi.addRoutes({
        path,
        methods: [HttpMethod.ANY],
        integration: this.integration,
      });
    }
  }
}

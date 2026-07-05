import { Cluster } from '@aws-cdk/aws-dsql-alpha';
import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { Migration } from './migration.ts';

export interface DbStackProps extends StackProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
}

/**
 * データベーススタック: 単一リージョンの Aurora DSQL クラスタ。
 *
 * DSQL はサーバーレスな分散 PostgreSQL 互換データベース。`@aws-cdk/aws-dsql-alpha` の
 * L2 `Cluster` construct を使うと、クラスタの ARN / エンドポイントが属性として得られ、
 * `grantConnect*` ヘルパーも提供される。
 *
 * 接続は短命な IAM トークンで認証する（固定パスワードなし）— ランタイムでのトークン
 * 生成方法は `packages/db/src/client.ts` を参照。
 */
export class DbStack extends Stack {
  /** DSQL クラスタリソース。 */
  readonly cluster: Cluster;

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props);

    const isProd = props.stage === 'prod';

    this.cluster = new Cluster(this, 'Cluster', {
      clusterName: `${props.stage}-app-db`,
      // 誤った `cdk destroy` から本番データを守る。
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // デプロイ内で drizzle マイグレーションを適用する（WebStack はこのスタックに依存する
    // ため、新しいアプリコードが公開される前にスキーマ適用が完了する）。
    new Migration(this, 'Migration', { cluster: this.cluster });
  }
}

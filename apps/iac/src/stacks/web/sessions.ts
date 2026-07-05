import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, type ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface SessionsProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
}

/**
 * BFF 用の DynamoDB セッションストア。
 *
 * 単一テーブルにセッション（`sess#<id>`）と短命なログイン state（`state#<state>`）の
 * 両方を持ち、パーティションキー `pk` で区別する。期限切れのアイテムは `ttl` 属性に
 * 対する DynamoDB TTL が掃除する。
 */
export class Sessions extends Construct {
  /** セッションテーブル。 */
  readonly table: ITable;

  constructor(scope: Construct, id: string, props: SessionsProps) {
    super(scope, id);

    const isProd = props.stage === 'prod';

    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
  }
}

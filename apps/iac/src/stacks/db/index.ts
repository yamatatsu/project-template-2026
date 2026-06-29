import { Cluster } from '@aws-cdk/aws-dsql-alpha';
import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface DbStackProps extends StackProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
}

/**
 * Database stack: a single-region Aurora DSQL cluster.
 *
 * DSQL is a serverless, distributed PostgreSQL-compatible database. We use the
 * `@aws-cdk/aws-dsql-alpha` L2 `Cluster` construct, which surfaces the cluster
 * ARN/endpoint as attributes and provides `grantConnect*` helpers.
 *
 * Connections authenticate with short-lived IAM tokens (no static password) —
 * see `packages/db/src/client.ts` for how the runtime builds them.
 */
export class DbStack extends Stack {
  /** The DSQL cluster resource. */
  readonly cluster: Cluster;
  /** Cluster connection endpoint: `<id>.dsql.<region>.on.aws`. */
  readonly clusterEndpoint: string;
  /** Cluster ARN, for granting `dsql:DbConnect*` to consumers. */
  readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props);

    const isProd = props.stage === 'prod';

    this.cluster = new Cluster(this, 'Cluster', {
      clusterName: `${props.stage}-app-db`,
      // Protect production data from accidental `cdk destroy`.
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.clusterEndpoint = this.cluster.clusterEndpoint;
    this.clusterArn = this.cluster.clusterArn;
  }
}

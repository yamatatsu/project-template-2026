import { ArnFormat, CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnCluster } from 'aws-cdk-lib/aws-dsql';
import type { Construct } from 'constructs';

export interface DbStackProps extends StackProps {
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
}

/**
 * Database stack: a single-region Aurora DSQL cluster.
 *
 * DSQL is a serverless, distributed PostgreSQL-compatible database. There is
 * no L2 construct yet, so we use the `AWS::DSQL::Cluster` L1 resource.
 *
 * Connections authenticate with short-lived IAM tokens (no static password) —
 * see `packages/db/src/client.ts` for how the runtime builds them.
 */
export class DbStack extends Stack {
  /** The DSQL cluster resource. */
  readonly cluster: CfnCluster;
  /** Cluster connection endpoint: `<id>.dsql.<region>.on.aws`. */
  readonly clusterEndpoint: string;
  /** Cluster ARN, for granting `dsql:DbConnect*` to consumers. */
  readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props);

    this.cluster = new CfnCluster(this, 'Cluster', {
      // Protect production data from accidental `cdk destroy`.
      deletionProtectionEnabled: props.stage === 'prod',
      tags: [{ key: 'Name', value: `${props.stage}-app-db` }],
    });

    this.clusterEndpoint = `${this.cluster.attrIdentifier}.dsql.${this.region}.on.aws`;

    // Build the ARN explicitly rather than depending on an L1 attribute name,
    // so the grant is stable across construct versions.
    this.clusterArn = this.formatArn({
      service: 'dsql',
      resource: 'cluster',
      resourceName: this.cluster.attrIdentifier,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });

    new CfnOutput(this, 'ClusterId', { value: this.cluster.attrIdentifier });
    new CfnOutput(this, 'ClusterEndpoint', { value: this.clusterEndpoint });
    new CfnOutput(this, 'ClusterArn', { value: this.clusterArn });
  }
}

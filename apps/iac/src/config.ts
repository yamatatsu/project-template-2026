import type { App } from 'aws-cdk-lib';

/**
 * Deployment configuration resolved from CDK context / environment.
 *
 * Override any value at synth/deploy time, e.g.:
 *   cdk deploy --all -c stage=prod -c region=us-east-1
 */
export interface IacConfig {
  /** Logical environment name. Used as a stack-name prefix. */
  readonly stage: string;
  /** Target AWS account (falls back to the CLI's default account). */
  readonly account: string | undefined;
  /** Target AWS region. Aurora DSQL must be available here. */
  readonly region: string;
  /** Prefix applied to every stack name, e.g. `Icasu-Dev`. */
  readonly stackPrefix: string;
}

export function resolveConfig(app: App): IacConfig {
  const ctx = (key: string): unknown => app.node.tryGetContext(key);

  const stage = (ctx('stage') as string | undefined) ?? 'dev';
  const region =
    (ctx('region') as string | undefined) ?? process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1';
  const account = (ctx('account') as string | undefined) ?? process.env.CDK_DEFAULT_ACCOUNT;

  const stackPrefix = `Icasu-${pascalCase(stage)}`;

  return { stage, account, region, stackPrefix };
}

function pascalCase(str: string): string {
  return str
    .split(/[^a-zA-Z0-9]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

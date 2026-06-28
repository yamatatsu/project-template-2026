import type { App } from 'aws-cdk-lib';

/**
 * Deployment configuration resolved from CDK context / environment.
 *
 * Override any value at synth/deploy time, e.g.:
 *   cdk deploy --all -c stage=prod -c region=us-east-1 -c apiAuth=true
 */
export interface IacConfig {
  /** Logical environment name. Used as a stack-name prefix. */
  readonly stage: string;
  /** Target AWS account (falls back to the CLI's default account). */
  readonly account: string | undefined;
  /** Target AWS region. Aurora DSQL must be available here. */
  readonly region: string;
  /** Require a valid Cognito JWT on `/api/*` (attaches the API authorizer). */
  readonly apiAuth: boolean;
  /** Prefix applied to every stack name, e.g. `Icasu-Dev`. */
  readonly stackPrefix: string;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

export function resolveConfig(app: App): IacConfig {
  const ctx = (key: string): unknown => app.node.tryGetContext(key);

  const stage = (ctx('stage') as string | undefined) ?? 'dev';
  const region =
    (ctx('region') as string | undefined) ?? process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1';
  const account = (ctx('account') as string | undefined) ?? process.env.CDK_DEFAULT_ACCOUNT;
  const apiAuth = asBool(ctx('apiAuth'), false);

  const stackPrefix = `Icasu-${stage.charAt(0).toUpperCase()}${stage.slice(1)}`;

  return { stage, account, region, apiAuth, stackPrefix };
}

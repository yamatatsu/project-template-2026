/**
 * Deployment configuration.
 *
 * The only runtime input is the `STAGE` environment variable; every other value
 * is a constant defined in this file and selected by stage. Deploy with:
 *   STAGE=prod cdk deploy --all
 */
export interface IacConfig {
  /** Logical environment name. Used as a stack-name prefix. */
  readonly stage: Stage;
  /** Target AWS account (falls back to the CLI's default account). */
  readonly account: string | undefined;
  /** Target AWS region. Aurora DSQL must be available here. */
  readonly region: string;
  /** Prefix applied to every stack name, e.g. `Icasu-Dev`. */
  readonly stackPrefix: string;
}

export type Stage = 'dev' | 'prod';

const devConfig: IacConfig = {
  stage: 'dev',
  account: undefined,
  region: 'ap-northeast-1',
  stackPrefix: 'Icasu-Dev',
};

const prodConfig: IacConfig = {
  stage: 'prod',
  account: undefined,
  region: 'ap-northeast-1',
  stackPrefix: 'Icasu-Prod',
};

const configByStage: Record<Stage, IacConfig> = {
  dev: devConfig,
  prod: prodConfig,
};

/**
 * Resolve the active config from the `STAGE` environment variable.
 *
 * `STAGE` must be `dev`, `prod`, or unset; anything else throws. An unset
 * `STAGE` falls back to `dev`.
 */
export function resolveConfig(): IacConfig {
  const stage = resolveStage();
  return configByStage[stage];
}

function resolveStage(): Stage {
  const raw = process.env.STAGE;
  if (raw === undefined || raw === null || raw === '') return 'dev';
  if (raw === 'dev' || raw === 'prod') return raw;
  throw new Error(`Invalid STAGE: "${raw}". Expected "dev", "prod", or unset.`);
}

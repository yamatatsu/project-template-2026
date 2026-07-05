/**
 * デプロイ設定。
 *
 * ランタイム入力は環境変数 `STAGE` のみで、他の値はすべてこのファイル内の定数として
 * 定義し stage で切り替える。デプロイは次のように行う:
 *   STAGE=prod cdk deploy --all
 */
export interface IacConfig {
  /** 論理環境名。スタック名のプレフィックスに使う。 */
  readonly stage: Stage;
  /** 対象の AWS アカウント（未指定なら CLI のデフォルトアカウントにフォールバック）。 */
  readonly account: string | undefined;
  /** 対象の AWS リージョン。Aurora DSQL が利用可能である必要がある。 */
  readonly region: string;
  /** すべてのスタック名に付くプレフィックス（例: `Icasu-Dev`）。 */
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
 * 環境変数 `STAGE` から有効な設定を解決する。
 *
 * `STAGE` は `dev`・`prod`・未設定のいずれかでなければならず、それ以外は例外を投げる。
 * 未設定の場合は `dev` にフォールバックする。
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

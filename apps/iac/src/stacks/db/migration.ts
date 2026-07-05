import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ICluster } from '@aws-cdk/aws-dsql-alpha';
import { Duration, Stack } from 'aws-cdk-lib';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Trigger } from 'aws-cdk-lib/triggers';
import { Construct } from 'constructs';

const here = fileURLToPath(new URL('.', import.meta.url));
const MIGRATE_ENTRY = join(here, '../../../../../packages/db/src/migrate-handler.ts');
const MIGRATIONS_DIR = 'packages/db/src/migrations';
const DEPS_LOCK_FILE = join(here, '../../../../../pnpm-lock.yaml');

export interface MigrationProps {
  /** マイグレーション適用先の DSQL クラスタ。 */
  readonly cluster: ICluster;
}

/**
 * デプロイ中に drizzle マイグレーションを DSQL へ適用する Trigger。
 *
 * マイグレーション SQL は Lambda バンドルに同梱する。SQL の追加・変更でバンドルの
 * ハッシュが変わると Trigger（既定の executeOnHandlerChange）が再実行され、変更が
 * なければ何も走らない。Lambda が throw すると CloudFormation のデプロイ自体が失敗する
 * ため、「スキーマが古いまま新しいアプリコードが出る」事故を防げる。ただし適用済みの
 * DDL はロールバックされない（forward-only。詳細は packages/db/CLAUDE.md）。
 */
export class Migration extends Construct {
  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);

    const { region } = Stack.of(this);

    const migrateFn = new NodejsFunction(this, 'MigrateFn', {
      entry: MIGRATE_ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.minutes(5),
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: {
        DSQL_ENDPOINT: props.cluster.clusterEndpoint,
        DSQL_REGION: region,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        // migrations.ts が import.meta.url で SQL フォルダを解決するため ESM で出力する。
        format: OutputFormat.ESM,
        target: 'node22',
        sourceMap: true,
        // pg はオプショナルなネイティブバインディングを遅延 require するため external に残す。
        externalModules: ['pg-native'],
        // ESM 出力に CJS 依存（pg 等）を混ぜたときの動的 require を動かす定番シム。
        banner:
          "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // SQL ファイルは import されず esbuild が同梱しないため、バンドル出力へコピーする
          // （実行時は bundle された migrations.ts が自身の隣の ./migrations を見る）。
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp -R "${join(inputDir, MIGRATIONS_DIR)}" "${outputDir}"`,
          ],
        },
      },
    });

    // DDL の適用には admin ロールが必要（アプリ用のカスタム DB ロールでは権限が足りない）。
    props.cluster.grantConnectAdmin(migrateFn);

    const trigger = new Trigger(this, 'Trigger', {
      handler: migrateFn,
      // Trigger 既定の 2 分は Lambda 側の timeout より短く先に打ち切られるため揃える。
      timeout: Duration.minutes(5),
    });
    // クラスタが ACTIVE になってから実行する。
    trigger.executeAfter(props.cluster);
  }
}

import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  // shared はセグメント単位で import するため public-api ルールを緩和する。
  {
    files: ['./src/shared/**'],
    rules: {
      'fsd/public-api': 'off',
    },
  },
  // tasks-table は複数の entity/feature を束ねる一覧ブロックとして意図的に widget 化している。
  // 現状の参照元が pages/tasks のみのため insignificant-slice が誤検出するので緩和する。
  {
    files: ['./src/widgets/tasks-table/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  // users-table も tasks-table と同様に一覧ブロックとして widget 化している（参照元は pages/users のみ）。
  {
    files: ['./src/widgets/users-table/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  // delete-task は一覧（widgets/tasks-table）と詳細（pages/task-detail）の両方から
  // 再利用するユースケース。insignificant-slice のヒューリスティックでは参照数が
  // 過小評価されるため緩和する。
  {
    files: ['./src/features/delete-task/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  // user-role-form はロール変更のユースケース（参照元は pages/user-edit のみ）。
  // insignificant-slice のヒューリスティックで過小評価されるため緩和する。
  {
    files: ['./src/features/user-role-form/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  // テスト・設定ファイル・生成物はアーキテクチャ解析の対象外。
  // テストコードの置き場は __tests__ ディレクトリ（または同居の *.test.{ts,tsx}）に統一する。
  // `test` ディレクトリは意図的に免除しない（FSD 解析に晒すことで __tests__ へ誘導する）。
  // routeTree.gen.ts は tanstackRouter が app/ に生成するルートツリー（手で触らない）。
  {
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**', '**/*.config.*', '**/routeTree.gen.ts'],
  },
]);

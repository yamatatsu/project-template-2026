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
  // delete-task は一覧（widgets/tasks-table）と詳細（pages/task-detail）の両方から
  // 再利用するユースケース。insignificant-slice のヒューリスティックでは参照数が
  // 過小評価されるため緩和する。
  {
    files: ['./src/features/delete-task/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
  // テスト・設定ファイルはアーキテクチャ解析の対象外。
  {
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**', '**/test/**', '**/*.config.*'],
  },
]);

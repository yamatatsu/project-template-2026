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
  // テスト・設定ファイルはアーキテクチャ解析の対象外。
  {
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**', '**/test/**', '**/*.config.*'],
  },
]);

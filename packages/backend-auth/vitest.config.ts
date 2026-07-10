import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // 監査ログは POWERTOOLS_LOG_LEVEL では黙らないので、全ロガーを短絡できるこの変数を使う
      // （理由は `docs/specs/logs.md`）。
      AWS_LAMBDA_LOG_LEVEL: 'SILENT',
    },
  },
});

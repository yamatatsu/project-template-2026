import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // テストファイルごとに PGlite（wasm）を起動するため、ワーカー数をコア数任せにすると wasm の
    // 同時コンパイルが競合して beforeAll のマイグレーションが hookTimeout（10s）を超える。絞った
    // ほうが総時間も短い（実測: 8 並列 40s+ でタイムアウト → 4 並列 ~6s で全通過）。
    maxWorkers: 4,
    env: {
      // 監査ログは POWERTOOLS_LOG_LEVEL では黙らないので、全ロガーを短絡できるこの変数を使う
      // （理由は `docs/specs/logs.md`）。
      AWS_LAMBDA_LOG_LEVEL: 'SILENT',
    },
  },
});

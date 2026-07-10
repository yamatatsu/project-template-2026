import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // Powertools は既定で専用の Console（process.stdout 直書き）を作るため、グローバル console を
      // spy しても出力を捕まえられない。POWERTOOLS_DEV=true のときだけグローバル console を使う。
      // ログレベルには影響しない（整形が indent 付きになるだけ）。
      POWERTOOLS_DEV: 'true',
    },
  },
});

import { defineConfig } from 'vitest/config';

import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['core/functions/**/*.test.ts', 'core/tools/**/*.test.mjs', 'test-scripts/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.wrangler'],
  },
  resolve: {
    conditions: ['workerd', 'node'],
    alias: {
      'test-scripts': path.resolve(__dirname, 'test-scripts'),
    },
  },
});

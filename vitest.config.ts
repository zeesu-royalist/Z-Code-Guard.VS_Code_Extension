import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    alias: {
      vscode: path.resolve(__dirname, 'test/mocks/vscode.ts'),
    },
  },
});

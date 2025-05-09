import { configDefaults, defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [...configDefaults.include, '**/test/*.ts'],
    globalSetup: './src/tests/vitest.globalSetup.ts',
    setupFiles: ['./src/tests/vitest.testSetup.ts'],
    passWithNoTests: true,
    testTimeout: 10_000,
  },
});

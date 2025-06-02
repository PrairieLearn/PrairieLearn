import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/prairielearn/**/*.test.ts', 'packages/**/*.test.ts'],
    coverage: {
      all: true,
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['apps/prairielearn/src/**'],
    },
  },
});

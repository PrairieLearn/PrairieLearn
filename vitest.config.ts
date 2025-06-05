import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    include: ['apps/prairielearn/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['apps/workspace-host/**', 'apps/grader-host/**', ...defaultExclude],
    coverage: {
      all: false,
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['apps/prairielearn/src/**'],
      exclude: ['apps/grader-host/**', 'apps/workspace-host/**'],
    },
  },
});

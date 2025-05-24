import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'apps/grader-host/**/*', 'apps/workspace-host/**/*'],
    coverage: {
      all: true,
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['packages/*/src/**', 'apps/prairielearn/src/**'],
    },
  },
});

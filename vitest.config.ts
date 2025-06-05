import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    projects: ['packages/*', 'apps/prairielearn', 'apps/grader-host', 'apps/workspace-host'],
    coverage: {
      all: true,
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['{apps,packages}/*/src/**'],
    },
  },
});

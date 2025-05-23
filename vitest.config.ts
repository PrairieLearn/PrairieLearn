import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'apps/grader-host/**', 'apps/workspace-host/**'],
  },
});

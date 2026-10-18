import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'course-agent',
    testTimeout: 15_000,
    dir: `${import.meta.dirname}/src`,
  },
});

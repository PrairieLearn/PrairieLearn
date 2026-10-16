import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'course-agent',
    dir: `${import.meta.dirname}/src`,
  },
});

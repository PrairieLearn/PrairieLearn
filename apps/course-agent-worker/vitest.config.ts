import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: `${import.meta.dirname}/src`,
  },
});

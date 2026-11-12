import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: `${import.meta.dirname}/src`,
    hookTimeout: 20_000,
    testTimeout: 10_000,
    coverage: {
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});

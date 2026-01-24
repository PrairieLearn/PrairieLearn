import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: `${import.meta.dirname}/src`,
    coverage: {
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});

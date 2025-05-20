import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['html', 'text-summary', 'cobertura'],
      all: true,
      include: ['src/**'],
    },
  },
});

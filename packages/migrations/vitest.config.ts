import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**'],
    coverage: {
      reporter: ['html', 'text-summary', 'cobertura'],
      include: ['src/**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    },
  },
});

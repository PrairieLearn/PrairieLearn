import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedConfig } from './vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      projects: ['{apps,packages}/*/vitest.config.ts'],
      coverage: {
        reporter: ['html', 'text-summary', 'cobertura'],
        include: ['{apps,packages}/*/src/**/*.{ts,tsx}'],
      },
    },
  }),
);

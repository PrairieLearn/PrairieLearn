import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedConfig } from './vitest.shared';

// The accessibility test checks every page in the app, which makes it by far
// the slowest test file. Vitest only runs separate files in parallel, so we run
// it as several projects that each check a slice of the pages (see
// `accessibilitySlice` in the test). Each slice runs in its own worker and can
// be scheduled on a different shard.
const ACCESSIBILITY_TEST_SLICES = 4;
const ACCESSIBILITY_TEST = 'tests/accessibility/index.test.ts';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      projects: [
        '{apps,packages}/*/vitest.config.ts',
        '!apps/prairielearn/vitest.config.ts',
        {
          extends: './apps/prairielearn/vitest.config.ts',
          root: './apps/prairielearn',
          test: { name: '@prairielearn/prairielearn', exclude: [`**/${ACCESSIBILITY_TEST}`] },
        },
        ...Array.from({ length: ACCESSIBILITY_TEST_SLICES }, (_, index) => ({
          extends: './apps/prairielearn/vitest.config.ts',
          root: './apps/prairielearn',
          test: {
            name: `@prairielearn/prairielearn (accessibility ${index + 1}/${ACCESSIBILITY_TEST_SLICES})`,
            include: [ACCESSIBILITY_TEST],
            provide: { accessibilitySlice: { index, count: ACCESSIBILITY_TEST_SLICES } },
          },
        })),
      ],
      coverage: {
        reporter: ['html', 'text-summary', 'cobertura'],
        include: ['{apps,packages}/*/src/**/*.{ts,tsx}'],
      },
    },
  }),
);

import { configDefaults, defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// Vitest will try to intelligently sequence the test suite based on which ones
// are slowest. However, this depends on cached data from previous runs, which
// isn't available in CI. So, we manually specify the slowest tests here and
// use a custom sequencer to always run them first.
const SLOW_TESTS = ['src/tests/exampleCourseQuestions.test.ts', 'src/tests/cron.test.ts'];

class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const sortedFiles = await super.sort(files);

    // Put all the slow tests at the beginning.
    const slowTests = sortedFiles.filter((file) =>
      SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest)),
    );
    const otherTests = sortedFiles.filter(
      (file) => !SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest)),
    );

    return [...slowTests, ...otherTests];
  }

  async shard(files: TestSpecification[]) {
    return super.shard(files);
  }
}

export default defineConfig({
  test: {
    include: [...configDefaults.include],
    globalSetup: './src/tests/vitest.globalSetup.ts',
    setupFiles: ['./src/tests/vitest.testSetup.ts'],
    passWithNoTests: true,
    hookTimeout: 20_000,
    testTimeout: 10_000,
    isolate: false,
    sequence: {
      sequencer: CustomSequencer,
    },
  },
});

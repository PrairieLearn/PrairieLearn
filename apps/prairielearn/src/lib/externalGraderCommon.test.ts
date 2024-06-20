import { assert } from 'chai';

import { makeGradingResult } from './externalGraderCommon.js';

describe('externalGraderCommon', () => {
  describe('makeGradingResult', () => {
    it('marks as not succeeded if succeeded field is missing', () => {
      const result = makeGradingResult('1', {});

      assert.isFalse(result.grading.feedback.succeeded);
    });

    it('marks as not succeeded if results object is missing', () => {
      const result = makeGradingResult('1', { succeeded: true });

      assert.isFalse(result.grading.feedback.succeeded);
    });

    it('properly handles results with null bytes', () => {
      const result = makeGradingResult('1', {
        succeeded: true,
        results: {
          score: 0.5,
          format_errors: ['\0 test', 'second issue without null byte'],
          tests: [{ name: 'Test \0', points: 0, max_points: 1 }],
        },
      });

      assert.isTrue(result.grading.feedback.succeeded);
      assert('results' in result.grading.feedback);
      assert.equal(result.grading.feedback.results?.tests[0].name, 'Test \ufffd');
      assert.equal(
        result.grading.format_errors,
        '{"_external_grader":["\ufffd test","second issue without null byte"]}',
      );
    });
  });
});

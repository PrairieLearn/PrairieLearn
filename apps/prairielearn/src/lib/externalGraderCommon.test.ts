import { assert } from 'chai';

import { makeGradingResult } from './externalGraderCommon';

describe('externalGraderCommon', () => {
  describe('makeGradingResult', () => {
    it('marks as not succeeded if succeeded field is missing', () => {
      const result = makeGradingResult(1, {});

      assert.isFalse(result.grading.feedback.succeeded);
    });

    it('marks as not succeeded if results object is missing', () => {
      const result = makeGradingResult(1, { succeeded: true });

      assert.isFalse(result.grading.feedback.succeeded);
    });
  });
});

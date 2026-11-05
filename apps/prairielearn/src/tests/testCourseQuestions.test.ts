import { afterAll, beforeAll, describe, it } from 'vitest';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const qidsTestCourse = [
  'addNumbers',
  'differentiatePolynomial',
  'downloadFile',
  'positionTimeGraph',
  'prairieDrawFigure',
  'orderBlocks',
  'sketchTest',
];

describe('Auto-test questions in testCourse', { timeout: 60_000 }, function () {
  beforeAll(async () => {
    await withConfig({ workersCount: helperServer.QUESTION_TESTS_WORKERS_COUNT }, async () => {
      await helperServer.before()();
    });
  });

  afterAll(helperServer.after);

  qidsTestCourse.forEach((qid) => {
    it.concurrent(`auto-test ${qid}`, async () => {
      await helperQuestion.autoTestQuestion({ qid });
    });
  });
});

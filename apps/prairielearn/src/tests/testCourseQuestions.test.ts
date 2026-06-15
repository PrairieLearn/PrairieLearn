import * as os from 'node:os';

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
];

describe('Auto-test questions in testCourse', { timeout: 60_000 }, function () {
  beforeAll(async () => {
    await withConfig({ workersCount: os.cpus().length }, async () => {
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

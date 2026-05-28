import * as os from 'node:os';

import { afterAll, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };

locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionPreviewTabUrl = '/preview';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
locals.isStudentPage = false;

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
      await helperQuestion.autoTestQuestion({
        questionBaseUrl: locals.questionBaseUrl,
        questionPreviewTabUrl: locals.questionPreviewTabUrl,
        qid,
      });
    });
  });
});

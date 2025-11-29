import { afterAll, beforeAll, describe } from 'vitest';

import { config } from '../lib/config.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

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
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  qidsTestCourse.forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
});

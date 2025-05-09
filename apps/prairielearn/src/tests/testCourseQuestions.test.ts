import { describe, beforeAll, afterAll } from 'vitest';

import { config } from '../lib/config.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const locals: Record<string, any> = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
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

describe('Auto-test questions in testCourse', function () {
  // set up testing server
  beforeAll(helperServer.before());
  // shut down testing server
  afterAll(helperServer.after);

  qidsTestCourse.forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
}, 60_000);

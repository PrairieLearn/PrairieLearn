import { config } from '../lib/config';

import * as helperServer from './helperServer';
import * as helperQuestion from './helperQuestion';

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
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  qidsTestCourse.forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
});

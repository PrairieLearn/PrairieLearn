import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as fg from 'fast-glob';

import { config } from '../lib/config';
import { EXAMPLE_COURSE_PATH } from '../lib/paths';

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

const qidsExampleCourse = [
  'demo/calculation',
  'demo/custom/element',
  'demo/custom/gradeFunction',
  'demo/fixedCheckbox',
  'demo/matrixAlgebra',
  'demo/matrixComplexAlgebra',
  'demo/proofBlocks',
  'demo/randomCheckbox',
  'demo/randomDataFrame',
  'demo/randomFakeData',
  'demo/randomMultipleChoice',
  'demo/randomPlot',
  'element/bigOInput',
  'element/checkbox',
  'element/code',
  'element/fileDownload',
  'element/graph',
  'element/integerInput',
  'element/markdown',
  'element/matrixComponentInput',
  'element/matrixLatex',
  'element/multipleChoice',
  'element/numberInput',
  'element/orderBlocks',
  'element/panels',
  'element/pythonVariable',
  'element/stringInput',
  'element/symbolicInput',
  'element/unitsInput',
  'element/variableOutput',
];

// We hold all template questions to a high standard, so we will always test them all.
const templateQuestionQids: string[] = fg
  .globSync('template/**/info.json', {
    cwd: path.join(EXAMPLE_COURSE_PATH, 'questions'),
  })
  .map((p) => path.dirname(p));

describe('Auto-test questions in exampleCourse', () => {
  it('has correct topic for all template questions', async () => {
    const questionsWithIncorrectTopics: string[] = [];
    for (const qid of templateQuestionQids) {
      const jsonPath = path.join(EXAMPLE_COURSE_PATH, 'questions', qid, 'info.json');
      const json = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      if (json.topic !== 'Template') {
        questionsWithIncorrectTopics.push(qid);
      }
    }
    if (questionsWithIncorrectTopics.length) {
      const qids = questionsWithIncorrectTopics.map((qid) => `"${qid}"`).join(', ');
      throw new Error(`The following template questions have incorrect topics: ${qids}`);
    }
  });

  describe('Auto-test questions in exampleCourse', function () {
    this.timeout(60000);

    before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
    after('shut down testing server', helperServer.after);

    [...qidsExampleCourse, ...templateQuestionQids].forEach((qid) =>
      helperQuestion.autoTestQuestion(locals, qid),
    );
  });

  describe('Auto-test questions in exampleCourse with process-questions-in-worker enabled', function () {
    this.timeout(60000);

    before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
    after('shut down testing server', helperServer.after);

    const originalProcessQuestionsInWorker = config.features['process-questions-in-worker'];
    before('enable process-questions-in-worker', () => {
      config.features['process-questions-in-worker'] = true;
    });
    after('restore process-questions-in-worker', () => {
      config.features['process-questions-in-worker'] = originalProcessQuestionsInWorker;
    });

    // Only test the first 10 questions so that this test doesn't take too long.
    [...qidsExampleCourse, ...templateQuestionQids]
      .slice(0, 10)
      .forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
  });
});

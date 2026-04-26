import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import fg from 'fast-glob';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';

import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const locals: Record<string, any> = { siteUrl: 'http://localhost:' + config.serverPort };

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
  // TODO: Add a test that validates template question HTML with validateHTML()
  // and asserts zero errors and warnings. This would catch issues like input
  // elements nested inside panel elements. Blocked on adding more elements to
  // SUPPORTED_ELEMENTS so that templates using e.g. pl-figure don't fail.

  it('has correct topic for all template questions', async () => {
    const questionsWithIncorrectTopics: string[] = [];
    for (const qid of templateQuestionQids) {
      const jsonPath = path.join(EXAMPLE_COURSE_PATH, 'questions', qid, 'info.json');
      const json = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      if (json.topic !== 'Template') {
        questionsWithIncorrectTopics.push(qid);
      }
    }
    if (questionsWithIncorrectTopics.length > 0) {
      const qids = questionsWithIncorrectTopics.map((qid) => `"${qid}"`).join(', ');
      throw new Error(`The following template questions have incorrect topics: ${qids}`);
    }
  });

  describe('Auto-test questions in exampleCourse', { timeout: 60_000 }, function () {
    beforeAll(helperServer.before(EXAMPLE_COURSE_PATH));

    afterAll(helperServer.after);

    [...qidsExampleCourse, ...templateQuestionQids].forEach((qid) =>
      helperQuestion.autoTestQuestion(locals, qid),
    );
  });
});

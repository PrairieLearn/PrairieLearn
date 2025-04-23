/* eslint-disable @typescript-eslint/no-unused-vars */
import { dirname, parse, resolve } from 'path';
import { fileURLToPath } from 'url';

import { expect } from 'chai';
import { HtmlValidate } from 'html-validate';
import { HTMLHint } from 'htmlhint';

import { formatErrorStack } from '@prairielearn/error';

import * as assetServer from '../lib/assets.js';
import * as codeCaller from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import type { Course, Question, Submission, Variant } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import * as loadEstimator from '../lib/load.js';
import { buildQuestionUrls } from '../lib/question-render.js';
import { makeVariant } from '../lib/question-variant.js';
import * as freeformServer from '../question-servers/freeform.js';
import * as questionServers from '../question-servers/index.js';

const htmlvalidate = new HtmlValidate();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exampleCourse = resolve(__dirname, '..', '..', '..', '..', 'exampleCourse');

const exampleQuestion = 'demo/calculation';

// https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/question-servers/index.ts#L27

// console.log(exampleCourse, exampleQuestion);
const question = {
  // QuestionOptionsv3JsonSchema is empty
  options: {},
  directory: exampleQuestion,
  // Needed for makeVariant
  type: 'Freeform',
} as unknown as Question;

// Assume that we are using the experimental renderer, according to config

const course = {
  // These are required to pass validateContext in the feature manager
  institutition_id: true,
  course_id: true,
  course_instance_id: true,
  // These options are from CourseJsonSchema, but not needed
  options: {},
  path: exampleCourse,
} as unknown as Course;

// find all info.json where gradingMethod is not External.
/*
There should be a test case for each of those, named after the directory it tests.

For each question, ensure that the courseIssues from each stage are the empty array.
The rawSubmission should be a duplicate of the variant.true_answer

*/
features.runWithGlobalOverrides({ 'process-questions-in-server': false }, async () => {
  // Disable load estimator connecting to SQL
  loadEstimator.setLocalLoadEstimator(true);

  // Trick asset server
  config.devMode = false;
  await assetServer.init();
  config.devMode = true;

  // Setup code caller pool
  await codeCaller.init();
  const questionModule = questionServers.getModule('Freeform');
  await freeformServer.init();

  const { courseIssues: prepareGenerateIssues, variant } = await makeVariant(question, course, {});

  if (prepareGenerateIssues.length > 0) {
    console.log('Prepare issues:', prepareGenerateIssues);
  }

  // @ts-expect-error We need this for rendering
  variant.num_tries = 1;

  const submissionRaw = structuredClone(variant.true_answer);

  const submission = {
    submitted_answer: submissionRaw,
    raw_submitted_answer: submissionRaw,
    gradable: true,
  };

  const locals = {
    urlPrefix: '/prefix1', // urlPrefix
    plainUrlPrefix: config.urlPrefix,
    questionRenderContext: undefined,
    ...buildQuestionUrls(
      '/prefix2',
      { id: 'vid' } as unknown as Variant,
      { id: 'qid' } as unknown as Question,
      null,
    ),
  };

  const {
    courseIssues: renderIssues,
    data: { questionHtml },
  } = await questionModule.render(
    {
      question: true,
      submissions: false,
      answer: false,
    },
    variant as unknown as Variant,
    question,
    null, // submission
    [], // submissions
    course,
    locals,
  );

  if (renderIssues.length > 0) {
    console.log('Render issues:', renderIssues);
  }

  const messages = HTMLHint.verify(questionHtml, {
    'doctype-first': false,
  });

  if (messages.length > 0) {
    console.log('HTMLHint messages:', messages);
  }

  const { valid, results } = await htmlvalidate.validateString(questionHtml, {
    rules: {
      'attribute-boolean-style': 'off',
    },
  });
  if (!valid) {
    const messages = results.flatMap((result) => result.messages);
    console.log('HTMLValidate messages:', messages);
  }

  const { courseIssues: parseIssues, data: resultData } = await questionModule.parse(
    submission,
    // Even though it wants a full variant, we know that it only cares about VariantCreationData
    variant as unknown as Variant,
    question,
    course,
  );

  if (parseIssues.length > 0) {
    console.log('Parse issues:', parseIssues);
  }
  // console.log('Parse issues:', parseIssues);

  if (Object.keys(resultData.format_errors).length > 0) resultData.gradable = false;

  // console.log(resultData);
  const { courseIssues: gradeIssues, data } = await questionModule.grade(
    resultData as unknown as Submission,
    variant as unknown as Variant,
    question,
    course,
  );

  const formatErrors: Record<string, any> = data.format_errors || {};
  const grade = data?.score || 0;
  if (formatErrors.length > 0) {
    console.log('Format errors:', formatErrors);
  }
  if (grade !== 1) {
    console.log('Grade:', grade);
  }

  if (gradeIssues.length > 0) {
    console.log('Grade issues:', gradeIssues);
  }
  await codeCaller.finish();
  loadEstimator.close();
});

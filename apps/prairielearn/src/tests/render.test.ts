/* eslint-disable @typescript-eslint/no-unused-vars */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import * as assetServer from '../lib/assets.js';
import { init } from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import type { Course, Question, Submission, Variant } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { buildQuestionUrls } from '../lib/question-render.js';
import { makeVariant } from '../lib/question-variant.js';
import * as freeformServer from '../question-servers/freeform.js';
import * as questionServers from '../question-servers/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exampleCourse = resolve(__dirname, '..', '..', '..', '..', 'exampleCourse');

const exampleQuestion = 'demo/calculation';

// https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/question-servers/index.ts#L27

console.log(exampleCourse, exampleQuestion);
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

features.runWithGlobalOverrides({ 'process-questions-in-server': false }, async () => {
  // Trick asset server
  config.devMode = false;
  await assetServer.init();
  config.devMode = true;

  // Setup code caller pool
  await init();
  console.log(features.globalOverrides);
  const questionModule = questionServers.getModule('Freeform');
  await freeformServer.init();

  const { courseIssues: prepareGenerateIssues, variant } = await makeVariant(question, course, {});

  // @ts-expect-error We need this for rendering
  variant.num_tries = 1;
  // console.log(prepareGenerateIssues);
  // console.log(variant);
  // ../../../exampleCourse/questions/demo/calculation/question.html
  const submissionRaw = { c: variant.params.a + variant.params.b };

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
    // We don't really need these
    // ...buildLocals({
    //   variant,
    //   question,
    //   instance_question,
    //   group_role_permissions: groupRolePermissions,
    //   assessment,
    //   assessment_instance,
    //   assessment_question,
    //   group_config,
    // }),
  };

  const { courseIssues, data } = await questionModule.render(
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
  console.log('Render issues:', courseIssues);
  console.log('Render data:', data);

  const { courseIssues: parseIssues, data: resultData } = await questionModule.parse(
    submission,
    // Even though it wants a full variant, we know that it only cares about VariantCreationData
    variant as unknown as Variant,
    question,
    course,
  );

  // console.log('Parse issues:', parseIssues);

  if (Object.keys(resultData.format_errors).length > 0) resultData.gradable = false;

  // console.log(resultData);
  const { courseIssues: gradeIssues, data: gradedData } = await questionModule.grade(
    resultData as unknown as Submission,
    variant as unknown as Variant,
    question,
    course,
  );

  if (Object.keys(gradedData.format_errors || {}).length > 0) gradedData.gradable = false;

  // console.log('Graded data:', gradedData);
  // console.log('Grade issues:', gradeIssues);
});

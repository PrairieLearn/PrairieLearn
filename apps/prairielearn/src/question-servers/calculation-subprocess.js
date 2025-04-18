// @ts-check
import assert from 'node:assert';
import * as path from 'node:path';

import { contains } from '@prairielearn/path-utils';

import * as chunks from '../lib/chunks.js';
import { withCodeCaller } from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import * as filePaths from '../lib/file-paths.js';
import { REPOSITORY_ROOT_PATH } from '../lib/paths.js';

/** @typedef {import('../lib/chunks.js').Chunk} Chunk */
/**
 * @template T
 * @typedef {import('./types.ts').QuestionServerReturnValue<T>} QuestionServerReturnValue<T>
 */

async function prepareChunksIfNeeded(question, course) {
  const questionIds = await chunks.getTemplateQuestionIds(question);

  /** @type {Chunk[]} */
  const templateQuestionChunks = questionIds.map((id) => ({ type: 'question', questionId: id }));

  /** @type {Chunk[]} */
  const chunksToLoad = [
    { type: 'question', questionId: question.id },
    { type: 'clientFilesCourse' },
    { type: 'serverFilesCourse' },
    ...templateQuestionChunks,
  ];

  await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);
}

/**
 * @param {string} questionServerPath
 * @param {string} courseHostPath
 * @param {string} courseRuntimePath
 * @returns {string}
 */
function getQuestionRuntimePath(questionServerPath, courseHostPath, courseRuntimePath) {
  const questionServerType = contains(courseHostPath, questionServerPath) ? 'course' : 'core';

  if (questionServerType === 'course') {
    const questionServerPathWithinCourse = path.relative(courseHostPath, questionServerPath);
    return path.join(courseRuntimePath, questionServerPathWithinCourse);
  }

  if (config.workersExecutionMode === 'native') {
    return questionServerPath;
  } else {
    const questionServerPathWithinRepo = path.relative(REPOSITORY_ROOT_PATH, questionServerPath);

    // This is hardcoded to use the `/PrairieLearn` directory in our container
    // image, which is where the repository files will be located.
    return path.join('/PrairieLearn', questionServerPathWithinRepo);
  }
}

/**
 * @param {string} func
 * @param {import('../lib/db-types.js').Course} question_course
 * @param {import('../lib/db-types.js').Question} question
 * @param {any} inputData
 * @returns
 */
async function callFunction(func, question_course, question, inputData) {
  assert(question.directory, 'Question directory is required');

  await prepareChunksIfNeeded(question, question_course);

  const courseHostPath = chunks.getRuntimeDirectoryForCourse(question_course);
  const courseRuntimePath = config.workersExecutionMode === 'native' ? courseHostPath : '/course';

  const { fullPath: questionServerPath } = await filePaths.questionFilePath(
    'server.js',
    question.directory,
    courseHostPath,
    question,
  );

  // `questionServerPath` may be one of two things:
  //
  // - A path to a file within the course directory
  // - A path to a file in PrairieLearn's `v2-question-servers` directory
  //
  // We need to handle these differently.
  const questionServerRuntimePath = getQuestionRuntimePath(
    questionServerPath,
    courseHostPath,
    courseRuntimePath,
  );

  try {
    return await withCodeCaller(question_course, async (codeCaller) => {
      const res = await codeCaller.call('v2-question', null, questionServerRuntimePath, null, [
        {
          questionServerPath: questionServerRuntimePath,
          func,
          coursePath: courseRuntimePath,
          question,
          ...inputData,
        },
      ]);
      // Note that `res` also contains an `output` property. For v3 questions,
      // we'd create a course issue if `output` is non-empty. However, we didn't
      // historically have a restriction where v2 questions couldn't write logs,
      // so we won't impose the same restriction here.
      return { data: res.result, courseIssues: [] };
    });
  } catch (err) {
    err.fatal = true;
    return { data: {}, courseIssues: [err] };
  }
}

/**
 * @param {import('../lib/db-types.js').Question} question
 * @param {import('../lib/db-types.js').Course} course
 * @param {string} variant_seed
 */
export async function generate(question, course, variant_seed) {
  return await callFunction('generate', course, question, { variant_seed });
}

/**
 *
 * @param {import('../lib/db-types.js').Submission} submission
 * @param {import('../lib/db-types.js').Variant} variant
 * @param {import('../lib/db-types.js').Question} question
 * @param {import('../lib/db-types.js').Course} question_course
 */
export async function grade(submission, variant, question, question_course) {
  return await callFunction('grade', question_course, question, { submission, variant });
}

// The following functions don't do anything for v2 questions; they're just
// here to satisfy the question server interface.

/**
 * @param {import('./types.ts').RenderSelection} _renderSelection
 * @param {import('../lib/db-types.js').Variant} _variant
 * @param {import('../lib/db-types.js').Question} _question
 * @param {import('../lib/db-types.js').Submission} _submission
 * @param {import('../lib/db-types.js').Submission[]} submissions
 * @param {import('../lib/db-types.js').Course} _course
 * @param {Record<string, any>} _locals
 * @returns {QuestionServerReturnValue<import('./types.ts').RenderResultData>}
 */
export async function render(
  _renderSelection,
  _variant,
  _question,
  _submission,
  submissions,
  _course,
  _locals,
) {
  const data = {
    extraHeadersHtml: '',
    questionHtml: '',
    submissionHtmls: submissions.map(() => ''),
    answerHtml: '',
  };
  return { courseIssues: [], data };
}

/**
 * @param {import('../lib/db-types.js').Question} _question
 * @param {import('../lib/db-types.js').Course} _course
 * @param {import('../lib/db-types.js').Variant} variant
 * @returns {QuestionServerReturnValue<import('./types.ts').PrepareResultData>}
 */
export async function prepare(_question, _course, variant) {
  const data = {
    params: variant.params ?? {},
    true_answer: variant.true_answer ?? {},
    options: variant.options,
  };
  return { courseIssues: [], data };
}

/**
 * @param {import('../lib/db-types.js').Submission} submission
 * @param {import('../lib/db-types.js').Variant} variant
 * @param {import('../lib/db-types.js').Question} _question
 * @param {import('../lib/db-types.js').Course} _course
 * @returns {QuestionServerReturnValue<import('./types.ts').ParseResultData>}
 */
export async function parse(submission, variant, _question, _course) {
  const data = {
    params: variant.params ?? {},
    true_answer: variant.true_answer ?? {},
    submitted_answer: submission.submitted_answer ?? {},
    raw_submitted_answer: submission.raw_submitted_answer ?? {},
    feedback: {},
    format_errors: {},
    gradable: true,
  };
  return { courseIssues: [], data };
}

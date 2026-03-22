import assert from 'node:assert';
import * as path from 'node:path';

import { contains } from '@prairielearn/path-utils';

import * as chunks from '../lib/chunks.js';
import { type Chunk } from '../lib/chunks.js';
import { withCodeCaller } from '../lib/code-caller/index.js';
import { config } from '../lib/config.js';
import { type Course, type Question, type Submission, type Variant } from '../lib/db-types.js';
import * as filePaths from '../lib/file-paths.js';
import { REPOSITORY_ROOT_PATH } from '../lib/paths.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import {
  type GenerateResultData,
  type GradeResultData,
  type ParseResultData,
  type ParseSubmission,
  type PrepareResultData,
  type PrepareVariant,
  type QuestionServerReturnValue,
  type RenderResultData,
  type RenderSelection,
} from './types.js';

async function prepareChunksIfNeeded(question: Question, course: Course) {
  const questionIds = await chunks.getTemplateQuestionIds(question);

  const templateQuestionChunks: Chunk[] = questionIds.map((id) => ({
    type: 'question',
    questionId: id,
  }));

  const chunksToLoad: Chunk[] = [
    { type: 'question', questionId: question.id },
    { type: 'clientFilesCourse' },
    { type: 'serverFilesCourse' },
    ...templateQuestionChunks,
  ];

  await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);
}

function getQuestionRuntimePath(
  questionServerPath: string,
  courseHostPath: string,
  courseRuntimePath: string,
) {
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

async function callFunction<Data>(
  func: string,
  question_course: Course,
  question: Question,
  inputData: any,
): Promise<QuestionServerReturnValue<Data>> {
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
  } catch (err: any) {
    err.fatal = true;
    return {
      // We don't have any useful data to return. We'll just lie to the type checker.
      data: {} as Data,
      courseIssues: [err],
    };
  }
}

export async function generate(
  question: Question,
  course: Course,
  variant_seed: string,
): QuestionServerReturnValue<GenerateResultData> {
  return await callFunction<GenerateResultData>('generate', course, question, { variant_seed });
}

export async function grade(
  submission: Submission,
  variant: Variant,
  question: Question,
  question_course: Course,
): QuestionServerReturnValue<GradeResultData> {
  return await callFunction<GradeResultData>('grade', question_course, question, {
    submission,
    variant,
  });
}

// The following functions don't do anything for v2 questions; they're just
// here to satisfy the question server interface.

export async function render({
  submissions,
}: {
  renderSelection: RenderSelection;
  variant: Variant;
  question: Question;
  submission: Submission | null;
  submissions: Submission[];
  course: Course;
  locals: UntypedResLocals;
}): QuestionServerReturnValue<RenderResultData> {
  const data = {
    extraHeadersHtml: '',
    questionHtml: '',
    submissionHtmls: submissions.map(() => ''),
    answerHtml: '',
  };
  return { courseIssues: [], data };
}

export async function prepare(
  _question: Question,
  _course: Course,
  variant: PrepareVariant,
): QuestionServerReturnValue<PrepareResultData> {
  const data = {
    params: variant.params ?? {},
    true_answer: variant.true_answer ?? {},
    options: variant.options ?? {},
  };
  return { courseIssues: [], data };
}

export async function parse(
  submission: ParseSubmission,
  variant: Variant,
  _question: Question,
  _course: Course,
): QuestionServerReturnValue<ParseResultData> {
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

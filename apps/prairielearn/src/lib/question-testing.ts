import jsonStringifySafe from 'json-stringify-safe';
import _ from 'lodash';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { selectUserById } from '../models/user.js';
import * as questionServers from '../question-servers/index.js';

import {
  type Course,
  type CourseInstance,
  type Question,
  type Submission,
  SubmissionSchema,
  type Variant,
} from './db-types.js';
import { gradeVariant, saveSubmission } from './grading.js';
import { writeCourseIssues } from './issues.js';
import { getAndRenderVariant } from './question-render.js';
import { ensureVariant, getQuestionCourse } from './question-variant.js';
import { type ServerJob, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestResultStats {
  generateDuration: number;
  initialRenderDuration: number;
  gradeDuration?: number;
  finalRenderDuration?: number;
}

interface TestQuestionResults {
  variant: Variant;
  /** The expected results from calling test(), kept in memory for comparison. */
  expectedTestData: questionServers.TestResultData | null;
  /** The submission that was created and graded through the normal pipeline. */
  test_submission: Submission | null;
  stats: TestResultStats;
}

export const TEST_TYPES = ['correct', 'incorrect', 'invalid'] as const;
export type TestType = (typeof TEST_TYPES)[number];

/**
 * Creates the data for a test submission.
 *
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param variant_course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 * @returns The test submission data, as well as a flag indicating if there was a fatal issue.
 */
export async function createTestSubmissionData(
  variant: Variant,
  question: Question,
  variant_course: Course,
  test_type: TestType,
  user_id: string,
  authn_user_id: string,
): Promise<{ data: questionServers.TestResultData; hasFatalIssue: boolean }> {
  const questionModule = questionServers.getModule(question.type);
  if (!questionModule.test) {
    throw new Error('Question type does not support testing, must be Freeform');
  }

  const question_course = await getQuestionCourse(question, variant_course);
  const { courseIssues, data } = await questionModule.test(
    variant,
    question,
    question_course,
    test_type,
  );
  const hasFatalIssue = courseIssues.some((issue) => issue.fatal);

  const studentMessage = 'Error creating test submission';
  const courseData = { variant, question, course: variant_course };
  await writeCourseIssues(
    courseIssues,
    variant,
    user_id,
    authn_user_id,
    studentMessage,
    courseData,
  );

  if (hasFatalIssue) data.gradable = false;
  return { data, hasFatalIssue };
}

/**
 * Compares expected test data from test() with the actual graded submission.
 *
 * @param expectedData - The expected results from calling test().
 * @param hasFatalIssue - Whether there was a fatal issue when generating the expected data.
 * @param test_submission - The actual submission that went through parse()/grade().
 * @returns A list of errors encountered during comparison.
 */
function compareTestResults(
  expectedData: questionServers.TestResultData,
  hasFatalIssue: boolean,
  test_submission: Submission,
): Error[] {
  const courseIssues: Error[] = [];

  const checkEqual = (name: string, var1: any, var2: any) => {
    const json1 = jsonStringifySafe(var1);
    const json2 = jsonStringifySafe(var2);
    if (!_.isEqual(var1, var2)) {
      courseIssues.push(new Error(`"${name}" mismatch: expected "${json1}" but got "${json2}"`));
    }
  };

  if (hasFatalIssue) {
    courseIssues.push(new Error('test() returned a fatal issue, skipping comparison'));
    return courseIssues;
  }
  if (test_submission.broken) {
    courseIssues.push(new Error('test_submission is broken, skipping comparison'));
    return courseIssues;
  }
  checkEqual('gradable', expectedData.gradable, test_submission.gradable);
  checkEqual(
    'format_errors keys',
    // We sort the keys to ensure that the comparison is order-independent.
    Object.keys(expectedData.format_errors).sort(),
    Object.keys(test_submission.format_errors ?? {}).sort(),
  );
  if (!test_submission.gradable || !expectedData.gradable) {
    return courseIssues;
  }
  checkEqual('partial_scores', expectedData.partial_scores, test_submission.partial_scores);
  checkEqual('score', expectedData.score, test_submission.score);
  return courseIssues;
}

/**
 * Internal worker for _testQuestion(). Do not call directly.
 * Tests a question variant by calling test() to get expected results, then
 * submitting through the normal parse()/grade() pipeline and comparing.
 * Issues will be inserted into the issues table.
 *
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 */
async function testVariant(
  variant: Variant,
  question: Question,
  course: Course,
  test_type: TestType,
  user_id: string,
  authn_user_id: string,
): Promise<{
  expectedTestData: questionServers.TestResultData;
  hasFatalIssue: boolean;
  test_submission: Submission;
}> {
  // Step 1: Call test() to get expected results - don't insert anything to the database
  const { data: expectedTestData, hasFatalIssue } = await createTestSubmissionData(
    variant,
    question,
    course,
    test_type,
    user_id,
    authn_user_id,
  );

  // Step 2: Submit the raw answer through the normal parse()/grade() pipeline
  const submission_data = {
    variant_id: variant.id,
    user_id,
    auth_user_id: authn_user_id,
    submitted_answer: expectedTestData.raw_submitted_answer,
  };
  const { submission_id: test_submission_id, variant: updated_variant } = await saveSubmission(
    submission_data,
    variant,
    question,
    course,
  );
  await gradeVariant({
    variant: updated_variant,
    check_submission_id: test_submission_id,
    question,
    variant_course: course,
    user_id,
    authn_user_id,
    ignoreGradeRateLimit: true,
    ignoreRealTimeGradingDisabled: true,
  });
  const test_submission = await selectSubmission(test_submission_id);

  // Step 3: Compare expected results with actual submission
  const courseIssues = compareTestResults(expectedTestData, hasFatalIssue, test_submission);
  const studentMessage = 'Question test failure';
  const courseData = {
    variant: updated_variant,
    question,
    course,
    expectedTestData,
    test_submission,
  };
  await writeCourseIssues(
    courseIssues,
    variant,
    user_id,
    authn_user_id,
    studentMessage,
    courseData,
  );
  return { expectedTestData, hasFatalIssue, test_submission };
}

/**
 * Test a question. Issues will be inserted into the issues table.
 *
 * @param question - The question for the variant.
 * @param course_instance - The course instance for the variant.
 * @param variant_course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param authn_user_id - The currently authenticated user.
 * @param user_id - The current effective user.
 * @param variant_seed - Optional seed for the variant.
 */
async function testQuestion(
  question: Question,
  course_instance: CourseInstance | null,
  variant_course: Course,
  test_type: TestType,
  authn_user_id: string,
  user_id: string,
  variant_seed?: string,
): Promise<TestQuestionResults> {
  let generateDuration;
  let initialRenderDuration;
  let gradeDuration;
  let finalRenderDuration;

  let variant;
  let expectedTestData: questionServers.TestResultData | null = null;
  let test_submission: Submission | null = null;

  const question_course = await getQuestionCourse(question, variant_course);
  const instance_question_id = null;
  const options = { variant_seed };
  const require_open = true;
  const client_fingerprint_id = null;
  const generateStart = Date.now();
  try {
    variant = await ensureVariant(
      question.id,
      instance_question_id,
      authn_user_id,
      authn_user_id,
      course_instance,
      variant_course,
      question_course,
      options,
      require_open,
      client_fingerprint_id,
    );
  } finally {
    const generateEnd = Date.now();
    generateDuration = generateEnd - generateStart;
  }

  const user = await selectUserById(user_id);
  const authn_user = await selectUserById(authn_user_id);

  const initialRenderStart = Date.now();
  try {
    await getAndRenderVariant(variant.id, null, {
      question,
      course: variant_course,
      urlPrefix: `/pl/course/${variant_course.id}`,
      user,
      authn_user,
      is_administrator: false,
    });
  } finally {
    const initialRenderEnd = Date.now();
    initialRenderDuration = initialRenderEnd - initialRenderStart;
  }

  if (!variant.broken_at) {
    const gradeStart = Date.now();
    try {
      ({ expectedTestData, test_submission } = await testVariant(
        variant,
        question,
        variant_course,
        test_type,
        user_id,
        authn_user_id,
      ));
    } finally {
      const gradeEnd = Date.now();
      gradeDuration = gradeEnd - gradeStart;
    }

    // Render once more to make sure we can render the various panels with the submitted data.
    const finalRenderStart = Date.now();
    try {
      await getAndRenderVariant(variant.id, null, {
        question,
        course: variant_course,
        urlPrefix: `/pl/course/${variant_course.id}`,
        user,
        authn_user,
        is_administrator: false,
      });
    } finally {
      const finalRenderEnd = Date.now();
      finalRenderDuration = finalRenderEnd - finalRenderStart;
    }
  }

  const stats = { generateDuration, initialRenderDuration, gradeDuration, finalRenderDuration };
  return { variant, expectedTestData, test_submission, stats };
}

/**
 * Internal worker for _testQuestion(). Do not call directly.
 * Runs a single test.
 */
async function runTest({
  logger,
  showDetails,
  question,
  course_instance,
  course,
  test_type,
  user_id,
  authn_user_id,
  variant_seed,
}: {
  /** The server job to run within. */
  logger: ServerJob;
  /** Whether to display test data details. */
  showDetails: boolean;
  /** The question for the variant. */
  question: Question;
  /** The course instance for the variant. */
  course_instance: CourseInstance | null;
  /** The course for the variant. */
  course: Course;
  /** The type of test to run. */
  test_type: TestType;
  /** The current effective user. */
  user_id: string;
  /** The currently authenticated user. */
  authn_user_id: string;
  /** Optional seed for the variant. */
  variant_seed?: string;
}): Promise<{ success: boolean; stats: TestResultStats }> {
  logger.verbose('Testing ' + question.qid);
  const { variant, expectedTestData, test_submission, stats } = await testQuestion(
    question,
    course_instance,
    course,
    test_type,
    authn_user_id,
    user_id,
    variant_seed,
  );

  if (showDetails) {
    const variantKeys = ['broken_at', 'options', 'params', 'true_answer', 'variant_seed'];
    const expectedDataKeys = [
      'format_errors',
      'gradable',
      'partial_scores',
      'raw_submitted_answer',
      'score',
    ];
    const submissionKeys = [
      'broken',
      'correct',
      'feedback',
      'format_errors',
      'gradable',
      'grading_method',
      'partial_scores',
      'raw_submitted_answer',
      'score',
      'submitted_answer',
      'true_answer',
    ];
    logger.verbose('variant:\n' + jsonStringifySafe(_.pick(variant, variantKeys), null, '    '));
    if (expectedTestData) {
      logger.verbose(
        'expectedTestData:\n' +
          jsonStringifySafe(_.pick(expectedTestData, expectedDataKeys), null, '    '),
      );
    }
    if (test_submission) {
      logger.verbose(
        'test_submission:\n' +
          jsonStringifySafe(_.pick(test_submission, submissionKeys), null, '    '),
      );
    }
  }

  const issueCount = await sqldb.queryRow(
    sql.select_issue_count_for_variant,
    { variant_id: variant.id },
    z.number(),
  );

  if (issueCount > 0) {
    logger.verbose(`ERROR: ${issueCount} issues encountered during test.`);
  } else {
    logger.verbose('Success: no issues during test');
  }

  return { success: issueCount === 0, stats };
}

/**
 * Start a job sequence to test a question.
 *
 * @returns The job sequence ID.
 */
export async function startTestQuestion({
  count,
  showDetails,
  question,
  course_instance,
  course,
  user_id,
  authn_user_id,
  variantSeedPrefix,
}: {
  /** The number of times to test, will run each possible test ('correct', 'incorrect', 'invalid') this many times. */
  count: number;
  /** Whether to display test data details. */
  showDetails: boolean;
  /** The question for the variant. */
  question: Question;
  /** The course instance for the variant; may be null for instructor questions. */
  course_instance: CourseInstance | null;
  /** The course for the variant. */
  course: Course;
  /** The current effective user. */
  user_id: string;
  /** The currently authenticated user. */
  authn_user_id: string;
  /**
   * Optional prefix for variant seeds. When provided, seeds will be generated
   * deterministically as `{prefix}-{iteration}` for each test iteration. This
   * ensures reproducible tests while still testing different variants.
   */
  variantSeedPrefix?: string;
}): Promise<string> {
  let success = true;

  const serverJob = await createServerJob({
    courseId: course.id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'test_question',
    description: 'Test ' + question.qid,
  });

  const stats: TestResultStats[] = [];

  serverJob.executeInBackground(async (job) => {
    for (const iter of Array.from({ length: count * TEST_TYPES.length }).keys()) {
      const type = TEST_TYPES[iter % TEST_TYPES.length];
      const testIterationIndex = Math.floor(iter / TEST_TYPES.length) + 1;
      // Generate a deterministic seed if a prefix was provided, otherwise let the system generate a random one
      const variant_seed = variantSeedPrefix ? `${variantSeedPrefix}-${iter}` : undefined;
      job.verbose(`Test ${testIterationIndex}, type ${type}`);
      const result = await runTest({
        logger: job,
        showDetails,
        question,
        course_instance,
        course,
        test_type: type,
        user_id,
        authn_user_id,
        variant_seed,
      });
      success = success && result.success;
      stats.push(result.stats);
    }

    function printStats(label: string, key: keyof TestResultStats) {
      let min = Number.MAX_SAFE_INTEGER;
      let max = 0;
      let count = 0;
      let sum = 0;
      stats.forEach((stat) => {
        const value = stat[key];
        if (value == null) return;
        count += 1;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });

      if (count === 0) {
        job.verbose(`${label} No data`);
        return;
      }

      const avg = Math.round((sum / count) * 100) / 100;
      job.info(`${label} ${count} tests, min ${min}ms, avg ${avg}ms, max ${max}ms`);
    }

    printStats('Generate/prepare:', 'generateDuration');
    printStats('Initial render:  ', 'initialRenderDuration');
    printStats('Parse/grade:     ', 'gradeDuration');
    printStats('Final render:    ', 'finalRenderDuration');

    if (!success) {
      throw new Error('Some tests failed. See the "Issues" page for details.');
    }
  });

  return serverJob.jobSequenceId;
}

async function selectSubmission(submission_id: string): Promise<Submission> {
  return await sqldb.queryRow(sql.select_submission_by_id, { submission_id }, SubmissionSchema);
}

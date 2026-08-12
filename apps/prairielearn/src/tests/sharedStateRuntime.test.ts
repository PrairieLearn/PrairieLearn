import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  type Course,
  type CourseInstance,
  type Question,
  SubmissionSchema,
  type User,
  UserSharedStateValueSchema,
  type Variant,
  VariantSchema,
} from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { saveAndGradeSubmission } from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectCourseById, updateCourseSharingName } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import {
  extractAndSaveCSRFToken,
  extractAndSaveVariantId,
  fetchCheerio,
  parseAssessmentInstanceId,
} from './helperClient.js';
import * as helperServer from './helperServer.js';
import * as util from './sync/util.js';
import { type AuthUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';
import { enrollUser } from './utils/enrollments.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const OBJECT_NAME = 'labProgress';
const OBJECT_UUID = '78d2296e-7513-42f4-846e-c0b839921def';
const LOCAL_OBJECT_NAME = 'progressState';

const COURSE_A_SHARING_NAME = 'shared-state-course-a';
const COURSE_C_SHARING_NAME = 'shared-state-course-c';
const PUBLIC_PREVIEW_SHARING_NAME = 'shared-state-test';

const WRITER_QID = 'sharedStateWriter';
const READER_QID = 'sharedStateReader';
const WRITER_A_QID = 'sharedStateWriterA';
const READER_A_QID = 'sharedStateReaderA';
const WRITER_C_QID = 'sharedStateWriterC';
const READER_C_QID = 'sharedStateReaderC';

const WRITER_SERVER_PY = `
def generate(data):
    pass

def grade(data):
    current = data["shared_state"]["progressState"]["count"]
    # Coerced with int() because a real HTTP submission carries this as a
    # string; direct library-level test calls already pass a real int.
    data["shared_state"]["progressState"]["count"] = current + int(data["submitted_answers"]["increment"])
    data["score"] = 1
`;

const READER_SERVER_PY = `
def generate(data):
    data["params"]["observed_count"] = data["shared_state"]["progressState"]["count"]
`;

const QUESTION_HTML = '<pl-question-panel><p>Test question.</p></pl-question-panel>';

async function buildOriginCourseDir({
  courseName,
  writerQid,
  writerUuid,
  readerQid,
  readerUuid,
  includeAssessmentQuestions = false,
}: {
  courseName: string;
  writerQid: string;
  writerUuid: string;
  readerQid: string;
  readerUuid: string;
  includeAssessmentQuestions?: boolean;
}): Promise<string> {
  const courseData: util.CourseData = util.getCourseData();
  courseData.course.name = courseName;
  courseData.course.sharedState = {
    [OBJECT_NAME]: {
      uuid: OBJECT_UUID,
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: {
        count: { type: 'number', default: 0 },
      },
    },
  };
  courseData.questions[writerQid] = {
    uuid: writerUuid,
    title: 'Shared state writer',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: { [LOCAL_OBJECT_NAME]: OBJECT_NAME },
    sharePublicly: true,
  };
  courseData.questions[readerQid] = {
    uuid: readerUuid,
    title: 'Shared state reader',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: { [LOCAL_OBJECT_NAME]: OBJECT_NAME },
    sharePublicly: true,
  };

  if (includeAssessmentQuestions) {
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
      util.ASSESSMENT_ID
    ].allowAccess = [
      {
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID].zones = [
      {
        title: 'zone 1',
        questions: [
          { points: 10, alternatives: [{ id: writerQid }] },
          { points: 10, alternatives: [{ id: readerQid }] },
        ],
      },
    ];
  }

  const courseDir = await util.writeCourseToTempDirectory(courseData);

  await fs.writeFile(path.join(courseDir, 'questions', writerQid, 'server.py'), WRITER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', writerQid, 'question.html'), QUESTION_HTML);
  await fs.writeFile(path.join(courseDir, 'questions', readerQid, 'server.py'), READER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', readerQid, 'question.html'), QUESTION_HTML);

  return courseDir;
}

async function syncOriginCourse(args: Parameters<typeof buildOriginCourseDir>[0]): Promise<Course> {
  const courseDir = await buildOriginCourseDir(args);
  const syncResults = await util.syncCourseData(courseDir);
  return await selectCourseById(syncResults.courseId);
}

async function createPublicAssessmentInstance({
  course,
  userUid,
}: {
  course: Course;
  userUid: string;
}): Promise<{
  assessmentInstanceId: string;
  courseInstance: CourseInstance;
  user: User;
}> {
  const courseInstance = await selectCourseInstanceByShortName({
    course,
    shortName: util.COURSE_INSTANCE_ID,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: util.ASSESSMENT_ID,
  });
  const user = await selectOrInsertUserByUid(userUid);

  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });

  return { assessmentInstanceId, courseInstance, user };
}

async function selectInstanceQuestionId({
  assessmentInstanceId,
  qid,
}: {
  assessmentInstanceId: string;
  qid: string;
}): Promise<string> {
  return await sqldb.queryScalar(
    sql.select_instance_question_by_qid,
    { assessment_instance_id: assessmentInstanceId, qid },
    IdSchema,
  );
}

async function createAssessmentVariant({
  assessmentInstanceId,
  qid,
  user,
  courseInstance,
  variantCourse,
  questionCourse,
}: {
  assessmentInstanceId: string;
  qid: string;
  user: User;
  courseInstance: CourseInstance;
  variantCourse: Course;
  questionCourse: Course;
}): Promise<{ question: Question; variant: Variant }> {
  const question = await selectQuestionByQid({ course_id: questionCourse.id, qid });
  const instanceQuestionId = await selectInstanceQuestionId({ assessmentInstanceId, qid });
  const variant = await ensureVariant({
    question_id: null,
    instance_question_id: instanceQuestionId,
    user_id: user.id,
    authn_user_id: user.id,
    course_instance: courseInstance,
    variant_course: variantCourse,
    question_course: questionCourse,
    options: {},
    require_open: true,
    client_fingerprint_id: null,
  });

  return { question, variant };
}

async function createPreviewVariant({
  question,
  user,
  course,
  requireOpen = true,
}: {
  question: Question;
  user: User;
  course: Course;
  requireOpen?: boolean;
}): Promise<Variant> {
  return await ensureVariant({
    question_id: question.id,
    instance_question_id: null,
    user_id: user.id,
    authn_user_id: user.id,
    course_instance: null,
    variant_course: course,
    question_course: course,
    options: {},
    require_open: requireOpen,
    client_fingerprint_id: null,
  });
}

async function gradeIncrementingWriter({
  variant,
  question,
  user,
  course,
  increment,
}: {
  variant: Variant;
  question: Question;
  user: User;
  course: Course;
  increment: number;
}): Promise<Variant> {
  await saveAndGradeSubmission(
    {
      variant_id: variant.id,
      user_id: user.id,
      auth_user_id: user.id,
      submitted_answer: { increment },
    },
    variant,
    question,
    course,
    true,
    true,
  );

  const gradedVariant = await sqldb.queryRow(
    sql.select_variant_by_id,
    { variant_id: variant.id },
    VariantSchema,
  );
  assert.equal(gradedVariant.broken_at, null, 'writer variant should not be broken');

  return gradedVariant;
}

async function syncConsumingCourse(): Promise<Course> {
  const consumingCourseData = util.getCourseData();
  consumingCourseData.course.name = 'SHARED STATE CONSUMING 101';
  consumingCourseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
    util.ASSESSMENT_ID
  ].zones = [
    {
      title: 'zone 1',
      questions: [
        { points: 10, id: `@${COURSE_A_SHARING_NAME}/${WRITER_A_QID}` },
        { points: 10, id: `@${COURSE_A_SHARING_NAME}/${READER_A_QID}` },
        { points: 10, id: `@${COURSE_C_SHARING_NAME}/${WRITER_C_QID}` },
        { points: 10, id: `@${COURSE_C_SHARING_NAME}/${READER_C_QID}` },
      ],
    },
  ];
  const { syncResults } = await util.writeAndSyncCourseData(consumingCourseData);
  return await selectCourseById(syncResults.courseId);
}

describe('Shared-state runtime behavior', { timeout: 60_000 }, () => {
  let runtimeCourse: Course;
  let runtimeCourseInstance: CourseInstance;
  let runtimeAssessmentInstanceId: string;
  let runtimeUser: User;

  let courseA: Course;
  let courseC: Course;
  let consumingCourse: Course;
  let consumingCourseInstance: CourseInstance;
  let sharedAssessmentInstanceId: string;
  let sharedUser: User;

  beforeAll(async () => {
    await withConfig({ workersCount: os.cpus().length }, async () => {
      await helperServer.before()();
    });
    await features.enable('question-sharing');

    runtimeCourse = await syncOriginCourse({
      courseName: 'SHARED STATE RUNTIME 101',
      writerQid: WRITER_QID,
      writerUuid: '1b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a1b6a',
      readerQid: READER_QID,
      readerUuid: '2b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a2b6b',
      includeAssessmentQuestions: true,
    });
    await updateCourseSharingName({
      course_id: runtimeCourse.id,
      sharing_name: PUBLIC_PREVIEW_SHARING_NAME,
    });
    ({
      assessmentInstanceId: runtimeAssessmentInstanceId,
      courseInstance: runtimeCourseInstance,
      user: runtimeUser,
    } = await createPublicAssessmentInstance({
      course: runtimeCourse,
      userUid: 'shared-state-runtime-user@example.com',
    }));

    courseA = await syncOriginCourse({
      courseName: 'SHARED STATE ORIGIN A',
      writerQid: WRITER_A_QID,
      writerUuid: '5b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a5b6a',
      readerQid: READER_A_QID,
      readerUuid: '6b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a6b6b',
    });
    await updateCourseSharingName({ course_id: courseA.id, sharing_name: COURSE_A_SHARING_NAME });

    courseC = await syncOriginCourse({
      courseName: 'SHARED STATE ORIGIN C',
      writerQid: WRITER_C_QID,
      writerUuid: '7b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a7b6c',
      readerQid: READER_C_QID,
      readerUuid: '8b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a8b6d',
    });
    await updateCourseSharingName({ course_id: courseC.id, sharing_name: COURSE_C_SHARING_NAME });

    consumingCourse = await syncConsumingCourse();
    ({
      assessmentInstanceId: sharedAssessmentInstanceId,
      courseInstance: consumingCourseInstance,
      user: sharedUser,
    } = await createPublicAssessmentInstance({
      course: consumingCourse,
      userUid: 'shared-state-shared-questions-user@example.com',
    }));
  });

  afterAll(helperServer.after);

  it('lets a later question see an earlier question’s graded shared-state write', async () => {
    const { question: writerQuestion, variant: writerVariant } = await createAssessmentVariant({
      assessmentInstanceId: runtimeAssessmentInstanceId,
      qid: WRITER_QID,
      user: runtimeUser,
      courseInstance: runtimeCourseInstance,
      variantCourse: runtimeCourse,
      questionCourse: runtimeCourse,
    });

    await gradeIncrementingWriter({
      variant: writerVariant,
      question: writerQuestion,
      user: runtimeUser,
      course: runtimeCourse,
      increment: 5,
    });

    const { variant: readerVariant } = await createAssessmentVariant({
      assessmentInstanceId: runtimeAssessmentInstanceId,
      qid: READER_QID,
      user: runtimeUser,
      courseInstance: runtimeCourseInstance,
      variantCourse: runtimeCourse,
      questionCourse: runtimeCourse,
    });

    assert.equal(readerVariant.broken_at, null, 'reader variant should not be broken');
    assert.equal(readerVariant.params?.observed_count, 5);
  });

  it('lets a later question see an earlier question’s graded shared-state write when a student answers through the real assessment pages', async () => {
    // Unlike the test above, this drives the whole thing through the actual
    // student-facing routes (start assessment, view question, submit answer)
    // instead of calling `ensureVariant`/`saveAndGradeSubmission` directly,
    // so it also exercises the assessment/instance-question controllers and
    // the CSRF/variant-id form plumbing a real student's browser would use.
    const studentUser: AuthUser = {
      uid: 'shared-state-real-student@example.com',
      name: 'Shared State Student',
      uin: '00000098',
    };
    await enrollUser(runtimeCourseInstance.id, studentUser);

    const courseInstanceBaseUrl = `http://localhost:${config.serverPort}/pl/course_instance/${runtimeCourseInstance.id}`;
    const assessment = await selectAssessmentByTid({
      course_instance_id: runtimeCourseInstance.id,
      tid: util.ASSESSMENT_ID,
    });
    const assessmentUrl = `${courseInstanceBaseUrl}/assessment/${assessment.id}/`;

    await withUser(studentUser, async () => {
      const startPage = await fetchCheerio(assessmentUrl);
      assert.equal(startPage.status, 200);

      const context: Record<string, any> = {};
      extractAndSaveCSRFToken(context, startPage.$, 'form');

      const startResponse = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
      });
      assert.equal(startResponse.status, 200);
      const assessmentInstanceId = String(parseAssessmentInstanceId(startResponse.url));

      const writerInstanceQuestionId = await selectInstanceQuestionId({
        assessmentInstanceId,
        qid: WRITER_QID,
      });
      const writerUrl = `${courseInstanceBaseUrl}/instance_question/${writerInstanceQuestionId}/`;

      const writerPage = await fetchCheerio(writerUrl);
      assert.equal(writerPage.status, 200);
      extractAndSaveCSRFToken(context, writerPage.$, '.question-form');
      extractAndSaveVariantId(context, writerPage.$, '.question-form');

      const writerGradeResponse = await fetch(writerUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          increment: '5',
        }),
      });
      assert.equal(writerGradeResponse.status, 200);

      const writerSubmission = await sqldb.queryRow(
        sql.select_last_submission_for_variant,
        { variant_id: context.__variant_id },
        SubmissionSchema,
      );
      assert.equal(writerSubmission.broken, false, 'writer submission should not be broken');

      const readerInstanceQuestionId = await selectInstanceQuestionId({
        assessmentInstanceId,
        qid: READER_QID,
      });
      const readerUrl = `${courseInstanceBaseUrl}/instance_question/${readerInstanceQuestionId}/`;
      const readerPage = await fetchCheerio(readerUrl);
      assert.equal(readerPage.status, 200);
      extractAndSaveVariantId(context, readerPage.$, '.question-form');

      const readerVariant = await sqldb.queryRow(
        sql.select_variant_by_id,
        { variant_id: context.__variant_id },
        VariantSchema,
      );
      assert.equal(readerVariant.broken_at, null, 'reader variant should not be broken');
      assert.equal(readerVariant.params?.observed_count, 5);
    });
  });

  it('populates shared-state defaults (rather than an empty object) for a fresh instructor preview variant', async () => {
    // Instructor preview variants have no instance_question_id, and so no
    // assessment_instance_id to read live values from. `data["shared_state"]`
    // must still be populated with each object's schema defaults here —
    // otherwise question code that does `data["shared_state"]["labProgress"]`
    // raises a Python KeyError, which freeform.ts surfaces as a fatal course
    // issue (the variant/submission gets marked broken).
    const writerQuestion = await selectQuestionByQid({
      course_id: runtimeCourse.id,
      qid: WRITER_QID,
    });
    const user = await selectOrInsertUserByUid('shared-state-preview-defaults-user@example.com');

    const previewVariant = await createPreviewVariant({
      question: writerQuestion,
      user,
      course: runtimeCourse,
    });
    assert.equal(previewVariant.broken_at, null, 'preview variant should not be broken');

    const gradedPreviewVariant = await gradeIncrementingWriter({
      variant: previewVariant,
      question: writerQuestion,
      user,
      course: runtimeCourse,
      increment: 5,
    });
    assert.equal(
      gradedPreviewVariant.broken_at,
      null,
      'grading a preview variant should not break it, even though it has no assessment instance',
    );
  });

  it('persists preview shared-state writes for the previewing user, across variants and across questions', async () => {
    // A preview variant has no assessment instance to scope shared state
    // to, so it's scoped to the previewing user instead: writes made while
    // previewing one question, or one variant, are visible when the same
    // user previews another question (or clicks "New variant") that reads
    // the same shared-state object.
    const writerQuestion = await selectQuestionByQid({
      course_id: runtimeCourse.id,
      qid: WRITER_QID,
    });
    const readerQuestion = await selectQuestionByQid({
      course_id: runtimeCourse.id,
      qid: READER_QID,
    });
    const user = await selectOrInsertUserByUid('shared-state-preview-persist-user@example.com');

    const firstWriterVariant = await createPreviewVariant({
      question: writerQuestion,
      user,
      course: runtimeCourse,
    });
    await gradeIncrementingWriter({
      variant: firstWriterVariant,
      question: writerQuestion,
      user,
      course: runtimeCourse,
      increment: 5,
    });

    const storedValue = await sqldb.queryRow(
      sql.select_user_shared_state_value,
      { user_id: user.id, name: OBJECT_NAME },
      UserSharedStateValueSchema,
    );
    assert.equal(storedValue.data.count, 5, 'the write should be persisted for this user');

    // A brand-new preview variant of a *different* question, for the same
    // user, should see the persisted count rather than the schema default.
    const readerPreviewVariant = await createPreviewVariant({
      question: readerQuestion,
      user,
      course: runtimeCourse,
      requireOpen: false,
    });
    assert.equal(
      readerPreviewVariant.broken_at,
      null,
      'reader preview variant should not be broken',
    );
    assert.equal(readerPreviewVariant.params?.observed_count, 5);

    // Submitting again, on a new writer preview variant, should accumulate
    // onto the persisted value rather than restarting from the default.
    const secondWriterVariant = await createPreviewVariant({
      question: writerQuestion,
      user,
      course: runtimeCourse,
      requireOpen: false,
    });
    await gradeIncrementingWriter({
      variant: secondWriterVariant,
      question: writerQuestion,
      user,
      course: runtimeCourse,
      increment: 1,
    });
    const accumulatedValue = await sqldb.queryRow(
      sql.select_user_shared_state_value,
      { user_id: user.id, name: OBJECT_NAME },
      UserSharedStateValueSchema,
    );
    assert.equal(accumulatedValue.data.count, 6);

    // A different user previewing the reader question should still see the
    // schema default — preview shared state is scoped per-user, not global.
    const otherUser = await selectOrInsertUserByUid('shared-state-preview-other-user@example.com');
    const otherReaderVariant = await createPreviewVariant({
      question: readerQuestion,
      user: otherUser,
      course: runtimeCourse,
    });
    assert.equal(otherReaderVariant.params?.observed_count, 0);
  });

  it('works the same way through the public question preview route', async () => {
    // Public question previews go through the same no-instance-question,
    // no-course-instance path as instructor previews (see the tests above),
    // but this drives it through the actual HTTP route end to end, since
    // that path also runs the public-preview identity-masking logic in
    // `user-context.ts`.
    const writerQuestion = await selectQuestionByQid({
      course_id: runtimeCourse.id,
      qid: WRITER_QID,
    });
    const readerQuestion = await selectQuestionByQid({
      course_id: runtimeCourse.id,
      qid: READER_QID,
    });
    const publicBaseUrl = `http://localhost:${config.serverPort}/pl/public/course/${runtimeCourse.id}/question`;

    const writerPreviewUrl = `${publicBaseUrl}/${writerQuestion.id}/preview`;
    const writerPage = await fetchCheerio(writerPreviewUrl);
    assert.equal(writerPage.status, 200);

    const context: Record<string, any> = {};
    extractAndSaveCSRFToken(context, writerPage.$, '.question-form');
    extractAndSaveVariantId(context, writerPage.$, '.question-form');

    const gradeResponse = await fetch(writerPreviewUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.__variant_id,
        increment: '5',
      }),
    });
    assert.equal(gradeResponse.status, 200);

    const gradedVariant = await sqldb.queryRow(
      sql.select_variant_by_id,
      { variant_id: context.__variant_id },
      VariantSchema,
    );
    assert.equal(
      gradedVariant.broken_at,
      null,
      'public preview writer variant should not be broken',
    );

    const submission = await sqldb.queryRow(
      sql.select_last_submission_for_variant,
      { variant_id: context.__variant_id },
      SubmissionSchema,
    );
    assert.equal(submission.broken, false);
    assert.equal(submission.score, 1);

    // A fresh, independent public preview of the reader question has no
    // assessment instance either, so it's scoped to the previewing user
    // instead — the same (default, unauthenticated-test) user as the
    // writer preview above — and should see that preview's graded write.
    const readerPreviewUrl = `${publicBaseUrl}/${readerQuestion.id}/preview`;
    const readerPage = await fetchCheerio(readerPreviewUrl);
    assert.equal(readerPage.status, 200);
    const readerContext: Record<string, any> = {};
    extractAndSaveVariantId(readerContext, readerPage.$, '.question-form');

    const readerVariant = await sqldb.queryRow(
      sql.select_variant_by_id,
      { variant_id: readerContext.__variant_id },
      VariantSchema,
    );
    assert.equal(
      readerVariant.broken_at,
      null,
      'public preview reader variant should not be broken',
    );
    assert.equal(readerVariant.params?.observed_count, 5);
  });

  it('scopes shared-question live state by the imported question’s origin course', async () => {
    const { question: writerAQuestion, variant: writerAVariant } = await createAssessmentVariant({
      assessmentInstanceId: sharedAssessmentInstanceId,
      qid: WRITER_A_QID,
      user: sharedUser,
      courseInstance: consumingCourseInstance,
      variantCourse: consumingCourse,
      questionCourse: courseA,
    });
    await gradeIncrementingWriter({
      variant: writerAVariant,
      question: writerAQuestion,
      user: sharedUser,
      course: consumingCourse,
      increment: 5,
    });

    const { variant: readerAVariant } = await createAssessmentVariant({
      assessmentInstanceId: sharedAssessmentInstanceId,
      qid: READER_A_QID,
      user: sharedUser,
      courseInstance: consumingCourseInstance,
      variantCourse: consumingCourse,
      questionCourse: courseA,
    });
    assert.equal(readerAVariant.broken_at, null, 'reader variant should not be broken');
    assert.equal(readerAVariant.params?.observed_count, 5);

    const { question: writerCQuestion, variant: writerCVariant } = await createAssessmentVariant({
      assessmentInstanceId: sharedAssessmentInstanceId,
      qid: WRITER_C_QID,
      user: sharedUser,
      courseInstance: consumingCourseInstance,
      variantCourse: consumingCourse,
      questionCourse: courseC,
    });
    await gradeIncrementingWriter({
      variant: writerCVariant,
      question: writerCQuestion,
      user: sharedUser,
      course: consumingCourse,
      increment: 7,
    });

    const { variant: readerCVariant } = await createAssessmentVariant({
      assessmentInstanceId: sharedAssessmentInstanceId,
      qid: READER_C_QID,
      user: sharedUser,
      courseInstance: consumingCourseInstance,
      variantCourse: consumingCourse,
      questionCourse: courseC,
    });
    assert.equal(readerCVariant.broken_at, null, 'reader variant should not be broken');
    assert.equal(readerCVariant.params?.observed_count, 7);
  });
});

import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { SubmissionSchema, UserSharedStateValueSchema, VariantSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { saveAndGradeSubmission } from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectOrInsertCourseByPath, updateCourseSharingName } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import { extractAndSaveCSRFToken, extractAndSaveVariantId, fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';
import * as util from './sync/util.js';
import { withConfig } from './utils/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const WRITER_QID = 'sharedStateWriter';
const READER_QID = 'sharedStateReader';

const WRITER_SERVER_PY = `
def generate(data):
    pass

def grade(data):
    current = data["shared_state"]["labProgress"]["count"]
    # Coerced with int() because a real HTTP submission carries this as a
    # string; direct library-level test calls already pass a real int.
    data["shared_state"]["labProgress"]["count"] = current + int(data["submitted_answers"]["increment"])
    data["score"] = 1
`;

const READER_SERVER_PY = `
def generate(data):
    data["params"]["observed_count"] = data["shared_state"]["labProgress"]["count"]
`;

const QUESTION_HTML = '<pl-question-panel><p>Test question.</p></pl-question-panel>';

async function buildCourseDir(): Promise<string> {
  const courseData: util.CourseData = util.getCourseData();
  courseData.course.sharedState = {
    labProgress: {
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: {
        count: { type: 'number', default: 0 },
      },
    },
  };
  courseData.questions[WRITER_QID] = {
    uuid: '5b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a5b6a',
    title: 'Shared state writer',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: ['labProgress'],
    sharePublicly: true,
  };
  courseData.questions[READER_QID] = {
    uuid: '6b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a6b6b',
    title: 'Shared state reader',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: ['labProgress'],
    sharePublicly: true,
  };
  courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID].zones = [
    {
      title: 'zone 1',
      questions: [
        { points: 10, alternatives: [{ id: WRITER_QID }] },
        { points: 10, alternatives: [{ id: READER_QID }] },
      ],
    },
  ];

  const courseDir = await util.writeCourseToTempDirectory(courseData);

  await fs.writeFile(path.join(courseDir, 'questions', WRITER_QID, 'server.py'), WRITER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', WRITER_QID, 'question.html'), QUESTION_HTML);
  await fs.writeFile(path.join(courseDir, 'questions', READER_QID, 'server.py'), READER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', READER_QID, 'question.html'), QUESTION_HTML);

  return courseDir;
}

describe(
  'Shared-state runtime behavior across questions in one assessment instance',
  { timeout: 60_000 },
  () => {
    let courseDir: string;

    beforeAll(async () => {
      courseDir = await buildCourseDir();
      await withConfig({ workersCount: os.cpus().length }, async () => {
        await helperServer.before(courseDir)();
      });
    });

    afterAll(helperServer.after);

    it('lets a later question see an earlier question’s graded shared-state write', async () => {
      const course = await selectOrInsertCourseByPath(courseDir);
      const courseInstance = await selectCourseInstanceByShortName({
        course,
        shortName: util.COURSE_INSTANCE_ID,
      });
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: util.ASSESSMENT_ID,
      });
      const user = await selectOrInsertUserByUid('shared-state-runtime-user@example.com');

      const assessmentInstanceId = await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });

      const writerQuestion = await selectQuestionByQid({ course_id: course.id, qid: WRITER_QID });

      const writerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: WRITER_QID },
        IdSchema,
      );

      // Create and grade a variant of the writer question, which increments
      // the shared "count" property by the submitted answer.
      const writerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: writerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: courseInstance,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      await saveAndGradeSubmission(
        {
          variant_id: writerVariant.id,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: { increment: 5 },
        },
        writerVariant,
        writerQuestion,
        course,
        true,
        true,
      );

      const gradedWriterVariant = await sqldb.queryRow(
        sql.select_variant_by_id,
        { variant_id: writerVariant.id },
        VariantSchema,
      );
      assert.equal(gradedWriterVariant.broken_at, null, 'writer variant should not be broken');

      // Now create a variant of the reader question, in the same assessment
      // instance. Its `generate()` reads the shared "count" property into
      // its own params, which should reflect the writer's graded update.
      const readerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: READER_QID },
        IdSchema,
      );
      const readerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: readerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: courseInstance,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      assert.equal(readerVariant.broken_at, null, 'reader variant should not be broken');
      assert.equal(readerVariant.params?.observed_count, 5);
    });

    it('populates shared-state defaults (rather than an empty object) for a fresh instructor preview variant', async () => {
      // Instructor preview variants have no instance_question_id, and so no
      // assessment_instance_id to read live values from. `data["shared_state"]`
      // must still be populated with each object's schema defaults here —
      // otherwise question code that does `data["shared_state"]["labProgress"]`
      // raises a Python KeyError, which freeform.ts surfaces as a fatal course
      // issue (the variant/submission gets marked broken).
      const course = await selectOrInsertCourseByPath(courseDir);
      const writerQuestion = await selectQuestionByQid({ course_id: course.id, qid: WRITER_QID });
      const user = await selectOrInsertUserByUid('shared-state-preview-defaults-user@example.com');

      const previewVariant = await ensureVariant({
        question_id: writerQuestion.id,
        instance_question_id: null,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: null,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });
      assert.equal(previewVariant.broken_at, null, 'preview variant should not be broken');

      await saveAndGradeSubmission(
        {
          variant_id: previewVariant.id,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: { increment: 5 },
        },
        previewVariant,
        writerQuestion,
        course,
        true,
        true,
      );

      const gradedPreviewVariant = await sqldb.queryRow(
        sql.select_variant_by_id,
        { variant_id: previewVariant.id },
        VariantSchema,
      );
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
      const course = await selectOrInsertCourseByPath(courseDir);
      const writerQuestion = await selectQuestionByQid({ course_id: course.id, qid: WRITER_QID });
      const readerQuestion = await selectQuestionByQid({ course_id: course.id, qid: READER_QID });
      const user = await selectOrInsertUserByUid('shared-state-preview-persist-user@example.com');

      const firstWriterVariant = await ensureVariant({
        question_id: writerQuestion.id,
        instance_question_id: null,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: null,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      await saveAndGradeSubmission(
        {
          variant_id: firstWriterVariant.id,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: { increment: 5 },
        },
        firstWriterVariant,
        writerQuestion,
        course,
        true,
        true,
      );

      const storedValue = await sqldb.queryRow(
        sql.select_user_shared_state_value,
        { user_id: user.id, name: 'labProgress' },
        UserSharedStateValueSchema,
      );
      assert.equal(storedValue.data.count, 5, 'the write should be persisted for this user');

      // A brand-new preview variant of a *different* question, for the same
      // user, should see the persisted count rather than the schema default.
      const readerPreviewVariant = await ensureVariant({
        question_id: readerQuestion.id,
        instance_question_id: null,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: null,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: false,
        client_fingerprint_id: null,
      });
      assert.equal(
        readerPreviewVariant.broken_at,
        null,
        'reader preview variant should not be broken',
      );
      assert.equal(readerPreviewVariant.params?.observed_count, 5);

      // Submitting again, on a new writer preview variant, should accumulate
      // onto the persisted value rather than restarting from the default.
      const secondWriterVariant = await ensureVariant({
        question_id: writerQuestion.id,
        instance_question_id: null,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: null,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: false,
        client_fingerprint_id: null,
      });
      await saveAndGradeSubmission(
        {
          variant_id: secondWriterVariant.id,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: { increment: 1 },
        },
        secondWriterVariant,
        writerQuestion,
        course,
        true,
        true,
      );
      const accumulatedValue = await sqldb.queryRow(
        sql.select_user_shared_state_value,
        { user_id: user.id, name: 'labProgress' },
        UserSharedStateValueSchema,
      );
      assert.equal(accumulatedValue.data.count, 6);

      // A different user previewing the reader question should still see the
      // schema default — preview shared state is scoped per-user, not global.
      const otherUser = await selectOrInsertUserByUid(
        'shared-state-preview-other-user@example.com',
      );
      const otherReaderVariant = await ensureVariant({
        question_id: readerQuestion.id,
        instance_question_id: null,
        user_id: otherUser.id,
        authn_user_id: otherUser.id,
        course_instance: null,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });
      assert.equal(otherReaderVariant.params?.observed_count, 0);
    });

    it('works the same way through the public question preview route', async () => {
      // Public question previews go through the same no-instance-question,
      // no-course-instance path as instructor previews (see the test above),
      // but this drives it through the actual HTTP route end to end, since
      // that path also runs the public-preview identity-masking logic in
      // `user-context.ts`.
      const course = await selectOrInsertCourseByPath(courseDir);
      await features.enable('question-sharing');
      await updateCourseSharingName({ course_id: course.id, sharing_name: 'shared-state-test' });

      const writerQuestion = await selectQuestionByQid({ course_id: course.id, qid: WRITER_QID });
      const readerQuestion = await selectQuestionByQid({ course_id: course.id, qid: READER_QID });
      const publicBaseUrl = `http://localhost:${config.serverPort}/pl/public/course/${course.id}/question`;

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
  },
);

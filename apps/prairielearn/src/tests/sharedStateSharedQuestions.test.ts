import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { type Course, VariantSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { saveAndGradeSubmission } from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectCourseById, updateCourseSharingName } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperServer from './helperServer.js';
import * as util from './sync/util.js';
import { withConfig } from './utils/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const OBJECT_NAME = 'labProgress';

const COURSE_A_SHARING_NAME = 'shared-state-course-a';
const COURSE_C_SHARING_NAME = 'shared-state-course-c';

const WRITER_A_QID = 'sharedStateWriterA';
const READER_A_QID = 'sharedStateReaderA';
const WRITER_C_QID = 'sharedStateWriterC';
const READER_C_QID = 'sharedStateReaderC';

const WRITER_SERVER_PY = `
def generate(data):
    pass

def grade(data):
    current = data["shared_state"]["labProgress"]["count"]
    data["shared_state"]["labProgress"]["count"] = current + int(data["submitted_answers"]["increment"])
    data["score"] = 1
`;

const READER_SERVER_PY = `
def generate(data):
    data["params"]["observed_count"] = data["shared_state"]["labProgress"]["count"]
`;

const QUESTION_HTML = '<pl-question-panel><p>Test question.</p></pl-question-panel>';

async function buildOriginCourseDir({
  courseName,
  writerQid,
  writerUuid,
  readerQid,
  readerUuid,
}: {
  courseName: string;
  writerQid: string;
  writerUuid: string;
  readerQid: string;
  readerUuid: string;
}): Promise<string> {
  const courseData: util.CourseData = util.getCourseData();
  courseData.course.name = courseName;
  courseData.course.sharedState = {
    [OBJECT_NAME]: {
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
    sharedStateAccess: [OBJECT_NAME],
    sharePublicly: true,
  };
  courseData.questions[readerQid] = {
    uuid: readerUuid,
    title: 'Shared state reader',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: [OBJECT_NAME],
    sharePublicly: true,
  };

  const courseDir = await util.writeCourseToTempDirectory(courseData);

  await fs.writeFile(path.join(courseDir, 'questions', writerQid, 'server.py'), WRITER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', writerQid, 'question.html'), QUESTION_HTML);
  await fs.writeFile(path.join(courseDir, 'questions', readerQid, 'server.py'), READER_SERVER_PY);
  await fs.writeFile(path.join(courseDir, 'questions', readerQid, 'question.html'), QUESTION_HTML);

  return courseDir;
}

describe(
  'Shared-state runtime behavior for questions shared into another course’s assessment',
  { timeout: 60_000 },
  () => {
    let courseA: Course;
    let courseC: Course;
    let consumingCourse: Course;
    let assessmentInstanceId: string;

    beforeAll(async () => {
      await withConfig({ workersCount: os.cpus().length }, async () => {
        await helperServer.before()();
      });

      await features.enable('question-sharing');

      const courseADir = await buildOriginCourseDir({
        courseName: 'SHARED STATE ORIGIN A',
        writerQid: WRITER_A_QID,
        writerUuid: '5b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a5b6a',
        readerQid: READER_A_QID,
        readerUuid: '6b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a6b6b',
      });
      const courseASyncResults = await util.syncCourseData(courseADir);
      courseA = await selectCourseById(courseASyncResults.courseId);
      await updateCourseSharingName({ course_id: courseA.id, sharing_name: COURSE_A_SHARING_NAME });

      const courseCDir = await buildOriginCourseDir({
        courseName: 'SHARED STATE ORIGIN C',
        writerQid: WRITER_C_QID,
        writerUuid: '7b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a7b6c',
        readerQid: READER_C_QID,
        readerUuid: '8b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a8b6d',
      });
      const courseCSyncResults = await util.syncCourseData(courseCDir);
      courseC = await selectCourseById(courseCSyncResults.courseId);
      await updateCourseSharingName({ course_id: courseC.id, sharing_name: COURSE_C_SHARING_NAME });

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
      const { syncResults: consumingSyncResults } =
        await util.writeAndSyncCourseData(consumingCourseData);
      consumingCourse = await selectCourseById(consumingSyncResults.courseId);

      const consumingCourseInstance = await selectCourseInstanceByShortName({
        course: consumingCourse,
        shortName: util.COURSE_INSTANCE_ID,
      });
      const assessment = await selectAssessmentByTid({
        course_instance_id: consumingCourseInstance.id,
        tid: util.ASSESSMENT_ID,
      });
      const user = await selectOrInsertUserByUid('shared-state-shared-questions-user@example.com');

      assessmentInstanceId = await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });
    });

    afterAll(helperServer.after);

    it('shares live state between two shared questions imported from the same origin course', async () => {
      const consumingCourseInstance = await selectCourseInstanceByShortName({
        course: consumingCourse,
        shortName: util.COURSE_INSTANCE_ID,
      });
      const user = await selectOrInsertUserByUid('shared-state-shared-questions-user@example.com');

      const writerQuestion = await selectQuestionByQid({
        course_id: courseA.id,
        qid: WRITER_A_QID,
      });
      const writerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: WRITER_A_QID },
        IdSchema,
      );

      const writerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: writerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: consumingCourseInstance,
        variant_course: consumingCourse,
        question_course: courseA,
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
        consumingCourse,
        true,
        true,
      );

      const gradedWriterVariant = await sqldb.queryRow(
        sql.select_variant_by_id,
        { variant_id: writerVariant.id },
        VariantSchema,
      );
      assert.equal(gradedWriterVariant.broken_at, null, 'writer variant should not be broken');

      const readerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: READER_A_QID },
        IdSchema,
      );

      const readerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: readerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: consumingCourseInstance,
        variant_course: consumingCourse,
        question_course: courseA,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      assert.equal(readerVariant.broken_at, null, 'reader variant should not be broken');
      assert.equal(readerVariant.params?.observed_count, 5);
    });

    it('keeps shared state isolated between shared questions imported from different origin courses, even when they declare the same object name', async () => {
      const consumingCourseInstance = await selectCourseInstanceByShortName({
        course: consumingCourse,
        shortName: util.COURSE_INSTANCE_ID,
      });
      const user = await selectOrInsertUserByUid('shared-state-shared-questions-user@example.com');

      const writerQuestion = await selectQuestionByQid({
        course_id: courseC.id,
        qid: WRITER_C_QID,
      });
      const writerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: WRITER_C_QID },
        IdSchema,
      );

      const writerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: writerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: consumingCourseInstance,
        variant_course: consumingCourse,
        question_course: courseC,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      // Course A's writer already wrote count=5 to its own "labProgress"
      // object in the previous test, within this same assessment instance.
      // Course C's "labProgress" object is a distinct row (unique on
      // (course_id, name)), so grading here should start from C's own
      // default of 0, not from A's count of 5, and should not collide with
      // A's row in `assessment_instance_shared_state_values` (unique on
      // (assessment_instance_id, shared_state_object_id)).
      await saveAndGradeSubmission(
        {
          variant_id: writerVariant.id,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: { increment: 7 },
        },
        writerVariant,
        writerQuestion,
        consumingCourse,
        true,
        true,
      );

      const gradedWriterVariant = await sqldb.queryRow(
        sql.select_variant_by_id,
        { variant_id: writerVariant.id },
        VariantSchema,
      );
      assert.equal(gradedWriterVariant.broken_at, null, 'writer variant should not be broken');

      const readerInstanceQuestionId = await sqldb.queryScalar(
        sql.select_instance_question_by_qid,
        { assessment_instance_id: assessmentInstanceId, qid: READER_C_QID },
        IdSchema,
      );

      const readerVariant = await ensureVariant({
        question_id: null,
        instance_question_id: readerInstanceQuestionId,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: consumingCourseInstance,
        variant_course: consumingCourse,
        question_course: courseC,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });

      assert.equal(readerVariant.broken_at, null, 'reader variant should not be broken');
      assert.equal(readerVariant.params?.observed_count, 7);
    });
  },
);

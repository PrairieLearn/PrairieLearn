import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { VariantSchema } from '../lib/db-types.js';
import { saveAndGradeSubmission } from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectOrInsertCourseByPath } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';

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
    data["shared_state"]["labProgress"]["count"] = current + data["submitted_answers"]["increment"]
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
  };
  courseData.questions[READER_QID] = {
    uuid: '6b6a1e3a-6b8a-4b8a-9b8a-6b8a1e3a6b6b',
    title: 'Shared state reader',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
    sharedStateAccess: ['labProgress'],
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
  },
);

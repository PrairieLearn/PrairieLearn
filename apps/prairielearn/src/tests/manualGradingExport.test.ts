import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentQuestionSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { selectInstanceQuestionsForManualGrading } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function selectAssessmentQuestion(assessment_id: string, qid: string) {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_qid,
    { assessment_id, qid },
    AssessmentQuestionSchema,
  );
}

async function insertIndividualInstanceQuestion({
  assessment_id,
  assessment_question_id,
  user_id,
  assigned_grader,
  last_grader,
}: {
  assessment_id: string;
  assessment_question_id: string;
  user_id: string;
  assigned_grader: string | null;
  last_grader: string | null;
}) {
  const aiId = await sqldb.queryScalar(
    sql.insert_assessment_instance_for_user,
    { assessment_id, user_id },
    IdSchema,
  );
  return await sqldb.queryScalar(
    sql.insert_instance_question,
    {
      assessment_instance_id: aiId,
      assessment_question_id,
      assigned_grader,
      last_grader,
    },
    IdSchema,
  );
}

describe('Manual grading export query', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('individual: returns full user and grader objects', async () => {
    const hw9 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    const aq = await selectAssessmentQuestion(hw9.id, 'manualGrade/codeUpload');

    const [student, grader] = await generateAndEnrollUsers({
      count: 2,
      course_instance_id: '1',
    });

    const iqId = await insertIndividualInstanceQuestion({
      assessment_id: hw9.id,
      assessment_question_id: aq.id,
      user_id: student.id,
      assigned_grader: grader.id,
      last_grader: grader.id,
    });

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw9,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user?.uid, student.uid);
    assert.equal(row.user?.name, student.name);
    assert.equal(row.user?.email, student.email);
    assert.deepEqual(row.group_members, []);
    assert.equal(row.assigned_grader?.uid, grader.uid);
    assert.equal(row.assigned_grader?.email, grader.email);
    assert.equal(row.last_grader?.uid, grader.uid);
  });

  test('individual: returns null graders when none are set', async () => {
    const hw9 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    const aq = await selectAssessmentQuestion(hw9.id, 'manualGrade/codeUpload');

    const [student] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });

    const iqId = await insertIndividualInstanceQuestion({
      assessment_id: hw9.id,
      assessment_question_id: aq.id,
      user_id: student.id,
      assigned_grader: null,
      last_grader: null,
    });

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw9,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user?.uid, student.uid);
    assert.equal(row.assigned_grader, null);
    assert.equal(row.last_grader, null);
  });

  test('team: returns null user and a sorted group_members array', async () => {
    const hw5 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw5-templateGroupWork',
    });
    const aq = await selectAssessmentQuestion(hw5.id, 'demo/demoNewton-page1');

    const members = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });

    const teamId = await sqldb.queryScalar(
      sql.insert_team,
      {
        assessment_id: hw5.id,
        course_instance_id: '1',
        name: `Test${Date.now()}`,
        member_user_ids: members.map((m) => m.id),
      },
      IdSchema,
    );

    const aiId = await sqldb.queryScalar(
      sql.insert_assessment_instance_for_team,
      { assessment_id: hw5.id, team_id: teamId },
      IdSchema,
    );
    const iqId = await sqldb.queryScalar(
      sql.insert_instance_question,
      {
        assessment_instance_id: aiId,
        assessment_question_id: aq.id,
        assigned_grader: null,
        last_grader: null,
      },
      IdSchema,
    );

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw5,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user, null);
    assert.lengthOf(row.group_members, 3);
    const memberUids = row.group_members.map((m) => m.uid);
    const expectedUids = [...members.map((m) => m.uid)].sort();
    assert.deepEqual(memberUids, expectedUids);
  });
});

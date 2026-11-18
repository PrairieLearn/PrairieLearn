import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAssessmentInstanceGradingPending } from './assessment-instance.js';
import { selectAssessmentByTid } from './assessment.js';

const sql = loadSqlEquiv(import.meta.url);

const AUTO_QID = 'internalGrade/addingNumbers';
const MANUAL_QID = 'manualGrade/codeUpload';

describe('selectAssessmentInstanceGradingPending', () => {
  let assessment_id: string;
  let assessment_instance_id: string;

  async function setQuestionState(
    qid: string,
    state: { status: string; requires_manual_grading: boolean },
  ) {
    await execute(sql.update_instance_question, { assessment_instance_id, qid, ...state });
  }

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    assessment_id = assessment.id;
    const user = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Example Student',
      uin: 'student',
      email: 'student@example.com',
    });
    assessment_instance_id = await makeAssessmentInstance({
      assessment,
      user_id: user.id,
      authn_user_id: user.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
  });
  afterAll(helperDb.after);

  beforeEach(async () => {
    await execute(sql.reset_instance_questions, { assessment_instance_id });
  });

  it('ignores unanswered questions that staff tagged for manual grading', async () => {
    await setQuestionState(MANUAL_QID, { status: 'unanswered', requires_manual_grading: true });
    assert.isNull(await selectAssessmentInstanceGradingPending(assessment_instance_id));
  });

  it('reports a saved answer to an auto-graded question', async () => {
    await setQuestionState(AUTO_QID, { status: 'saved', requires_manual_grading: false });
    assert.deepEqual(await selectAssessmentInstanceGradingPending(assessment_instance_id), {
      manual: false,
      saved: true,
      grading: false,
      assessment_type: 'Homework',
      open: true,
    });
  });

  it('reports an answer that is being graded separately from saved answers', async () => {
    await setQuestionState(AUTO_QID, { status: 'grading', requires_manual_grading: false });
    assert.deepEqual(await selectAssessmentInstanceGradingPending(assessment_instance_id), {
      manual: false,
      saved: false,
      grading: true,
      assessment_type: 'Homework',
      open: true,
    });
  });

  it('reports a saved answer to a manually graded question as manual only', async () => {
    await setQuestionState(MANUAL_QID, { status: 'saved', requires_manual_grading: true });
    assert.deepEqual(await selectAssessmentInstanceGradingPending(assessment_instance_id), {
      manual: true,
      saved: false,
      grading: false,
      assessment_type: 'Homework',
      open: true,
    });
  });

  // This must run last because it removes the question from the assessment.
  it('ignores questions that were removed from a homework', async () => {
    await setQuestionState(AUTO_QID, { status: 'saved', requires_manual_grading: false });
    await execute(sql.delete_assessment_question, { assessment_id, qid: AUTO_QID });
    assert.isNull(await selectAssessmentInstanceGradingPending(assessment_instance_id));
  });
});

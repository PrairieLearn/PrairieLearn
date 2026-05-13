import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { execute, queryOptionalScalar, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { EnumJobStatusSchema } from '../../../lib/db-types.js';
import { stopJobSequence } from '../../../lib/server-jobs.js';
import * as helperCourse from '../../../tests/helperCourse.js';
import * as helperDb from '../../../tests/helperDb.js';
import { getOrCreateUser } from '../../../tests/utils/auth.js';

async function pickAssessmentQuestionId(): Promise<string> {
  // Any assessment_question from the synced test course works — the SQL
  // under test only uses the id to scope the UPDATE to the caller's page.
  const id = await queryOptionalScalar(
    'SELECT id FROM assessment_questions ORDER BY id ASC LIMIT 1',
    {},
    IdSchema,
  );
  if (id == null) throw new Error('Test course has no assessment_questions');
  return id;
}

async function insertAiGradingJobSequence(params: {
  assessment_question_id: string;
  status: 'Running' | 'Stopping' | 'Stopped' | 'Success' | 'Error';
  type?: string;
}): Promise<string> {
  const id = await queryOptionalScalar(
    `INSERT INTO job_sequences (
       number, type, description, legacy, status, assessment_question_id
     )
     VALUES (1, $type, 'test', FALSE, $status::enum_job_status, $assessment_question_id)
     RETURNING id`,
    {
      type: params.type ?? 'ai_grading',
      status: params.status,
      assessment_question_id: params.assessment_question_id,
    },
    IdSchema,
  );
  if (id == null) throw new Error('Failed to insert job_sequence');
  return id;
}

async function selectStatus(job_sequence_id: string): Promise<string> {
  return await queryScalar(
    'SELECT status::text FROM job_sequences WHERE id = $job_sequence_id',
    { job_sequence_id },
    EnumJobStatusSchema,
  );
}

describe('stopJobSequence (AI grading scope)', () => {
  let assessment_question_id: string;
  let authn_user_id: string;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    assessment_question_id = await pickAssessmentQuestionId();
    const user = await getOrCreateUser({
      uid: 'admin@example.com',
      name: 'Test Admin',
      uin: 'admin1',
      email: 'admin@example.com',
    });
    authn_user_id = user.id;
  });

  afterAll(helperDb.after);

  beforeEach(async () => {
    // Wipe all AI grading job sequences seeded by previous tests so the
    // atomic stop-once invariant can be exercised without cross-test bleed.
    await execute(
      "DELETE FROM job_sequences WHERE assessment_question_id = $aq AND type = 'ai_grading'",
      { aq: assessment_question_id },
    );
  });

  it('atomically transitions Running → Stopping and returns true once', async () => {
    const job_sequence_id = await insertAiGradingJobSequence({
      assessment_question_id,
      status: 'Running',
    });

    const first = await stopJobSequence({
      job_sequence_id,
      assessment_question_id,
      authn_user_id,
      type: 'ai_grading',
    });
    assert.isTrue(first);
    assert.equal(await selectStatus(job_sequence_id), 'Stopping');

    // A redundant click (or a second TA) returns false; UI surfaces a
    // friendly "no longer running" instead of CONFLICT-on-DB-error.
    const second = await stopJobSequence({
      job_sequence_id,
      assessment_question_id,
      authn_user_id,
      type: 'ai_grading',
    });
    assert.isFalse(second);
    assert.equal(await selectStatus(job_sequence_id), 'Stopping');
  });

  it('returns false for a sequence that is already terminal', async () => {
    for (const status of ['Stopped', 'Success', 'Error'] as const) {
      const job_sequence_id = await insertAiGradingJobSequence({
        assessment_question_id,
        status,
      });
      const stopped = await stopJobSequence({
        job_sequence_id,
        assessment_question_id,
        authn_user_id,
        type: 'ai_grading',
      });
      assert.isFalse(stopped, `should not stop a ${status} sequence`);
      assert.equal(await selectStatus(job_sequence_id), status);
    }
  });

  it('refuses to stop a sequence that belongs to a different assessment_question', async () => {
    const job_sequence_id = await insertAiGradingJobSequence({
      assessment_question_id,
      status: 'Running',
    });
    const stopped = await stopJobSequence({
      job_sequence_id,
      // Mismatched assessment_question_id — the WHERE clause must reject this
      // even though the row's status is Running.
      assessment_question_id: '999999999',
      authn_user_id,
      type: 'ai_grading',
    });
    assert.isFalse(stopped);
    assert.equal(await selectStatus(job_sequence_id), 'Running');
  });

  it('refuses to stop sequences of a different type', async () => {
    const job_sequence_id = await insertAiGradingJobSequence({
      assessment_question_id,
      status: 'Running',
      type: 'sync',
    });
    const stopped = await stopJobSequence({
      job_sequence_id,
      assessment_question_id,
      authn_user_id,
      type: 'ai_grading',
    });
    assert.isFalse(stopped);
    assert.equal(await selectStatus(job_sequence_id), 'Running');
  });
});

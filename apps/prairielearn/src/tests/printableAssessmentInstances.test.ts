import { afterAll, beforeAll, expect, it } from 'vitest';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperDb from './helperDb.js';
import * as helperServer from './helperServer.js';

beforeAll(helperServer.before());
afterAll(helperServer.after);

it('keeps a printable instance separate from a single student attempt', async () => {
  await helperDb.runInTransactionAndRollback(async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const user = await selectOrInsertUserByUid('printable-instance-test@example.com');
    const create = (forPrinting: boolean) =>
      makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
        forPrinting,
      });

    const printableId = await create(true);
    const studentId = await create(false);
    expect(studentId).not.toBe(printableId);
    expect((await selectAssessmentInstanceById(printableId)).for_printing).toBe(true);
    expect((await selectAssessmentInstanceById(studentId)).for_printing).toBe(false);
    expect(await create(false)).toBe(studentId);
    expect(await create(true)).not.toBe(printableId);
  });
});

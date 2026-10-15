import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../lib/assessment.js';
import {
  selectAssessmentInstanceById,
  selectAssessmentInstancesForUser,
} from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperDb from './helperDb.js';
import * as helperServer from './helperServer.js';

const redirectSql = loadSqlEquiv(
  new URL('../middlewares/studentAssessmentRedirect.ts', import.meta.url).href,
);
const instancesSql = loadSqlEquiv(
  new URL('../trpc/assessment/assessment-instances.ts', import.meta.url).href,
);
const downloadsSql = loadSqlEquiv(
  new URL(
    '../pages/instructorAssessmentDownloads/instructorAssessmentDownloads.tsx',
    import.meta.url,
  ).href,
);
const assessmentSql = loadSqlEquiv(new URL('../lib/assessment.ts', import.meta.url).href);
const regradingSql = loadSqlEquiv(new URL('../lib/regrading.ts', import.meta.url).href);

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
    expect(
      await queryOptionalScalar(
        redirectSql.select_single_assessment_instance,
        { assessment_id: assessment.id, user_id: user.id },
        IdSchema,
      ),
    ).toBeNull();
    const studentId = await create(false);
    expect(studentId).not.toBe(printableId);
    expect((await selectAssessmentInstanceById(printableId)).for_printing).toBe(true);
    expect((await selectAssessmentInstanceById(studentId)).for_printing).toBe(false);
    expect(
      await queryOptionalScalar(
        redirectSql.select_single_assessment_instance,
        { assessment_id: assessment.id, user_id: user.id },
        IdSchema,
      ),
    ).toBe(studentId);
    expect(
      (
        await selectAssessmentInstancesForUser({ assessment_id: assessment.id, user_id: user.id })
      ).map((instance) => instance.id),
    ).toEqual([printableId]);
    expect(await create(false)).toBe(studentId);
    expect(await create(true)).not.toBe(printableId);

    const tableRows = await queryRows(
      instancesSql.select_assessment_instances,
      { assessment_id: assessment.id },
      z.object({ assessment_instance: z.object({ id: IdSchema }) }),
    );
    const downloadRows = await queryRows(
      downloadsSql.select_assessment_instances,
      { assessment_id: assessment.id, group_work: false, highest_score: false },
      z.object({ assessment_instance_id: IdSchema }),
    );
    const gradingRows = await queryRows(
      assessmentSql.select_instances_to_grade,
      { assessment_id: assessment.id, assessment_instance_ids: null },
      z.object({ assessment_instance_id: IdSchema }),
    );
    const regradingRows = await queryRows(
      regradingSql.select_regrade_assessment_instances,
      { assessment_id: assessment.id, assessment_instance_ids: null },
      z.object({ assessment_instance: z.object({ id: IdSchema }) }),
    );
    for (const ids of [
      tableRows.map((row) => row.assessment_instance.id),
      downloadRows.map((row) => row.assessment_instance_id),
      gradingRows.map((row) => row.assessment_instance_id),
      regradingRows.map((row) => row.assessment_instance.id),
    ]) {
      expect(ids).toContain(studentId);
      expect(ids).not.toContain(printableId);
    }
  });
});

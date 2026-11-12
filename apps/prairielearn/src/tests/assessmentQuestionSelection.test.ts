import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  makeAssessmentInstance,
  selectAssessmentQuestionIdsForInstance,
} from '../lib/assessment.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

// Selection is random, so each check is repeated enough times that a broken
// constraint would almost certainly be observed.
const ITERATIONS = 20;

// `hw16-editorTest` has three zones: zone 1 holds `downloadFile`, zone 2 holds
// `partialCredit1` and `partialCredit2`, and zone 3 holds `addVectors` plus an
// alternative group choosing one of `aiGradingMultiImageCapture` and
// `aiGradingRubrics`.
async function getAssessment() {
  return await selectAssessmentByTid({ course_instance_id: '1', tid: 'hw16-editorTest' });
}

async function selectQids(assessment_id: string, assessment_instance_id: string | null = null) {
  const qidById = new Map(
    (
      await queryRows(
        sql.select_assessment_question_qids,
        { assessment_id },
        z.object({ id: IdSchema, qid: z.string() }),
      )
    ).map(({ id, qid }) => [id, qid]),
  );
  const ids = await selectAssessmentQuestionIdsForInstance({
    assessment_id,
    assessment_instance_id,
  });
  return ids.map((id) => qidById.get(id)).sort();
}

describe('selectAssessmentQuestionIdsForInstance', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('chooses number_choose questions from each alternative group and zone', () =>
    runInTransactionAndRollback(async () => {
      const assessment = await getAssessment();
      await execute(sql.set_zone_number_choose, {
        assessment_id: assessment.id,
        zone_number: 2,
        number_choose: 1,
      });
      for (let i = 0; i < ITERATIONS; i++) {
        const qids = await selectQids(assessment.id);
        expect(qids).toHaveLength(4);
        expect(qids).toEqual(expect.arrayContaining(['addVectors', 'downloadFile']));
        expect(
          qids.filter((qid) => qid === 'partialCredit1' || qid === 'partialCredit2'),
        ).toHaveLength(1);
        expect(
          qids.filter((qid) => qid === 'aiGradingMultiImageCapture' || qid === 'aiGradingRubrics'),
        ).toHaveLength(1);
      }
    }));

  it('keeps the questions already in an assessment instance', () =>
    runInTransactionAndRollback(async () => {
      const assessment = await getAssessment();
      await execute(sql.set_zone_number_choose, {
        assessment_id: assessment.id,
        zone_number: 2,
        number_choose: 1,
      });
      const user = await getConfiguredUser();
      const assessmentInstanceId = await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });
      const instanceQuestionIds = await queryScalars(
        sql.select_instance_assessment_question_ids,
        { assessment_instance_id: assessmentInstanceId },
        IdSchema,
      );
      expect(instanceQuestionIds).toHaveLength(4);

      for (let i = 0; i < ITERATIONS; i++) {
        const ids = await selectAssessmentQuestionIdsForInstance({
          assessment_id: assessment.id,
          assessment_instance_id: assessmentInstanceId,
        });
        expect(ids.sort()).toEqual(instanceQuestionIds.sort());
      }
    }));
});

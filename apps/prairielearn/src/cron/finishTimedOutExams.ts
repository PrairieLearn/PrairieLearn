import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { gradeAssessmentInstance } from '../lib/assessment.js';
import { EXAM_DRAFT_GRACE_PERIOD_MS } from '../lib/assessment.shared.js';

const sql = loadSqlEquiv(import.meta.url);

export async function run() {
  const assessmentInstances = await queryRows(
    sql.select_expired_exams,
    { grace_period_sec: EXAM_DRAFT_GRACE_PERIOD_MS / 1000 },
    z.object({ id: IdSchema, assessment_id: IdSchema }),
  );

  for (const assessmentInstance of assessmentInstances) {
    try {
      await gradeAssessmentInstance({
        assessment_instance_id: assessmentInstance.id,
        user_id: null,
        authn_user_id: null,
        requireOpen: true,
        close: true,
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
        client_fingerprint_id: null,
      });
    } catch (err) {
      logger.error('Error finishing exam after draft grace period', err);
      Sentry.captureException(err, {
        tags: {
          'assessment.id': assessmentInstance.assessment_id,
          'assessment_instance.id': assessmentInstance.id,
        },
      });
    }
  }
}

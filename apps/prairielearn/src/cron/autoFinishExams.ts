import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { gradeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * This cron job runs periodically to check for any exams that need to be
 * "finished". This includes exams that are still open and are configured to
 * auto-close after a certain time period, and exams that were previously
 * closed but not completely graded.
 *
 * @see assessment.gradeAssessmentInstance
 */
export async function run() {
  const assessment_instances = await sqldb.queryRows(
    sql.select_assessments_to_auto_close,
    { age_minutes: config.autoFinishAgeMins },
    AssessmentInstanceSchema.pick({ id: true, open: true, assessment_id: true }),
  );

  for (const assessment_instance of assessment_instances) {
    logger.verbose('autoFinishExams: finishing ' + assessment_instance.id, assessment_instance);
    try {
      await gradeAssessmentInstance({
        assessment_instance_id: assessment_instance.id,
        // Grading was performed by the system.
        user_id: null,
        authn_user_id: null,
        // Don't require the assessment to be open. This is important to
        // ensure we correctly handle the case where the PrairieLearn process
        // dies in the middle of grading a question. In that case, the assessment
        // would have already been closed, but we still need to grade it.
        requireOpen: false,
        // Only mark this assessment as needing to be closed if it's still open.
        close: !!assessment_instance.open,
        // Override any submission or grading rate limits.
        overrideGradeRate: true,
        // We don't have a client fingerprint ID, so pass null.
        client_fingerprint_id: null,
      });
    } catch (err) {
      logger.error('Error finishing exam', error.addData(err, { assessment_instance }));
      Sentry.captureException(err, {
        tags: {
          'assessment.id': assessment_instance.assessment_id,
          'assessment_instance.id': assessment_instance.id,
        },
      });
    }
  }
}

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { gradeAssessmentInstance } from '../lib/assessment';
import { config } from '../lib/config';
import { AssessmentInstanceSchema } from '../lib/db-types';

const sql = sqldb.loadSqlEquiv(__filename);

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
    // Grading was performed by the system.
    const authn_user_id = null;
    // Don't require the assessment to be open. This is important to
    // ensure we correctly handle the case where the PrairieLearn process
    // dies in the middle of grading a question. In that case, the assessment
    // would have already been closed, but we still need to grade it.
    const requireOpen = false;
    // Only mark this assessment as needing to be closed if it's still open.
    const close = !!assessment_instance.open;
    // Override any submission or grading rate limits.
    const overrideGradeRate = true;
    // We don't have a client fingerprint ID, so pass null.
    const clientFingerprintId = null;
    try {
      await gradeAssessmentInstance(
        assessment_instance.id,
        authn_user_id,
        requireOpen,
        close,
        overrideGradeRate,
        clientFingerprintId,
      );
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

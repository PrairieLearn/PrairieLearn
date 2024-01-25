import ERR = require('async-stacktrace');
import * as async from 'async';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import * as assessment from '../lib/assessment';
import { config } from '../lib/config';

/**
 * This cron job runs periodically to check for any exams that need to be
 * "finished". This includes exams that are still open and are configured to
 * auto-close after a certain time period, and exams that were previously
 * closed but not completely graded.
 *
 * @see assessment.gradeAssessmentInstance
 */
export function run(callback: (err?: Error | null) => void): void {
  const params = [config.autoFinishAgeMins];
  sqldb.call('assessment_instances_select_for_auto_finish', params, function (err, result) {
    if (ERR(err, callback)) return;
    const examList = result.rows;

    async.eachSeries(
      examList,
      function (examItem, callback) {
        logger.verbose('autoFinishExams: finishing ' + examItem.assessment_instance_id, examItem);
        // Grading was performed by the system.
        const authn_user_id = null;
        // Don't require the assessment to be open. This is important to
        // ensure we correctly handle the case where the PrairieLearn process
        // dies in the middle of grading a question. In that case, the assessment
        // would have already been closed, but we still need to grade it.
        const requireOpen = false;
        // Override any submission or grading rate limits.
        const overrideGradeRate = true;
        // We don't have a client fingerprint ID, so pass null.
        const clientFingerprintId = null;
        assessment.gradeAssessmentInstance(
          examItem.assessment_instance_id,
          authn_user_id,
          requireOpen,
          examItem.close_assessment,
          overrideGradeRate,
          clientFingerprintId,
          function (err) {
            if (ERR(err, () => {})) {
              logger.error('Error finishing exam', error.addData(err, { examItem }));
            }
            callback(null);
          },
        );
      },
      function (err) {
        if (ERR(err, callback)) return;
        callback(null);
      },
    );
  });
}

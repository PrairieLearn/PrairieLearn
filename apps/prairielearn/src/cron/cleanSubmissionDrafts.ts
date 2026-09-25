import { logger } from '@prairielearn/logger';

import { deleteExpiredSubmissionDrafts } from '../models/submission-draft.js';

// Drafts only need to outlive a lost page long enough for the student to
// return to the question.
const RETENTION_PERIOD_SEC = 7 * 24 * 60 * 60;

export async function run() {
  const rowCount = await deleteExpiredSubmissionDrafts({
    retention_period_sec: RETENTION_PERIOD_SEC,
  });
  logger.verbose(`Deleted ${rowCount} expired rows from the submission_drafts table`);
}

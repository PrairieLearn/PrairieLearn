import path from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import fs from 'fs-extra';

import { type Assessment, type User } from '../../../lib/db-types.js';
import { type ServerJob, selectJobSequenceStatus } from '../../../lib/server-jobs.js';
import { uploadSubmissions } from '../../../lib/submissions-upload.js';

const POLL_INTERVAL_MS = 1000;

/**
 * Builds the minimal `Express.Multer.File` shape that `uploadSubmissions()`
 * consumes. Only `buffer`, `originalname`, and `size` are actually read; the
 * other fields are required by the type and provided as stable placeholders.
 */
function bufferToMulterFile(buffer: Buffer, filename: string): Express.Multer.File {
  return {
    fieldname: 'csvFile',
    originalname: filename,
    encoding: '7bit',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
    stream: Readable.from(buffer),
    destination: '',
    filename,
    path: '',
  };
}

/**
 * Loads the eval's submissions CSV off disk and feeds it through PL's
 * existing `uploadSubmissions()` so submissions, variants, and the
 * `Rubric Grading` column's manual ground truth land in the synthetic
 * course in one shot. Awaits the upload job's sequence to completion so
 * downstream steps see consistent DB state.
 *
 * NOTE: `uploadSubmissions()` deletes all existing assessment instances on
 * the target assessment as its first step. The synthetic course has one
 * assessment per eval, so that wipe only ever clears state we just put
 * there.
 */
export async function importSubmissions({
  assessment,
  submissionsCsvPath,
  user,
  job,
}: {
  assessment: Assessment;
  submissionsCsvPath: string;
  user: User;
  job: ServerJob;
}): Promise<void> {
  const buffer = await fs.readFile(submissionsCsvPath);
  const csvFile = bufferToMulterFile(buffer, path.basename(submissionsCsvPath));

  job.info(
    `Uploading submissions from ${submissionsCsvPath} (${buffer.length.toLocaleString()} bytes)`,
  );
  const uploadJobSequenceId = await uploadSubmissions(assessment, csvFile, user.id, user.id);
  job.info(`Submission upload job sequence: ${uploadJobSequenceId}`);

  while (true) {
    const { status } = await selectJobSequenceStatus(uploadJobSequenceId);
    if (status !== 'Running' && status !== 'Stopping') {
      if (status !== 'Success') {
        job.fail(
          `Submission upload job sequence ${uploadJobSequenceId} ended with status ${status}`,
        );
      }
      job.info('Submission upload complete.');
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

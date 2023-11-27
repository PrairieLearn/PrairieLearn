// @ts-check
import { eachSeries } from 'async';
import { callbackify } from 'util';

import * as sqldb from '@prairielearn/postgres';
import { recursivelyTruncateStrings } from '@prairielearn/sanitize';

/**
 * @typedef {Object} IssueData
 * @property {number | string} variantId
 * @property {string | null} studentMessage
 * @property {string | null} instructorMessage
 * @property {boolean} manuallyReported
 * @property {boolean} courseCaused
 * @property {Object} courseData
 * @property {Object} systemData
 * @property {number | string | null} authnUserId
 */

/** @typedef {Omit<IssueData, 'manuallyReported' | 'courseCaused' | 'instructorMessage' |'systemData'>} IssueForErrorData */

/**
 * Inserts an issue.
 *
 * @param {IssueData} data
 */
export async function insertIssue({
  variantId,
  studentMessage,
  instructorMessage,
  manuallyReported,
  courseCaused,
  courseData,
  systemData,
  authnUserId,
}) {
  // Truncate all strings in the data objects to 1000 characters. This ensures
  // that we don't store too much unnecessary data. This data is here for
  // convenience, but it's not the source of truth: pretty much all of it
  // is also stored elsewhere in the database, so we can always retrieve it
  // if needed. The worst data is submission data, which can be very large;
  // this is stored on each individual submission.
  const truncatedCourseData = recursivelyTruncateStrings(courseData, 1000);
  // Allow for a higher limit on the system data. This object contains output
  // from the Python subprocess, which can be especially useful for debugging.
  const truncatedSystemData = recursivelyTruncateStrings(systemData, 10000);
  await sqldb.callAsync('issues_insert_for_variant', [
    variantId,
    studentMessage,
    instructorMessage,
    manuallyReported,
    courseCaused,
    truncatedCourseData,
    truncatedSystemData,
    authnUserId,
  ]);
}

/**
 * Inserts an issue for a thrown error.
 *
 * @param {any} err
 * @param {IssueForErrorData} data
 * @returns {Promise<void>}
 */
export async function insertIssueForError(err, data) {
  return insertIssue({
    ...data,
    manuallyReported: false,
    courseCaused: true,
    instructorMessage: err.toString(),
    systemData: { stack: err.stack, courseErrData: err.data },
  });
}

/**
 * Write a list of course issues for a variant.
 * @protected
 *
 * @param {Array} courseIssues - List of issue objects for to be written.
 * @param {Object} variant - The variant associated with the issues.
 * @param {string} authn_user_id - The currently authenticated user.
 * @param {string} studentMessage - The message to display to the student.
 * @param {Object} courseData - Arbitrary data to be associated with the issues.
 */
export async function writeCourseIssuesAsync(
  courseIssues,
  variant,
  authn_user_id,
  studentMessage,
  courseData,
) {
  await eachSeries(courseIssues, async (courseErr) => {
    await insertIssueForError(courseErr, {
      variantId: variant.id,
      studentMessage,
      courseData,
      authnUserId: authn_user_id,
    });
  });
}
export const writeCourseIssues = callbackify(writeCourseIssuesAsync);

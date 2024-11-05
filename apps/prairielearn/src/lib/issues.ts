import * as async from 'async';
import { type Request, type Response } from 'express';
import _ from 'lodash';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { recursivelyTruncateStrings } from '@prairielearn/sanitize';

import { validateVariantAgainstQuestion } from '../models/variant.js';

import { type Variant } from './db-types.js';

interface IssueForErrorData {
  variantId: string;
  studentMessage: string | null;
  courseData: Record<string, any>;
  authnUserId: string | null;
}

interface IssueData extends IssueForErrorData {
  instructorMessage: string | null;
  manuallyReported: boolean;
  courseCaused: boolean;
  systemData: Record<string, any>;
}

interface ErrorMaybeWithData extends Error {
  data?: any;
}

/**
 * Inserts an issue.
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
}: IssueData): Promise<void> {
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
 */
export async function insertIssueForError(
  err: ErrorMaybeWithData,
  data: IssueForErrorData,
): Promise<void> {
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
 *
 * @param courseIssues - List of issue objects for to be written.
 * @param variant - The variant associated with the issues.
 * @param authn_user_id - The currently authenticated user.
 * @param studentMessage - The message to display to the student.
 * @param courseData - Arbitrary data to be associated with the issues.
 */
export async function writeCourseIssues(
  courseIssues: ErrorMaybeWithData[],
  variant: Variant,
  authn_user_id: string | null,
  studentMessage: string | null,
  courseData: Record<string, any>,
) {
  await async.eachSeries(courseIssues, async (courseErr) => {
    await insertIssueForError(courseErr, {
      variantId: variant.id,
      studentMessage,
      courseData,
      authnUserId: authn_user_id,
    });
  });
}
export async function reportIssueFromForm(
  req: Request,
  res: Response,
  studentSubmission = false,
): Promise<string> {
  if (studentSubmission && !res.locals.assessment.allow_issue_reporting) {
    throw new HttpStatusError(403, 'Issue reporting not permitted for this assessment');
  }
  const description = req.body.description;
  if (typeof description !== 'string' || description.length === 0) {
    throw new HttpStatusError(400, 'A description of the issue must be provided');
  }

  const variant = await validateVariantAgainstQuestion(
    req.body.__variant_id,
    res.locals.question.id,
    studentSubmission ? res.locals.instance_question?.id : null,
  );
  await insertIssue({
    variantId: variant.id,
    studentMessage: description,
    instructorMessage: `${studentSubmission ? 'student' : 'instructor'}-reported issue`,
    manuallyReported: true,
    courseCaused: true,
    courseData: _.pick(res.locals, [
      'variant',
      'question',
      'course_instance',
      'course',
      ...(studentSubmission ? ['instance_question', 'assessment_instance', 'assessment'] : []),
    ]),
    systemData: {},
    authnUserId: res.locals.authn_user.user_id,
  });
  return variant.id;
}

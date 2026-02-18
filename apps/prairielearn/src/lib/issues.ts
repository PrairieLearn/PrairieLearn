import * as async from 'async';
import { type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { recursivelyTruncateStrings } from '@prairielearn/sanitize';
import { IdSchema } from '@prairielearn/zod';

import { selectAndAuthzVariant } from '../models/variant.js';

import { type Variant } from './db-types.js';

interface IssueForErrorData {
  variantId: string;
  studentMessage: string | null;
  courseData: Record<string, any>;
  userId: string | null;
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

const sql = loadSqlEquiv(import.meta.url);

/**
 * Inserts an issue and returns the issue ID.
 */
export async function insertIssue({
  variantId,
  studentMessage,
  instructorMessage,
  manuallyReported,
  courseCaused,
  courseData,
  systemData,
  userId,
  authnUserId,
}: IssueData) {
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
  return await queryRow(
    sql.insert_issue,
    {
      variant_id: variantId,
      student_message: studentMessage,
      instructor_message: instructorMessage,
      manually_reported: manuallyReported,
      course_caused: courseCaused,
      course_data: truncatedCourseData,
      system_data: truncatedSystemData,
      user_id: userId,
      authn_user_id: authnUserId,
    },
    IdSchema,
  );
}

/**
 * Inserts an issue for a thrown error.
 */
async function insertIssueForError(err: ErrorMaybeWithData, data: IssueForErrorData) {
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
 * @param user_id - The user submitting the issues.
 * @param authn_user_id - The currently authenticated user.
 * @param studentMessage - The message to display to the student.
 * @param courseData - Arbitrary data to be associated with the issues.
 */
export async function writeCourseIssues(
  courseIssues: ErrorMaybeWithData[],
  variant: Variant,
  user_id: string | null,
  authn_user_id: string | null,
  studentMessage: string | null,
  courseData: Record<string, any>,
) {
  await async.eachSeries(courseIssues, async (courseErr) => {
    await insertIssueForError(courseErr, {
      variantId: variant.id,
      studentMessage,
      courseData,
      userId: user_id,
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

  const variant = await selectAndAuthzVariant({
    unsafe_variant_id: req.body.__variant_id,
    variant_course: res.locals.course,
    question_id: res.locals.question.id,
    course_instance_id: res.locals.course_instance?.id,
    instance_question_id: studentSubmission ? res.locals.instance_question?.id : null,
    authz_data: res.locals.authz_data,
    authn_user: res.locals.authn_user,
    user: res.locals.user,
    is_administrator: res.locals.is_administrator,
  });
  await insertIssue({
    variantId: variant.id,
    studentMessage: description,
    instructorMessage: `${studentSubmission ? 'student' : 'instructor'}-reported issue`,
    manuallyReported: true,
    courseCaused: true,
    courseData: {
      variant,
      question: res.locals.question,
      course_instance: res.locals.course_instance,
      course: res.locals.course,
      ...(studentSubmission
        ? {
            instance_question: res.locals.instance_question,
            assessment_instance: res.locals.assessment_instance,
            assessment: res.locals.assessment,
          }
        : {}),
    },
    systemData: {},
    userId: res.locals.user.id,
    authnUserId: res.locals.authn_user.id,
  });
  return variant.id;
}

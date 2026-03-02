import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { execute, executeRow, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { JobSequenceSchema, type User } from '../lib/db-types.js';
import { createCourseRepoJob } from '../lib/github.js';
import { sendCourseRequestMessage } from '../lib/opsbot.js';

const sql = loadSqlEquiv(import.meta.url);

const JobsRowSchema = z.object({
  authn_user_id: IdSchema.nullable(),
  authn_user_name: z.string().nullable(),
  finish_date: DateFromISOString.nullable(),
  id: IdSchema,
  number: z.number(),
  start_date: DateFromISOString,
  status: JobSequenceSchema.shape.status,
});

const CourseRequestRowSchema = z.object({
  approved_by_name: z.string().nullable(),
  approved_status: z.enum(['pending', 'approved', 'denied', 'creating', 'failed']),
  created_at: DateFromISOString,
  first_name: z.string().nullable(),
  github_user: z.string().nullable(),
  id: IdSchema,
  institution: z.string().nullable(),
  jobs: z.array(JobsRowSchema),
  last_name: z.string().nullable(),
  note: z.string().nullable(),
  referral_source: z.string().nullable(),
  short_name: z.string(),
  title: z.string(),
  user_name: z.string().nullable(),
  user_uid: z.string(),
  work_email: z.string().nullable(),
});
export type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

const ExistingOwnerCourseSettingsSchema = z.object({
  institution_id: IdSchema,
  display_timezone: z.string(),
});

async function selectCourseRequests(show_all: boolean) {
  return await queryRows(sql.select_course_requests, { show_all }, CourseRequestRowSchema);
}

export async function selectAllCourseRequests() {
  return await selectCourseRequests(true);
}

export async function selectPendingCourseRequests() {
  return await selectCourseRequests(false);
}

export async function denyCourseRequest({
  courseRequestId,
  authnUser,
}: {
  courseRequestId: string;
  authnUser: User;
}) {
  await execute(sql.update_course_request, {
    id: courseRequestId,
    user_id: authnUser.id,
    action: 'denied',
  });
}

export async function createCourseFromRequest({
  courseRequestId,
  shortName,
  title,
  institutionId,
  displayTimezone,
  path,
  repoShortName,
  githubUser,
  authnUser,
}: {
  courseRequestId: string;
  shortName: string;
  title: string;
  institutionId: string;
  displayTimezone: string;
  path: string;
  repoShortName: string;
  githubUser: string | null;
  authnUser: User;
}): Promise<string> {
  await execute(sql.update_course_request, {
    id: courseRequestId,
    user_id: authnUser.id,
    action: 'creating',
  });

  // Create the course in the background
  const jobSequenceId = await createCourseRepoJob(
    {
      short_name: shortName,
      title,
      institution_id: institutionId,
      display_timezone: displayTimezone,
      path,
      repo_short_name: repoShortName,
      github_user: githubUser,
      course_request_id: courseRequestId,
    },
    authnUser,
  );

  // Send the Slack message in the background without blocking the response.
  sendCourseRequestMessage(
    '*Creating course*\n' +
      `Course rubric: ${repoShortName}\n` +
      `Course title: ${title}\n` +
      `Approved by: ${authnUser.name}`,
  ).catch((err) => {
    logger.error('Error sending course request message to Slack', err);
    Sentry.captureException(err);
  });

  return jobSequenceId;
}

export async function insertCourseRequest({
  shortName,
  title,
  userId,
  githubUser,
  firstName,
  lastName,
  workEmail,
  institution,
  referralSource,
}: {
  shortName: string;
  title: string;
  userId: string;
  githubUser: string | null;
  firstName: string | null;
  lastName: string | null;
  workEmail: string | null;
  institution: string | null;
  referralSource: string | null;
}): Promise<string> {
  return await queryRow(
    sql.insert_course_request,
    {
      short_name: shortName,
      title,
      user_id: userId,
      github_user: githubUser,
      first_name: firstName,
      last_name: lastName,
      work_email: workEmail,
      institution,
      referral_source: referralSource,
    },
    IdSchema,
  );
}

export async function updateCourseRequestNote({
  courseRequestId,
  note,
}: {
  courseRequestId: string;
  note: string;
}) {
  await executeRow(sql.update_course_request_note, { id: courseRequestId, note });
}

export async function checkExistingCourseRequest({
  userId,
  shortName,
}: {
  userId: string;
  shortName: string;
}): Promise<boolean> {
  return await queryRow(
    sql.get_existing_course_requests,
    {
      user_id: userId,
      short_name: shortName,
    },
    z.boolean(),
  );
}

export async function canAutoCreateCourse({ userId }: { userId: string }): Promise<boolean> {
  return await queryRow(sql.can_auto_create_course, { user_id: userId }, z.boolean());
}

export async function getExistingOwnerCourseSettings({
  userId,
}: {
  userId: string;
}): Promise<z.infer<typeof ExistingOwnerCourseSettingsSchema>> {
  return await queryRow(
    sql.get_existing_owner_course_settings,
    { user_id: userId },
    ExistingOwnerCourseSettingsSchema,
  );
}

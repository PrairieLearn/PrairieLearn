import { loadSqlEquiv, queryRows, queryAsync } from '@prairielearn/postgres';
import { z } from 'zod';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { DateFromISOString, IdSchema } from '../lib/db-types';
import { createCourseRepoJob } from '../lib/github';
import { sendCourseRequestMessage } from '../lib/opsbot';

const sql = loadSqlEquiv(__filename);

const JobsRowSchema = z.object({
  authn_user_id: IdSchema.nullable(),
  authn_user_name: z.string().nullable(),
  finish_date: DateFromISOString.nullable(),
  id: IdSchema,
  number: z.number(),
  start_date: DateFromISOString,
  status: z.string(),
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
  referral_source: z.string().nullable(),
  short_name: z.string(),
  title: z.string(),
  user_name: z.string().nullable(),
  user_uid: z.string(),
  work_email: z.string().nullable(),
});
export type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

async function selectCourseRequests(show_all: boolean) {
  return await queryRows(sql.select_course_requests, { show_all }, CourseRequestRowSchema);
}

export async function selectAllCourseRequests() {
  return await selectCourseRequests(true);
}

export async function selectPendingCourseRequests() {
  return await selectCourseRequests(false);
}

export async function updateCourseRequest(req, res) {
  let action = req.body.approve_deny_action;
  if (action === 'deny') {
    action = 'denied';
  } else {
    throw new Error(`Unknown course request action "${action}"`);
  }

  await queryAsync(sql.update_course_request, {
    id: req.body.request_id,
    user_id: res.locals.authn_user.user_id,
    action,
  });
  res.redirect(req.originalUrl);
}

export async function createCourseFromRequest(req, res) {
  await queryAsync(sql.update_course_request, {
    id: req.body.request_id,
    user_id: res.locals.authn_user.user_id,
    action: 'creating',
  });

  // Create the course in the background
  const jobSequenceId = await createCourseRepoJob(
    {
      short_name: req.body.short_name,
      title: req.body.title,
      institution_id: req.body.institution_id,
      display_timezone: req.body.display_timezone,
      path: req.body.path,
      repo_short_name: req.body.repository_short_name,
      github_user: req.body.github_user.length > 0 ? req.body.github_user : null,
      course_request_id: req.body.request_id,
    },
    res.locals.authn_user,
  );

  res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);

  // Do this in the background once we've redirected the response.

  try {
    await sendCourseRequestMessage(
      `*Creating course*\n` +
        `Course rubric: ${req.body.repository_short_name}\n` +
        `Course title: ${req.body.title}\n` +
        `Approved by: ${res.locals.authn_user.name}`,
    );
  } catch (err) {
    logger.error('Error sending course request message to Slack', err);
    Sentry.captureException(err);
  }
}

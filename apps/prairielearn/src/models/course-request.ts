import { loadSqlEquiv, queryRow, queryAsync } from '@prairielearn/postgres';
import { z } from 'zod';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@sentry/node';

import { InstitutionSchema, DateFromISOString, IdSchema } from '../lib/db-types';
import { createCourseRepoJob } from '../lib/github';
import { sendCourseRequestMessage } from '../lib/opsbot';

const sql = loadSqlEquiv(__filename);

const JobsRowSchema = z.object({
  authn_user_id: IdSchema.optional(),
  finish_date: DateFromISOString.optional(),
  id: IdSchema.optional(),
  number: z.number().optional(),
  start_date: DateFromISOString.optional(),
  status: z.string().optional(),
});

const CourseRequestRowSchema = z.object({
  approved_by_name: z.string().nullable(),
  first_name: z.string().nullable(),
  github_user: z.string().nullable(),
  id: IdSchema,
  institution: z.string().nullable(),
  jobs: JobsRowSchema,
  last_name: z.string().nullable(),
  short_name: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'denied', 'creating', 'failed']),
  title: z.string().nullable(),
  user_id: IdSchema.nullable(),
  user_name: z.string().nullable(),
  work_email: z.string().nullable(),
});

export async function getCourseRequests(show_all: boolean) {
  return await queryRow(
    sql.get_requests,
    { show_all },
    z.object({
      institutions: z.array(InstitutionSchema),
      course_requests: z.array(CourseRequestRowSchema),
    }),
  );
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
  const repo_options = {
    short_name: req.body.short_name,
    title: req.body.title,
    institution_id: req.body.institution_id,
    display_timezone: req.body.display_timezone,
    path: req.body.path,
    repo_short_name: req.body.repository_short_name,
    github_user: req.body.github_user.length > 0 ? req.body.github_user : null,
    course_request_id: req.body.request_id,
  };

  const jobSequenceId = await createCourseRepoJob(repo_options, res.locals.authn_user.user);

  res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);

  // Do this in the background once we've redirected the response.

  try {
    await sendCourseRequestMessage(
      `*Creating course*\n` +
        `Course rubric: ${repo_options.short_name}\n` +
        `Course title: ${repo_options.title}\n` +
        `Approved by: ${res.locals.authn_user.name}`,
    );
  } catch (err) {
    logger.error('Error sending course request message to Slack', err);
    Sentry.captureException(err);
  }
}

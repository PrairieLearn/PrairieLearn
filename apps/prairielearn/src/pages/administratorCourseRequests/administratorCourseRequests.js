// @ts-check
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
import * as express from 'express';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { z } from 'zod';

import { createCourseRepoJob } from '../../lib/github';
import { config } from '../../lib/config';
import { sendCourseRequestMessage } from '../../lib/opsbot';
import { CourseRequestSchema, DateFromISOString, IdSchema, InstitutionSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.coursesRoot = config.coursesRoot;
    const result = await sqldb.queryRow(sql.get_requests, [], z.object({
      institutions: z.array(InstitutionSchema),
      course_requests: z.array(CourseRequestSchema.extend({ 
        user_name: z.string(), 
        created_at: DateFromISOString.optional(),
        approved_by: z.string().optional(),
        approved_status: z.enum(['pending', 'approved', 'denied', 'creating', 'failed']).optional(),
        user_id: z.string().optional(),
        jobs: z.object({
          start_date: DateFromISOString.optional(),
          finish_date: DateFromISOString.optional(),
          authn_user_id: IdSchema.optional(),
          status: z.string().optional(),
          id: IdSchema.optional(),
          number: z.number().optional(),
        }).optional(),
      })),
    }));
    _.assign(res.locals, result);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw error.make(403, 'Insufficient permissions');

    if (req.body.__action === 'approve_deny_course_request') {
      const id = req.body.request_id;
      const user_id = res.locals.authn_user.user_id;
      let action = req.body.approve_deny_action;

      if (action === 'deny') {
        action = 'denied';
      } else {
        throw new Error(`Unknown course request action "${action}"`);
      }
      await sqldb.queryOneRowAsync(sql.update_course_request, {
        id,
        user_id,
        action,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'create_course_from_request') {
      const id = req.body.request_id;
      const user_id = res.locals.authn_user.user_id;
      await sqldb.queryOneRowAsync(sql.update_course_request, {
        id,
        user_id,
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
        course_request_id: id,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        work_email: req.body.work_email,
        institution: req.body.institution,
      };

      const jobSequenceId = await createCourseRepoJob(repo_options, res.locals.authn_user);

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
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;

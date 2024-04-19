import asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as path from 'path';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import * as opsbot from '../../lib/opsbot';
import * as github from '../../lib/github';
import { config } from '../../lib/config';
import { IdSchema } from '../../lib/db-types';
import { RequestCourse, CourseRequestRowSchema } from './instructorRequestCourse.html';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await queryRows(
      sql.get_requests,
      { user_id: res.locals.authn_user.user_id },
      CourseRequestRowSchema,
    );

    res.send(RequestCourse({ rows, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const short_name = req.body['cr-shortname'].toUpperCase() || '';
    const title = req.body['cr-title'] || '';
    const github_user = req.body['cr-ghuser'] || null;
    const first_name = req.body['cr-firstname'] || '';
    const last_name = req.body['cr-lastname'] || '';
    const work_email = req.body['cr-email'] || '';
    const institution = req.body['cr-institution'] || '';
    const referral_source_option = req.body['cr-referral-source'] || '';
    const referral_source_other = req.body['cr-referral-source-other'] || '';
    const referral_source =
      referral_source_option === 'other' ? referral_source_other : referral_source_option;

    let error = false;

    if (!short_name.match(/[A-Z]+ [A-Z0-9]+/)) {
      flash(
        'error',
        'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
      );
      error = true;
    }
    if (title.length < 1) {
      flash('error', 'The course title should not be empty.');
      error = true;
    }
    if (first_name.length < 1) {
      flash('error', 'The first name should not be empty.');
      error = true;
    }
    if (last_name.length < 1) {
      flash('error', 'The last name should not be empty.');
      error = true;
    }
    if (work_email.length < 1) {
      flash('error', 'The work email should not be empty.');
      error = true;
    }
    if (institution.length < 1) {
      flash('error', 'The institution should not be empty.');
      error = true;
    }
    if (referral_source.length < 1) {
      flash('error', 'The referral source should not be empty.');
      error = true;
    }

    const hasExistingCourseRequest = await queryRow(
      sql.get_existing_course_requests,
      {
        user_id: res.locals.authn_user.user_id,
        short_name,
        title,
      },
      z.boolean(),
    );

    if (hasExistingCourseRequest) {
      flash('error', 'You already have a request for this course.');
      error = true;
    }

    if (error) {
      res.redirect(req.originalUrl);
      return;
    }

    // Otherwise, insert the course request and send a Slack message.
    const course_request_id = await queryRow(
      sql.insert_course_request,
      {
        short_name,
        title,
        user_id: res.locals.authn_user.user_id,
        github_user,
        first_name,
        last_name,
        work_email,
        institution,
        referral_source,
      },
      IdSchema,
    );

    // Check if we can automatically approve and create the course.
    const canAutoCreateCourse = await queryRow(
      sql.can_auto_create_course,
      {
        user_id: res.locals.authn_user.user_id,
      },
      z.boolean(),
    );

    if (config.courseRequestAutoApprovalEnabled && canAutoCreateCourse) {
      // Automatically fill in institution ID and display timezone from the user's other courses.
      const existingSettingsResult = await queryRow(
        sql.get_existing_owner_course_settings,
        { user_id: res.locals.authn_user.user_id },
        z.object({
          institution_id: IdSchema,
          display_timezone: z.string(),
        }),
      );
      const repo_short_name = github.reponameFromShortname(short_name);
      const repo_options = {
        short_name,
        title,
        institution_id: existingSettingsResult.institution_id,
        display_timezone: existingSettingsResult.display_timezone,
        path: path.join(config.coursesRoot, repo_short_name),
        repo_short_name,
        github_user,
        course_request_id,
      };
      await github.createCourseRepoJob(repo_options, res.locals.authn_user);

      // Redirect on success so that refreshing doesn't create another request
      res.redirect(req.originalUrl);

      // Do this in the background once we've redirected the response.
      try {
        await opsbot.sendCourseRequestMessage(
          `*Automatically creating course*\n` +
            `Course repo: ${repo_short_name}\n` +
            `Course rubric: ${short_name}\n` +
            `Course title: ${title}\n` +
            `Requested by: ${first_name} ${last_name} (${work_email})\n` +
            `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
            `GitHub username: ${github_user || 'not provided'}`,
        );
      } catch (err) {
        logger.error('Error sending course request message to Slack', err);
        Sentry.captureException(err);
      }
    } else {
      // Not automatically created.
      res.redirect(req.originalUrl);

      // Do this in the background once we've redirected the response.
      try {
        await opsbot.sendCourseRequestMessage(
          `*Incoming course request*\n` +
            `Course rubric: ${short_name}\n` +
            `Course title: ${title}\n` +
            `Requested by: ${first_name} ${last_name} (${work_email})\n` +
            `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
            `GitHub username: ${github_user || 'not provided'}`,
        );
      } catch (err) {
        logger.error('Error sending course request message to Slack', err);
        Sentry.captureException(err);
      }
    }
  }),
);

export default router;

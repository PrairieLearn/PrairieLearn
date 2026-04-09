import * as path from 'path';

import { Router } from 'express';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { Lti13Claim } from '../../ee/lib/lti13.js';
import { config } from '../../lib/config.js';
import { insertCourseRequest } from '../../lib/course-request.js';
import * as github from '../../lib/github.js';
import { isEnterprise } from '../../lib/license.js';
import * as opsbot from '../../lib/opsbot.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { RequestCourse } from './instructorRequestCourse.html.js';
import {
  CourseRequestRowSchema,
  type Lti13CourseRequestInput,
} from './instructorRequestCourse.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const rows = await queryRows(
      sql.get_requests,
      { user_id: res.locals.authn_user.id },
      CourseRequestRowSchema,
    );

    let lti13Info: Lti13CourseRequestInput = null;
    if (isEnterprise() && 'lti13_claims' in req.session) {
      try {
        const ltiClaim = new Lti13Claim(req);

        lti13Info = {
          'cr-firstname': ltiClaim.get('given_name') ?? '',
          'cr-lastname': ltiClaim.get('family_name') ?? '',
          'cr-email': ltiClaim.get('email') ?? '',
          'cr-shortname':
            ltiClaim.get(['https://purl.imsglobal.org/spec/lti/claim/context', 'label']) ?? '',
          'cr-title':
            ltiClaim.get(['https://purl.imsglobal.org/spec/lti/claim/context', 'title']) ?? '',
          'cr-institution': res.locals.authn_institution.long_name,
        };
      } catch {
        // If LTI information expired or otherwise errors, don't error here.
        // Continue on like there isn't LTI 1.3 information.
        lti13Info = null;
      }
    }

    res.send(RequestCourse({ rows, lti13Info, resLocals: res.locals }));
  }),
);

const ExistingCourseCheckSchema = z.object({
  id: IdSchema,
  short_name: z.string().nullable(),
  title: z.string().nullable(),
  is_owner: z.boolean(),
});

router.get(
  '/check',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const requestSchema = z.object({
      title: z.string().trim().min(1),
    });
    const { title } = requestSchema.parse(req.query);

    const existingCourses = await queryRows(
      sql.get_existing_courses_by_title,
      {
        user_id: res.locals.authn_user.id,
        title,
        institution_id: res.locals.authn_institution.id,
      },
      ExistingCourseCheckSchema,
    );

    const ownedCourse = existingCourses.find((c) => c.is_owner);
    res.json({
      owned: ownedCourse != null,
      exists: existingCourses.length > 0,
    });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
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

    if (!/[A-Z]+ [A-Z0-9]+/.test(short_name)) {
      flash(
        'error',
        'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
      );
      error = true;
    }
    if (title.length === 0) {
      flash('error', 'The course title should not be empty.');
      error = true;
    }
    if (title.length > 75) {
      flash('error', 'The course title must be at most 75 characters.');
      error = true;
    }
    if (first_name.length === 0) {
      flash('error', 'The first name should not be empty.');
      error = true;
    }
    if (last_name.length === 0) {
      flash('error', 'The last name should not be empty.');
      error = true;
    }

    // This indicates that the user is not signed in with an institutional account.
    const isDefaultInstitution = res.locals.authn_institution.id === '1';

    // We require a work email if the user is not signed in with an institutional account.
    if (isDefaultInstitution && work_email.length === 0) {
      flash('error', 'The work email should not be empty.');
      error = true;
    }
    if (institution.length === 0) {
      flash('error', 'The institution should not be empty.');
      error = true;
    }
    if (referral_source.length === 0) {
      flash('error', 'The referral source should not be empty.');
      error = true;
    }

    const hasExistingCourseRequest = await queryScalar(
      sql.get_existing_course_requests,
      {
        user_id: res.locals.authn_user.id,
        short_name,
      },
      z.boolean(),
    );

    if (hasExistingCourseRequest) {
      flash('error', 'You already have a request for this course.');
      error = true;
    }

    // Check if a course with this title already exists at the user's institution.
    const existingCourses = await queryRows(
      sql.get_existing_courses_by_title,
      {
        user_id: res.locals.authn_user.id,
        title,
        institution_id: res.locals.authn_institution.id,
      },
      ExistingCourseCheckSchema,
    );

    const ownedCourse = existingCourses.find((c) => c.is_owner);
    if (ownedCourse) {
      flash(
        'error',
        `You already own a course with the name "${title}". If you want to offer a new semester or section, create a new course instance from within your existing course instead of requesting a new one.`,
      );
      error = true;
    }

    if (error) {
      res.redirect(req.originalUrl);
      return;
    }

    // Otherwise, insert the course request and send a Slack message.
    const course_request_id = await insertCourseRequest({
      short_name,
      title,
      user_id: res.locals.authn_user.id,
      github_user,
      first_name,
      last_name,
      work_email,
      institution,
      referral_source,
    });

    // Check if we can automatically approve and create the course.
    const canAutoCreateCourse = await queryScalar(
      sql.can_auto_create_course,
      { user_id: res.locals.authn_user.id },
      z.boolean(),
    );

    if (config.courseRequestAutoApprovalEnabled && canAutoCreateCourse) {
      // Automatically fill in institution ID and display timezone from the user's other courses.
      const existingSettingsResult = await queryRow(
        sql.get_existing_owner_course_settings,
        { user_id: res.locals.authn_user.id },
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
          '*Automatically creating course*\n' +
            `Course repo: ${repo_short_name}\n` +
            `Course rubric: ${short_name}\n` +
            `Course title: ${title}\n` +
            `Institution: ${res.locals.authn_institution.long_name}\n` +
            `Requested by: ${first_name} ${last_name} (${work_email || res.locals.authn_user.uid})\n` +
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
          '*Incoming course request*\n' +
            `Course rubric: ${short_name}\n` +
            `Course title: ${title}\n` +
            `Institution: ${res.locals.authn_institution.long_name}\n` +
            `Requested by: ${first_name} ${last_name} (${work_email || res.locals.authn_user.uid})\n` +
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

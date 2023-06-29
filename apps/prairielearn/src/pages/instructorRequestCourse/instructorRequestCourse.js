// @ts-check
const express = require('express');
const asyncHandler = require('express-async-handler');
const path = require('path');

const { flash } = require('@prairielearn/flash');
const sqldb = require('@prairielearn/postgres');

const opsbot = require('../../lib/opsbot');
const github = require('../../lib/github');
const { config } = require('../../lib/config');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: remove error display from template.
    const result = await sqldb.queryAsync(sql.get_requests, {
      user_id: res.locals.authn_user.user_id,
    });

    res.locals.course_requests = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
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

    let error = false;

    if (!short_name.match(/[A-Z]+ [A-Z0-9]+/)) {
      flash(
        'error',
        'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.'
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

    const existingCourseRequestsResult = await sqldb.queryOneRowAsync(
      sql.get_existing_course_requests,
      {
        user_id: res.locals.authn_user.user_id,
        short_name,
        title,
      }
    );

    if (existingCourseRequestsResult.rows[0].has_existing_request) {
      flash('error', 'You already have a request for this course.');
      error = true;
    }

    const conflictingCourseOwnersResult = await sqldb.queryAsync(
      sql.get_conflicting_course_owners,
      { short_name: short_name.trim().toLowerCase() }
    );

    const courseOwners = conflictingCourseOwnersResult.rows;

    if (courseOwners.length > 0) {
      // If the course already exists, display an error message containing the owners.
      flash(
        'error',
        `The requested course (${short_name}) already exists. Please contact the owners of that course to request access to it.`
      );
      error = true;
    }

    if (error) {
      res.redirect(req.originalUrl);
      return;
    }

    // Otherwise, insert the course request and send a Slack message.
    const insertRequestResult = await sqldb.queryOneRowAsync(sql.insert_course_request, {
      short_name,
      title,
      user_id: res.locals.authn_user.user_id,
      github_user,
      first_name,
      last_name,
      work_email,
      institution,
    });
    const creq_id = insertRequestResult.rows[0].course_request_id;

    // Check if we can automatically approve and create the course.
    const canAutoCreateResult = await sqldb.queryOneRowAsync(sql.can_auto_create_course, {
      user_id: res.locals.authn_user.user_id,
    });
    const canAutoCreateCourse = canAutoCreateResult.rows[0].can_auto_create_course;

    if (config.courseRequestAutoApprovalEnabled && canAutoCreateCourse) {
      // Automatically fill in institution ID and display timezone from the user's other courses.
      const existingSettingsResult = await sqldb.queryOneRowAsync(
        sql.get_existing_owner_course_settings,
        { user_id: res.locals.authn_user.user_id }
      );
      const repo_short_name = github.reponameFromShortname(short_name);
      const repo_options = {
        short_name: short_name,
        title: title,
        institution_id: existingSettingsResult.rows[0].institution_id,
        display_timezone: existingSettingsResult.rows[0].display_timezone,
        path: path.join(config.coursesRoot, repo_short_name),
        repo_short_name: repo_short_name,
        github_user,
        course_request_id: creq_id,
      };
      await github.createCourseRepoJob(repo_options, res.locals.authn_user);

      // Redirect on success so that refreshing doesn't create another request
      res.redirect(req.originalUrl);

      // Do this in the background once we've redirected the response.
      opsbot.sendCourseRequestMessage(
        `*Automatically creating course*\n` +
          `Course repo: ${repo_short_name}\n` +
          `Course rubric: ${short_name}\n` +
          `Course title: ${title}\n` +
          `Requested by: ${first_name} ${last_name} (${work_email})\n` +
          `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
          `GitHub username: ${github_user || 'not provided'}`
      );
    } else {
      // Not automatically created.
      res.redirect(req.originalUrl);

      // Do this in the background once we've redirected the response.
      opsbot.sendCourseRequestMessage(
        `*Incoming course request*\n` +
          `Course rubric: ${short_name}\n` +
          `Course title: ${title}\n` +
          `Requested by: ${first_name} ${last_name} (${work_email})\n` +
          `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
          `GitHub username: ${github_user || 'not provided'}`
      );
    }
  })
);

module.exports = router;

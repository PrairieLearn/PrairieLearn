// @ts-check
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
const express = require('express');
const util = require('node:util');

const error = require('@prairielearn/error');
const { logger } = require('@prairielearn/logger');
const sqldb = require('@prairielearn/postgres');
const Sentry = require('@prairielearn/sentry');

const { config } = require('../../lib/config');
const github = require('../../lib/github');
const opsbot = require('../../lib/opsbot');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.coursesRoot = config.coursesRoot;
    const result = await sqldb.queryOneRowAsync(sql.select, []);
    _.assign(res.locals, result.rows[0]);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw error.make(403, 'Insufficient permissions');

    if (req.body.__action === 'courses_insert') {
      await sqldb.callAsync('courses_insert', [
        req.body.institution_id,
        req.body.short_name,
        req.body.title,
        req.body.display_timezone,
        req.body.path,
        req.body.repository,
        req.body.branch,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'courses_update_column') {
      await sqldb.callAsync('courses_update_column', [
        req.body.course_id,
        req.body.column_name,
        req.body.value,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'courses_delete') {
      const result = await sqldb.queryZeroOrOneRowAsync(sql.select_course, {
        course_id: req.body.course_id,
      });
      if (result.rowCount !== 1) throw new Error('course not found');

      const short_name = result.rows[0].short_name;
      if (req.body.confirm_short_name !== short_name) {
        throw new Error(
          'deletion aborted: confirmation string "' +
            req.body.confirm_short_name +
            '" did not match expected value of "' +
            short_name +
            '"'
        );
      }

      await sqldb.callAsync('courses_delete', [req.body.course_id, res.locals.authn_user.user_id]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'approve_deny_course_request') {
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
      };

      const jobSequenceId = await util.promisify(github.createCourseRepoJob)(
        repo_options,
        res.locals.authn_user
      );

      res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);

      // Do this in the background once we've redirected the response.
      try {
        opsbot.sendCourseRequestMessageAsync(
          `*Creating course*\n` +
            `Course rubric: ${repo_options.short_name}\n` +
            `Course title: ${repo_options.title}\n` +
            `Approved by: ${res.locals.authn_user.name}`
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
  })
);

module.exports = router;

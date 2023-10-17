const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const github = require('../../lib/github');
const { config } = require('../../lib/config');
const opsbot = require('../../lib/opsbot');
const { logger } = require('@prairielearn/logger');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  res.locals.coursesRoot = config.coursesRoot;
  sqldb.queryOneRow(sql.get_requests, [], (err, result) => {
    if (ERR(err, next)) return;

    _.assign(res.locals, result.rows[0]);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', (req, res, next) => {
  if (!res.locals.is_administrator) return next(new Error('Insufficient permissions'));
  if (req.body.__action === 'approve_deny_course_request') {
    const id = req.body.request_id;
    const user_id = res.locals.authn_user.user_id;
    let action = req.body.approve_deny_action;

    if (action === 'deny') {
      action = 'denied';
    } else {
      return next(new Error(`Unknown course request action "${action}"`));
    }
    const params = {
      id,
      user_id,
      action,
    };
    sqldb.queryOneRow(sql.update_course_request, params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'create_course_from_request') {
    const id = req.body.request_id;
    const user_id = res.locals.authn_user.user_id;
    const params = {
      id,
      user_id,
      action: 'creating',
    };
    sqldb.queryOneRow(sql.update_course_request, params, (err, _result) => {
      if (ERR(err, next)) return;

      // Create the course in the background
      if (ERR(err, next)) return;
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

      github.createCourseRepoJob(repo_options, res.locals.authn_user, (err, job_id) => {
        if (ERR(err, next)) return;

        res.redirect(`/pl/administrator/jobSequence/${job_id}/`);
        opsbot
          .sendCourseRequestMessage(
            `*Creating course*\n` +
              `Course rubric: ${repo_options.short_name}\n` +
              `Course title: ${repo_options.title}\n` +
              `Approved by: ${res.locals.authn_user.name}`,
          )
          .catch((err) => logger.error(err));
      });
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

module.exports = router;

const ERR = require('async-stacktrace');
const _ = require('lodash');
const util = require('util');
const express = require('express');
const router = express.Router();

const error = require('../../prairielib/lib/error');
const sqlDb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const chunks = require('../../lib/chunks');
const cache = require('../../lib/cache');
const config = require('../../lib/config');
const github = require('../../lib/github');
const opsbot = require('../../lib/opsbot');
const logger = require('../../lib/logger');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  res.locals.coursesRoot = config.coursesRoot;
  sqlDb.queryOneRow(sql.select, [], (err, result) => {
    if (ERR(err, next)) return;

    _.assign(res.locals, result.rows[0]);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', (req, res, next) => {
  if (!res.locals.is_administrator) return next(new Error('Insufficient permissions'));
  if (req.body.__action === 'administrators_insert_by_user_uid') {
    let params = [req.body.uid, res.locals.authn_user.user_id];
    sqlDb.call('administrators_insert_by_user_uid', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'administrators_delete_by_user_id') {
    let params = [req.body.user_id, res.locals.authn_user.user_id];
    sqlDb.call('administrators_delete_by_user_id', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'courses_insert') {
    let params = [
      req.body.institution_id,
      req.body.short_name,
      req.body.title,
      req.body.display_timezone,
      req.body.path,
      req.body.repository,
      req.body.branch,
      res.locals.authn_user.user_id,
    ];
    sqlDb.call('courses_insert', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'courses_update_column') {
    let params = [
      req.body.course_id,
      req.body.column_name,
      req.body.value,
      res.locals.authn_user.user_id,
    ];
    sqlDb.call('courses_update_column', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'courses_delete') {
    let params = {
      course_id: req.body.course_id,
    };
    sqlDb.queryZeroOrOneRow(sql.select_course, params, (err, result) => {
      if (ERR(err, next)) return;
      if (result.rowCount !== 1) return next(new Error('course not found'));

      var short_name = result.rows[0].short_name;
      if (req.body.confirm_short_name !== short_name) {
        return next(
          new Error(
            'deletion aborted: confirmation string "' +
              req.body.confirm_short_name +
              '" did not match expected value of "' +
              short_name +
              '"'
          )
        );
      }

      var params = [req.body.course_id, res.locals.authn_user.user_id];
      sqlDb.call('courses_delete', params, (err, _result) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    });
  } else if (req.body.__action === 'invalidate_question_cache') {
    cache.reset((err) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'approve_deny_course_request') {
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
    sqlDb.queryOneRow(sql.update_course_request, params, (err, _result) => {
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
    sqlDb.queryOneRow(sql.update_course_request, params, (err, _result) => {
      if (ERR(err, next)) return;

      /* Create the course in the background */
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
      };

      github.createCourseRepoJob(repo_options, res.locals.authn_user, (err, job_id) => {
        if (ERR(err, next)) return;

        res.redirect(`/pl/administrator/jobSequence/${job_id}/`);
        opsbot.sendCourseRequestMessage(
          `*Creating course*\n` +
            `Course rubric: ${repo_options.short_name}\n` +
            `Course title: ${repo_options.title}\n` +
            `Approved by: ${res.locals.authn_user.name}`,
          (err) => {
            ERR(err, () => {
              logger.error(err);
            });
          }
        );
      });
    });
  } else if (req.body.__action === 'generate_chunks') {
    const course_ids_string = req.body.course_ids || '';
    const authn_user_id = res.locals.authn_user.user_id;

    let course_ids;
    try {
      course_ids = course_ids_string.split(',').map((x) => parseInt(x));
    } catch (err) {
      return next(
        error.make(
          400,
          `could not split course_ids into an array of integers: ${course_ids_string}`
        )
      );
    }
    util.callbackify(chunks.generateAllChunksForCourseList)(
      course_ids,
      authn_user_id,
      (err, job_sequence_id) => {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/administrator/jobSequence/' + job_sequence_id);
      }
    );
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;

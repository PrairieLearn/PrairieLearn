import { selectAuthorizedCourseInstancesForCourse } from '../../models/course-instances';

var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');
const { logger } = require('@prairielearn/logger');
const { CourseInstanceAddEditor } = require('../../lib/editors');
const { idsEqual } = require('../../lib/id');

const fs = require('fs-extra');
const async = require('async');
const _ = require('lodash');

router.get('/', function (req, res, next) {
  async.series(
    [
      (callback) => {
        fs.access(res.locals.course.path, (err) => {
          if (err) {
            if (err.code === 'ENOENT') {
              res.locals.needToSync = true;
            } else {
              return ERR(err, callback);
            }
          }
          callback(null);
        });
      },
      async () => {
        res.locals.course_instances = await selectAuthorizedCourseInstancesForCourse({
          course_id: res.locals.course.id,
          user_id: res.locals.user.id,
          authn_user_id: res.locals.authn_user.id,
          is_administrator: res.locals.is_administrator,
        });
      },
      (callback) => {
        const params = {
          course_id: res.locals.course.id,
        };
        sqldb.query(sql.select_enrollment_counts, params, (err, result) => {
          if (ERR(err, callback)) return;
          res.locals.course_instances.forEach((ci) => {
            var row = _.find(result.rows, (row) => idsEqual(row.course_instance_id, ci.id));
            ci.number = row?.number || 0;
          });
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    },
  );
});

router.post('/', (req, res, next) => {
  debug(`Responding to post with action ${req.body.__action}`);
  if (req.body.__action === 'add_course_instance') {
    debug(`Responding to action add_course_instance`);
    const editor = new CourseInstanceAddEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(
            `Get course_instance_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`,
          );
          sqldb.queryOneRow(
            sql.select_course_instance_id_from_uuid,
            { uuid: editor.uuid, course_id: res.locals.course.id },
            (err, result) => {
              if (ERR(err, next)) return;
              res.redirect(
                res.locals.plainUrlPrefix +
                  '/course_instance/' +
                  result.rows[0].course_instance_id +
                  '/instructor/instance_admin/settings',
              );
            },
          );
        }
      });
    });
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

module.exports = router;

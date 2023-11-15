const ERR = require('async-stacktrace');
import express from 'express';
import * as fs from 'fs-extra';
const async = require('async');
const _ = require('lodash');
import * as path from 'path';
import * as sqldb from '@prairielearn/postgres';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { CourseInstanceAddEditor } from '../../lib/editors';
import { idsEqual } from '../../lib/id';

var router = express.Router();
var sql = sqldb.loadSqlEquiv(__filename);

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
      (callback) => {
        if (!res.locals.authz_data || !res.locals.authz_data.course_instances) {
          return callback(null);
        }
        const params = {
          course_id: res.locals.course.id,
        };
        // We use the list authz_data.course_instances rather than
        // re-fetching the list of course instances, because we
        // only want course instances which are accessible by both
        // the authn user and the effective user, which is a bit
        // complicated to compute. This is already computed in
        // authz_data.course_instances.
        sqldb.query(sql.select_enrollment_counts, params, (err, result) => {
          if (ERR(err, callback)) return;
          res.locals.authz_data.course_instances.forEach((ci) => {
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

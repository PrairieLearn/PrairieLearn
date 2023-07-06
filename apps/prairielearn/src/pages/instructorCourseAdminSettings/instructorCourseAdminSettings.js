const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const fs = require('fs-extra');
const async = require('async');
const ERR = require('async-stacktrace');
const { CourseInfoEditor } = require('../../lib/editors');
const { logger } = require('@prairielearn/logger');
const error = require('@prairielearn/error');

router.get('/', function (req, res, next) {
  debug('GET /');

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
        if (res.locals.needToSync) return callback(null);
        fs.access(path.join(res.locals.course.path, 'infoCourse.json'), (err) => {
          if (err) {
            if (err.code === 'ENOENT') {
              res.locals.noInfo = true;
            } else {
              return ERR(err, callback);
            }
          }
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
  if (!res.locals.authz_data.has_course_permission_edit || res.locals.course.example_course) {
    return next(
      error.make(403, 'Access denied (must be course editor and must not be example course)'),
    );
  }

  debug(`Responding to post with action ${req.body.__action}`);
  if (req.body.__action === 'add_configuration') {
    debug(`Responding to action add_configuration`);
    const editor = new CourseInfoEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(req.originalUrl);
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

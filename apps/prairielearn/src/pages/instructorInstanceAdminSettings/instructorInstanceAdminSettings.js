const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const { config } = require('../../lib/config');
const QR = require('qrcode-svg');

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');
const { logger } = require('@prairielearn/logger');
const {
  CourseInstanceCopyEditor,
  CourseInstanceRenameEditor,
  CourseInstanceDeleteEditor,
} = require('../../lib/editors');
const { encodePath } = require('../../lib/uri-util');

router.get('/', function (req, res, next) {
  debug('GET /');
  async.series(
    [
      (callback) => {
        debug('query short_names');
        sqldb.queryOneRow(sql.short_names, { course_id: res.locals.course.id }, (err, result) => {
          if (ERR(err, callback)) return;
          res.locals.short_names = result.rows[0].short_names;
          callback(null);
        });
      },
    ],
    function (err) {
      if (ERR(err, next)) return;
      const host = config.serverCanonicalHost || `${req.protocol}://${req.headers.host}`;
      res.locals.studentLink = new URL(
        res.locals.plainUrlPrefix + '/course_instance/' + res.locals.course_instance.id,
        host
      ).href;
      res.locals.studentLinkQRCode = new QR({
        content: res.locals.studentLink,
        width: 512,
        height: 512,
      }).svg();
      res.locals.infoCourseInstancePath = encodePath(
        path.join(
          'courseInstances',
          res.locals.course_instance.short_name,
          'infoCourseInstance.json'
        )
      );
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  );
});

router.post('/', function (req, res, next) {
  debug('POST /');
  if (req.body.__action === 'copy_course_instance') {
    debug('Copy course instance');
    const editor = new CourseInstanceCopyEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(
            `Get course_instance_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`
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
                  '/instructor/instance_admin/settings'
              );
            }
          );
        }
      });
    });
  } else if (req.body.__action === 'delete_course_instance') {
    debug('Delete course instance');
    const editor = new CourseInstanceDeleteEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(`${res.locals.plainUrlPrefix}/course/${res.locals.course.id}/course_admin`);
        }
      });
    });
  } else if (req.body.__action === 'change_id') {
    debug(`Change short_name from ${res.locals.course_instance.short_name} to ${req.body.id}`);
    if (!req.body.id) return next(new Error(`Invalid CIID (was falsy): ${req.body.id}`));
    if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
      return next(
        new Error(
          `Invalid CIID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`
        )
      );
    }
    let ciid_new;
    try {
      ciid_new = path.normalize(req.body.id);
    } catch (err) {
      return next(new Error(`Invalid CIID (could not be normalized): ${req.body.id}`));
    }
    if (res.locals.course_instance.short_name === ciid_new) {
      debug('The new ciid is the same as the old ciid - do nothing');
      res.redirect(req.originalUrl);
    } else {
      const editor = new CourseInstanceRenameEditor({
        locals: res.locals,
        ciid_new: ciid_new,
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
    }
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;

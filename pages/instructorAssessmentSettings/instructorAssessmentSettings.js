const ERR = require('async-stacktrace');
const async = require('async');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const config = require('../../lib/config');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const error = require('../../prairielib/lib/error');
const logger = require('../../lib/logger');
const {
  AssessmentCopyEditor,
  AssessmentRenameEditor,
  AssessmentDeleteEditor,
} = require('../../lib/editors');
const { encodePath } = require('../../lib/uri-util');

router.get('/', function (req, res, next) {
  debug('GET /');
  async.series(
    [
      (callback) => {
        debug('query tids');
        sqldb.queryOneRow(
          sql.tids,
          { course_instance_id: res.locals.course_instance.id },
          (err, result) => {
            if (ERR(err, callback)) return;
            res.locals.tids = result.rows[0].tids;
            callback(null);
          }
        );
      },
    ],
    function (err) {
      if (ERR(err, next)) return;
      debug('render page');
      let host = config.serverCanonicalHost || 'https://' + req.headers.host;
      res.locals.studentLink =
        host +
        res.locals.plainUrlPrefix +
        '/course_instance/' +
        res.locals.course_instance.id +
        '/assessment/' +
        res.locals.assessment.id;
      res.locals.infoAssessmentPath = encodePath(
        path.join(
          'courseInstances',
          res.locals.course_instance.short_name,
          'assessments',
          res.locals.assessment.tid,
          'infoAssessment.json'
        )
      );
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  );
});

router.post('/', function (req, res, next) {
  debug('POST /');
  if (req.body.__action === 'copy_assessment') {
    debug('Copy assessment');
    const editor = new AssessmentCopyEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(
            `Get assessment_id from uuid=${editor.uuid} with course_instance_id=${res.locals.course_instance.id}`
          );
          sqldb.queryOneRow(
            sql.select_assessment_id_from_uuid,
            {
              uuid: editor.uuid,
              course_instance_id: res.locals.course_instance.id,
            },
            (err, result) => {
              if (ERR(err, next)) return;
              res.redirect(
                res.locals.urlPrefix + '/assessment/' + result.rows[0].assessment_id + '/settings'
              );
            }
          );
        }
      });
    });
  } else if (req.body.__action === 'delete_assessment') {
    debug('Delete assessment');
    const editor = new AssessmentDeleteEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(res.locals.urlPrefix + '/instance_admin/assessments');
        }
      });
    });
  } else if (req.body.__action === 'change_id') {
    debug(`Change tid from ${res.locals.assessment.tid} to ${req.body.id}`);
    if (!req.body.id) return next(new Error(`Invalid TID (was falsey): ${req.body.id}`));
    if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
      return next(
        new Error(
          `Invalid TID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`
        )
      );
    }
    let tid_new;
    try {
      tid_new = path.normalize(req.body.id);
    } catch (err) {
      return next(new Error(`Invalid TID (could not be normalized): ${req.body.id}`));
    }
    if (res.locals.assessment.tid === tid_new) {
      debug('The new tid is the same as the old tid - do nothing');
      res.redirect(req.originalUrl);
    } else {
      const editor = new AssessmentRenameEditor({
        locals: res.locals,
        tid_new: tid_new,
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

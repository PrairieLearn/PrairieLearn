const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const async = require('async');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const logger = require('../../lib/logger');
const { QuestionTransferEditor } = require('../../lib/editors');
const config = require('../../lib/config');
const { idsEqual } = require('../../lib/id');

const sql = sqlLoader.loadSqlEquiv(__filename);

function getFileTransfer(file_transfer_id, user_id, callback) {
  let file_transfer;
  async.series(
    [
      (callback) => {
        sqldb.queryOneRow(sql.select_file_transfer, { id: file_transfer_id }, (err, result) => {
          if (ERR(err, callback)) return;
          file_transfer = result.rows[0];
          if (file_transfer.transfer_type !== 'CopyQuestion') {
            return callback(new Error(`bad transfer_type: ${file_transfer.transfer_type}`));
          }
          if (!idsEqual(file_transfer.user_id, user_id)) {
            return callback(
              new Error(
                `must have same user_id: ${
                  file_transfer.user_id
                } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`
              )
            );
          }
          callback(null);
        });
      },
      (callback) => {
        sqldb.queryOneRow(
          sql.select_course_from_course_id,
          { course_id: file_transfer.from_course_id },
          (err, result) => {
            if (ERR(err, callback)) return;
            file_transfer.from_course_short_name = result.rows[0].short_name;
            callback(null);
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, file_transfer);
    }
  );
}

router.get('/:file_transfer_id', function (req, res, next) {
  if (config.filesRoot == null) return next(new Error('config.filesRoot is null'));
  getFileTransfer(req.params.file_transfer_id, res.locals.user.user_id, (err, file_transfer) => {
    if (ERR(err, next)) return;
    /* Split the full path and grab everything after questions/ to get the QID */
    const question_exploded = path.normalize(file_transfer.from_filename).split(path.sep);
    const questions_dir_idx = question_exploded.findIndex((x) => x === 'questions');
    const qid = question_exploded.slice(questions_dir_idx + 1).join(path.sep);
    const editor = new QuestionTransferEditor({
      locals: res.locals,
      from_qid: qid,
      from_course_short_name: file_transfer.from_course_short_name,
      from_path: path.join(config.filesRoot, file_transfer.storage_filename),
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(`Soft-delete file transfer`);
          sqldb.queryOneRow(
            sql.soft_delete_file_transfer,
            {
              id: req.params.file_transfer_id,
              user_id: res.locals.user.user_id,
            },
            (err, _result) => {
              if (ERR(err, next)) return;
              debug(
                `Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`
              );
              sqldb.queryOneRow(
                sql.select_question_id_from_uuid,
                { uuid: editor.uuid, course_id: res.locals.course.id },
                (err, result) => {
                  if (ERR(err, next)) return;
                  res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id);
                }
              );
            }
          );
        }
      });
    });
  });
});

module.exports = router;

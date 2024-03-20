//@ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
import * as async from 'async';
import * as sqldb from '@prairielearn/postgres';
import { logger } from '@prairielearn/logger';
import { flash } from '@prairielearn/flash';
import { QuestionTransferEditor } from '../../lib/editors';
import { config } from '../../lib/config';
import { idsEqual } from '../../lib/id';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

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
                } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`,
              ),
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
            file_transfer.from_course = result.rows[0];
            callback(null);
          },
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, file_transfer);
    },
  );
}

router.get('/:file_transfer_id', function (req, res, next) {
  if (config.filesRoot == null) return next(new Error('config.filesRoot is null'));
  getFileTransfer(req.params.file_transfer_id, res.locals.user.user_id, (err, file_transfer) => {
    if (ERR(err, next)) return;
    // Split the full path and grab everything after questions/ to get the QID
    const question_exploded = path.normalize(file_transfer.from_filename).split(path.sep);
    const questions_dir_idx = question_exploded.findIndex((x) => x === 'questions');
    const qid = question_exploded.slice(questions_dir_idx + 1).join(path.sep);
    const editor = new QuestionTransferEditor({
      locals: res.locals,
      from_qid: qid,
      from_course_short_name: file_transfer.from_course.short_name,
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
                `Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`,
              );
              sqldb.queryOneRow(
                sql.select_question_id_from_uuid,
                { uuid: editor.uuid, course_id: res.locals.course.id },
                (err, result) => {
                  if (ERR(err, next)) return;
                  flash(
                    'success',
                    'Question copied successfully. You are now viewing your copy of the question.',
                  );
                  res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id);
                },
              );
            },
          );
        }
      });
    });
  });
});

export default router;

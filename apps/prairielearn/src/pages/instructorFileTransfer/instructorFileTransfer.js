// @ts-check
import * as path from 'path';

import debugfn from 'debug';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { QuestionTransferEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:instructorFileTransfer');

async function getFileTransfer(file_transfer_id, user_id) {
  let file_transfer;
  const result = await sqldb.queryOneRowAsync(sql.select_file_transfer, {
    id: file_transfer_id,
  });
  file_transfer = result.rows[0];
  if (file_transfer.transfer_type !== 'CopyQuestion') {
    throw new Error(`bad transfer_type: ${file_transfer.transfer_type}`);
  }
  if (!idsEqual(file_transfer.user_id, user_id)) {
    throw new Error(
      `must have same user_id: ${
        file_transfer.user_id
      } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`,
    );
  }
  const courseResult = await sqldb.queryOneRowAsync(sql.select_course_from_course_id, {
    course_id: file_transfer.from_course_id,
  });
  file_transfer.from_course = courseResult.rows[0];
  return file_transfer;
}

router.get(
  '/:file_transfer_id',
  asyncHandler(async (req, res, next) => {
    if (config.filesRoot == null) return next(new Error('config.filesRoot is null'));
    const file_transfer = await getFileTransfer(
      req.params.file_transfer_id,
      res.locals.user.user_id,
    );
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
    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      return;
    }

    debug('Soft-delete file transfer');
    await sqldb.queryOneRowAsync(sql.soft_delete_file_transfer, {
      id: req.params.file_transfer_id,
      user_id: res.locals.user.user_id,
    });
    debug(`Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
    const result = await sqldb.queryOneRowAsync(sql.select_question_id_from_uuid, {
      uuid: editor.uuid,
      course_id: res.locals.course.id,
    });
    flash(
      'success',
      'Question copied successfully. You are now viewing your copy of the question.',
    );
    res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id);
  }),
);

export default router;

import * as path from 'path';

import * as express from 'express';
import { type Response } from 'express';
import asyncHandler from 'express-async-handler';

import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { type FileTransfer, FileTransferSchema } from '../../lib/db-types.js';
import {
  CourseInstanceTransferEditor,
  type Editor,
  QuestionTransferEditor,
} from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionByUuid } from '../../models/question.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getFileTransfer(file_transfer_id: string, user_id: string): Promise<FileTransfer> {
  const file_transfer = await sqldb.queryRow(
    sql.select_file_transfer,
    { id: file_transfer_id },
    FileTransferSchema,
  );
  if (!idsEqual(file_transfer.user_id, user_id)) {
    throw new Error(
      `must have same user_id: ${
        file_transfer.user_id
      } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`,
    );
  }
  return file_transfer;
}

async function doTransfer(res: Response, editor: Editor, fileTransferId: string) {
  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
    return;
  }

  await sqldb.queryOneRowAsync(sql.soft_delete_file_transfer, {
    id: fileTransferId,
    user_id: res.locals.user.user_id,
  });
}

router.get(
  '/:file_transfer_id',
  asyncHandler(async (req, res) => {
    if (config.filesRoot == null) throw new Error('config.filesRoot is null');
    const file_transfer = await getFileTransfer(
      req.params.file_transfer_id,
      res.locals.user.user_id,
    );
    const from_course = await selectCourseById(file_transfer.from_course_id);

    if (file_transfer.transfer_type === 'CopyQuestion') {
      // Split the full path and grab everything after questions/ to get the QID
      const question_exploded = path.normalize(file_transfer.from_filename).split(path.sep);
      const questions_dir_idx = question_exploded.findIndex((x) => x === 'questions');
      const qid = question_exploded.slice(questions_dir_idx + 1).join(path.sep);
      const editor = new QuestionTransferEditor({
        locals: res.locals as any,
        from_qid: qid,
        from_course_short_name: from_course.short_name,
        from_path: path.join(config.filesRoot, file_transfer.storage_filename),
      });

      await doTransfer(res, editor, file_transfer.id);

      const question = await selectQuestionByUuid({
        // TODO: we'll have to change something here once we allow instructors to
        // copy questions that have been shared with their course.
        course_id: res.locals.course.id,
        uuid: editor.uuid,
      });

      flash(
        'success',
        'Question copied successfully. You are now viewing your copy of the question.',
      );
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/settings`);
    } else if (file_transfer.transfer_type === 'CopyCourseInstance') {
      console.log('TODO');
      //   const courseResult = await selectCourseById(file_transfer.from_course_id);
      //   const courseInstanceResult = await selectCourseInstanceById(
      //     file_transfer.from_course_instance_id,
      //   );

      //   file_transfer.from_course = courseResult;
      //   file_transfer.from_course_instance = courseInstanceResult;

      //   const editor = new CourseInstanceTransferEditor({
      //     locals: res.locals as any,
      //     from_course: file_transfer.from_course,
      //     from_path: file_transfer.from_filename,
      //     to_course_short_name: res.locals.course.short_name,
      //     course_instance: file_transfer.from_course_instance,
      //   });
    }
  }),
);

export default router;

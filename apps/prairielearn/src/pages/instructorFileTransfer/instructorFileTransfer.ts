import * as path from 'path';

import { type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { type FileTransfer, FileTransferSchema } from '../../lib/db-types.js';
import { CourseInstanceCopyEditor, type Editor, QuestionCopyEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import { assertNever } from '../../lib/types.js';
import {
  selectCourseInstanceByShortName,
  selectCourseInstanceByUuid,
} from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionByUuid } from '../../models/question.js';

const router = Router();
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

  await sqldb.queryAsync(sql.soft_delete_file_transfer, {
    id: fileTransferId,
    user_id: res.locals.user.user_id,
  });
}

export function getContentDir(fullPath: string, parentDir: string): string {
  const path_exploded = path.normalize(fullPath).split(path.sep);
  const content_dir_idx = path_exploded.findIndex((x) => x === parentDir);
  return path_exploded.slice(content_dir_idx + 1).join(path.sep);
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
      const qid = getContentDir(file_transfer.from_filename, 'questions');
      const editor = new QuestionCopyEditor({
        locals: res.locals as any,
        from_qid: qid,
        from_course_short_name: from_course.short_name,
        from_path: path.join(config.filesRoot, file_transfer.storage_filename),
        is_transfer: true,
      });

      await doTransfer(res, editor, file_transfer.id);

      const question = await selectQuestionByUuid({
        course_id: res.locals.course.id,
        uuid: editor.uuid,
      });

      flash(
        'success',
        'Question copied successfully. You are now viewing your copy of the question.',
      );
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/settings`);
    } else if (file_transfer.transfer_type === 'CopyCourseInstance') {
      const course = await selectCourseById(file_transfer.from_course_id);
      const shortName = getContentDir(file_transfer.from_filename, 'courseInstances');

      const fromCourseInstance = await selectCourseInstanceByShortName({
        course_id: file_transfer.from_course_id,
        short_name: shortName,
      });

      const editor = new CourseInstanceCopyEditor({
        locals: res.locals as any,
        from_course: course,
        from_path: path.join(config.filesRoot, file_transfer.storage_filename),
        course_instance: fromCourseInstance,
      });

      await doTransfer(res, editor, file_transfer.id);

      const courseInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course_id: res.locals.course.id,
      });

      flash(
        'success',
        'Course instance copied successfully. You are now viewing your copy of the course instance.',
      );
      // Redirect to the copied course instance
      res.redirect(
        `${res.locals.plainUrlPrefix}/course_instance/${courseInstance.id}/instructor/instance_admin/assessments`,
      );
    } else {
      assertNever(file_transfer.transfer_type);
    }
  }),
);

export default router;

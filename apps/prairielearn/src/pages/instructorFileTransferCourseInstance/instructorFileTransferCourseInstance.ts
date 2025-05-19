import debugfn from 'debug';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { CourseInstanceTransferEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:instructorFileTransfer');

async function getFileTransfer(file_transfer_id, user_id) {
  const result = await sqldb.queryOneRowAsync(sql.select_file_transfer, {
    id: file_transfer_id,
  });
  const file_transfer = result.rows[0];
  if (file_transfer.transfer_type !== 'CopyCourseInstance') {
    throw new Error(`bad transfer_type: ${file_transfer.transfer_type}`);
  }
  if (!idsEqual(file_transfer.user_id, user_id)) {
    throw new Error(
      `must have same user_id: ${
        file_transfer.user_id
      } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`,
    );
  }
  const courseResult = await selectCourseById(file_transfer.from_course_id);
  const courseInstanceResult = await selectCourseInstanceById(
    file_transfer.from_course_instance_id,
  );

  file_transfer.from_course = courseResult;
  file_transfer.from_course_instance = courseInstanceResult;
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

    const editor = new CourseInstanceTransferEditor({
      locals: res.locals as any,
      from_course: file_transfer.from_course,
      from_path: file_transfer.from_filename,
      to_course_short_name: res.locals.course.short_name,
      course_instance: file_transfer.from_course_instance,
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
    debug(`Get course_instance_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
    const result = await sqldb.queryOneRowAsync(sql.select_course_instance_id_from_uuid, {
      uuid: editor.uuid,
      course_id: res.locals.course.id,
    });
    flash(
      'success',
      'Course Instance copied successfully. You are now viewing your copy of the Course Instance.',
    );
    // Redirect to the copied course instance
    res.redirect(
      `${req.protocol}://${req.get('host')}/pl/course_instance/${result.rows[0].course_instance_id}/instructor/instance_admin/assessments`,
    );
  }),
);

export default router;

// @ts-check
import * as path from 'path';

import debugfn from 'debug';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { AssessmentTransferEditor } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';

import { selectCourseById } from '../../models/course.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:instructorFileTransfer');

async function getFileTransfer(file_transfer_id, user_id) {
  let file_transfer;
  const result = await sqldb.queryOneRowAsync(sql.select_file_transfer, {
    id: file_transfer_id,
  });
  file_transfer = result.rows[0];
  if (file_transfer.transfer_type !== 'CopyAssessment') {
    throw new Error(`bad transfer_type: ${file_transfer.transfer_type}`);
  }
  if (!idsEqual(file_transfer.user_id, user_id)) {
    throw new Error(
      `must have same user_id: ${
        file_transfer.user_id
      } and ${user_id} (types: ${typeof file_transfer.user_id}, ${typeof user_id})`,
    );
  }
  const courseResult = await selectCourseById(file_transfer.from_course_id)
  
  file_transfer.from_course = courseResult;
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

    // Split the full path and grab everything after 'assessments/' to get the assessment ID
    const assessment_exploded = path.normalize(file_transfer.from_filename).split(path.sep);
    const assessments_dir_idx = assessment_exploded.findIndex((x) => x === 'assessments');
    const assessment_id = assessment_exploded.slice(assessments_dir_idx + 1).join(path.sep);
    const editor = new AssessmentTransferEditor({
      locals: res.locals,
      from_course_sharing_name: file_transfer.from_course.sharing_name,
      from_path: file_transfer.from_filename,
      to_assessment_tid: assessment_id,
    });

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      res.redirect(res.locals.urlPrefix + '/instructor/edit_error/' + serverJob.jobSequenceId);
      return;
    }

    debug('Soft-delete file transfer');
    await sqldb.queryOneRowAsync(sql.soft_delete_file_transfer, {
      id: req.params.file_transfer_id,
      user_id: res.locals.user.user_id,
    });
    debug(`Get assessment_id from uuid=${editor.uuid} with course_instance_id=${res.locals.course_instance.id}`);
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_id_from_uuid, {
      uuid: editor.uuid,
      course_instance_id: res.locals.course_instance.id,
    });
    flash(
      'success',
      'Assessment copied successfully. You are now viewing your copy of the assessment.',
    );
    res.redirect(res.locals.urlPrefix + '/instructor/assessment/' + result.rows[0].assessment_id + '/questions');
  }),
);

export default router;

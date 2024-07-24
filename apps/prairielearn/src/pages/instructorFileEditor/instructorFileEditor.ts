import * as path from 'path';

import * as modelist from 'ace-code/src/ext/modelist.js';
import sha256 from 'crypto-js/sha256.js';
import debugfn from 'debug';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode, b64DecodeUnicode } from '../../lib/base64-util.js';
import { getCourseOwners } from '../../lib/course.js';
import { FileEditSchema, IdSchema } from '../../lib/db-types.js';
import { getErrorsAndWarningsForFilePath } from '../../lib/editorUtil.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { deleteFile, getFile, uploadFile } from '../../lib/file-store.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { getJobSequence } from '../../lib/server-jobs.js';

import {
  type DraftEdit,
  type FileEditorData,
  InstructorFileEditor,
  InstructorFileEditorNoPermission,
} from './instructorFileEditor.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:instructorFileEditor');

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    // Do not allow users to edit the exampleCourse
    if (res.locals.course.example_course) {
      res
        .status(403)
        .send(InstructorFileEditorNoPermission({ resLocals: res.locals, courseOwners: [] }));
      return;
    }

    if (!res.locals.authz_data.has_course_permission_edit) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get edit permissions.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res
        .status(403)
        .send(InstructorFileEditorNoPermission({ resLocals: res.locals, courseOwners }));
      return;
    }

    // Do not allow users to edit files in bad locations (e.g., outside the
    // current course, outside the current course instance, etc.). Do this by
    // wrapping everything in getPaths, which throws an error on a bad path.
    const paths = getPaths(req.params[0], res.locals);

    // We could also check if the file exists, if the file actually is a
    // file and not a directory, if the file is non-binary, etc., and try
    // to give a graceful error message on the edit page rather than send
    // the user to an error page.
    //
    // We won't do that, on the assumption that most users get to an edit
    // page through our UI, which already tries to prevent letting users
    // go where they should not.

    const fullPath = paths.workingPath;
    const relPath = paths.workingPathRelativeToCourse;

    debug('Read from disk');
    const contents = await fs.readFile(fullPath);
    const binary = await isBinaryFile(contents);
    debug(`isBinaryFile: ${binary}`);
    if (binary) {
      debug('found a binary file');
      throw new Error('Cannot edit binary file');
    } else {
      debug('found a text file');
    }

    const encodedContents = b64EncodeUnicode(contents.toString('utf8'));
    const { errors: sync_errors, warnings: sync_warnings } = await getErrorsAndWarningsForFilePath(
      res.locals.course.id,
      relPath,
    );

    const editorData: FileEditorData = {
      fileName: path.basename(relPath),
      normalizedFileName: path.normalize(relPath),
      aceMode: modelist.getModeForPath(relPath).mode,
      diskContents: encodedContents,
      diskHash: getHash(encodedContents),
      sync_errors,
      sync_warnings,
    };

    debug('Read from db');
    const draftEdit = await readDraftEdit({
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      course_id: res.locals.course.id,
      dir_name: path.dirname(relPath),
      file_name: editorData.fileName,
    });

    if (draftEdit != null) {
      if (draftEdit.fileEdit.job_sequence_id != null) {
        debug('Read job sequence');
        draftEdit.jobSequence = await getJobSequence(
          draftEdit.fileEdit.job_sequence_id,
          res.locals.course.id,
        );
      }

      if (draftEdit.jobSequence) {
        if (draftEdit.jobSequence?.status === 'Running') {
          // Because of the redirect, if the job sequence ends up failing to save,
          // then the corresponding draft will be lost (all drafts are soft-deleted
          // from the database on readDraftEdit).
          debug('Job sequence is still running - redirect to status page');
          res.redirect(`${res.locals.urlPrefix}/jobSequence/${draftEdit.jobSequence.id}`);
          return;
        }

        // No draft is older than 24 hours, so it is safe to assume that no
        // job sequence is legacy... but, just in case, we will check and log
        // a warning if we find one. We will treat the corresponding draft as
        // if it was neither saved nor synced.
        if (draftEdit.jobSequence.legacy) {
          debug('Found a legacy job sequence');
          logger.warn(
            `Found a legacy job sequence (id=${draftEdit.jobSequence.id}) ` +
              `in a file edit (id=${draftEdit.fileEdit.id})`,
          );
        } else {
          const job = draftEdit.jobSequence.jobs[0];

          debug('Found a job sequence');
          debug(` saveAttempted=${job.data.saveAttempted}`);
          debug(` saveSucceeded=${job.data.saveSucceeded}`);
          debug(` syncAttempted=${job.data.syncAttempted}`);
          debug(` syncSucceeded=${job.data.syncSucceeded}`);

          // We check for the presence of a `saveSucceeded` key to know if
          // the edit was saved (i.e., written to disk in the case of no git,
          // or written to disk and then pushed in the case of git). If this
          // key exists, its value will be true.
          if (job.data.saveSucceeded) {
            draftEdit.didSave = true;

            // We check for the presence of a `syncSucceeded` key to know
            // if the sync was successful. If this key exists, its value will
            // be true. Note that the cause of sync failure could be a file
            // other than the one being edited.
            //
            // By "the sync" we mean "the sync after a successfully saved
            // edit." Remember that, if using git, we pull before we push.
            // So, if we error on save, then we still try to sync whatever
            // was pulled from the remote repository, even though changes
            // made by the edit will have been discarded. We ignore this
            // in the UI for now.
            if (job.data.syncSucceeded) {
              draftEdit.didSync = true;
            }
          }
        }
      }

      if (!draftEdit.didSave) {
        // There is a recently saved draft that was not written to disk and that differs from what is on disk.
        draftEdit.alertChoice = true;
      }
    }

    res.send(InstructorFileEditor({ resLocals: res.locals, editorData, paths, draftEdit }));
  }),
);

router.post(
  '/*',
  asyncHandler(async (req, res) => {
    debug('POST /');
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
    }

    const paths = getPaths(req.params[0], res.locals);

    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'save_and_sync') {
      debug('Save and sync');

      debug('Write draft file edit to db and to file store');
      const editID = await writeDraftEdit({
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        course_id: res.locals.course.id,
        dir_name: paths.workingDirectory,
        file_name: paths.workingFilename,
        orig_hash: req.body.file_edit_orig_hash,
        editContents: req.body.file_edit_contents,
      });

      const editor = new FileModifyEditor({
        locals: res.locals,
        container,
        filePath: paths.workingPath,
        editContents: req.body.file_edit_contents,
        origHash: req.body.file_edit_orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      await updateJobSequenceId(editID, serverJob.jobSequenceId);

      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        // We're deliberately choosing to ignore errors here. If there was an
        // error, we'll still redirect the user back to the same page, which will
        // allow them to handle the error.
      }

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

function getHash(contents: string) {
  return sha256(contents).toString();
}

async function readDraftEdit({
  user_id,
  course_id,
  dir_name,
  file_name,
  authn_user_id,
}: {
  user_id: string;
  course_id: string;
  dir_name: string;
  file_name: string;
  authn_user_id: string;
}): Promise<DraftEdit | null> {
  debug('Looking for previously saved drafts');
  const fileEdit = await sqldb.queryOptionalRow(
    sql.select_file_edit,
    { user_id, course_id, dir_name, file_name, max_age: 24 * 60 * 60 * 1000 },
    FileEditSchema,
  );
  if (fileEdit) {
    debug(`Found a saved draft with id ${fileEdit.id}`);
  } else {
    debug('Found no recent saved drafts');
  }

  // We are choosing to soft-delete all drafts *before* reading the
  // contents of whatever draft we found, because we don't want to get
  // in a situation where the user is trapped with an unreadable draft.
  // We accept the possibility that a draft will occasionally be lost.
  const deletedFileEdits = await sqldb.queryRows(
    sql.soft_delete_file_edit,
    { user_id, course_id, dir_name, file_name },
    IdSchema,
  );
  debug(`Deleted ${deletedFileEdits.length} previously saved drafts`);
  for (const file_id of deletedFileEdits) {
    if (fileEdit?.file_id != null && idsEqual(file_id, fileEdit.file_id)) {
      debug(`Defer removal of file_id=${file_id} from file store until after reading contents`);
    } else {
      debug(`Remove file_id=${file_id} from file store`);
      await deleteFile(file_id, authn_user_id);
    }
  }
  if (fileEdit == null) return null;

  let contents: string | undefined;
  let hash: string | undefined;
  if (fileEdit.file_id != null) {
    debug('Read contents of file edit');
    const result = await getFile(fileEdit.file_id);
    contents = b64EncodeUnicode(result.contents.toString('utf8'));
    hash = getHash(contents);

    debug(`Remove file_id=${fileEdit.file_id} from file store`);
    await deleteFile(fileEdit.file_id, authn_user_id);
  }

  return { fileEdit, contents, hash };
}

async function updateJobSequenceId(edit_id: string, job_sequence_id: string) {
  await sqldb.queryAsync(sql.update_job_sequence_id, { id: edit_id, job_sequence_id });
  debug(`Update file edit id=${edit_id}: job_sequence_id=${job_sequence_id}`);
}

async function writeDraftEdit({
  user_id,
  authn_user_id,
  course_id,
  dir_name,
  file_name,
  orig_hash,
  editContents,
}: {
  user_id: string;
  authn_user_id: string;
  course_id: string;
  dir_name: string;
  file_name: string;
  orig_hash: string;
  editContents: string;
}) {
  const deletedFileEdits = await sqldb.queryRows(
    sql.soft_delete_file_edit,
    { user_id, course_id, dir_name, file_name },
    IdSchema,
  );
  debug(`Deleted ${deletedFileEdits.length} previously saved drafts`);
  for (const file_id of deletedFileEdits) {
    debug(`Remove file_id=${file_id} from file store`);
    await deleteFile(file_id, authn_user_id);
  }

  debug('Write contents to file store');
  const file_id = await uploadFile({
    display_filename: file_name,
    contents: Buffer.from(b64DecodeUnicode(editContents), 'utf8'),
    type: 'instructor_file_edit',
    assessment_id: null,
    assessment_instance_id: null,
    instance_question_id: null,
    user_id,
    authn_user_id,
  });
  debug(`Wrote file_id=${file_id} to file store`);

  const editID = await sqldb.queryRow(
    sql.insert_file_edit,
    { user_id, course_id, dir_name, file_name, orig_hash, file_id },
    IdSchema,
  );
  debug(`Created file edit in database with id ${editID}`);
  return editID;
}

export default router;

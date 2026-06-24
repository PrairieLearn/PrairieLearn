import * as path from 'path';

// @ts-expect-error No types for ace-code/src/ext/modelist.js
import { getModeForPath } from 'ace-code/src/ext/modelist.js';
import { Router } from 'express';
import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import { HttpStatusError } from '@prairielearn/error';
import { html, unsafeHtml } from '@prairielearn/html';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryScalar,
  queryScalars,
} from '@prairielearn/postgres';
import { hydrateHtml } from '@prairielearn/react/server';
import { IdSchema } from '@prairielearn/zod';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import {
  type JobSequenceResultsProps,
  getJobSequenceResultsProps,
} from '../../components/JobSequenceResults.types.js';
import type { NavPage } from '../../components/Navbar.types.js';
import { PageLayout } from '../../components/PageLayout.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../lib/base64-util.js';
import { ansiToHtml } from '../../lib/chalk.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { type FileEdit, FileEditSchema } from '../../lib/db-types.js';
import {
  computeFileContentHash,
  getFileMetadataForPath,
  isV3QuestionHtmlFile,
} from '../../lib/editorUtil.js';
import { type EditOutcome, FileModifyEditor, classifyEditOutcome } from '../../lib/editors.js';
import { deleteFile, getFile, uploadFile } from '../../lib/file-store.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getJobSequence } from '../../lib/server-jobs.js';
import { encodePath } from '../../lib/uri-util.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { FileEditor, type FileEditorData } from './FileEditor.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/*',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit'],
    unauthorizedUsers: 'passthrough',
  }),
  typedAsyncHandler<'course' | 'course-instance' | 'assessment', { navPage: NavPage }>(
    async (req, res) => {
      // Do not allow users to edit the exampleCourse
      if (res.locals.course.example_course) {
        res.status(403).send(
          InsufficientCoursePermissionsCardPage({
            resLocals: res.locals,
            navContext: {
              type: res.locals.navbarType,
              page: res.locals.navPage,
              subPage: 'file_edit',
            },
            courseOwners: [],
            pageTitle: 'File editor',
            requiredPermissions: 'Editor',
          }),
        );
        return;
      }

      if (!res.locals.authz_data.has_course_permission_edit) {
        // Access denied, but instead of sending them to an error page, we'll show
        // them an explanatory message and prompt them to get edit permissions.
        const courseOwners = await getCourseOwners(res.locals.course.id);
        res.status(403).send(
          InsufficientCoursePermissionsCardPage({
            resLocals: res.locals,
            navContext: {
              type: res.locals.navbarType,
              page: res.locals.navPage,
              subPage: 'file_edit',
            },
            courseOwners,
            pageTitle: 'File editor',
            requiredPermissions: 'Editor',
          }),
        );
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

      const contents = await fs.readFile(fullPath);
      if (await isBinaryFile(contents)) {
        throw new Error('Cannot edit binary file');
      }

      const stringContents = contents.toString('utf8');
      const encodedContents = b64EncodeUnicode(stringContents);
      const fileMetadata = await getFileMetadataForPath(res.locals.course.id, relPath);
      const lintHtmlMustache = await isV3QuestionHtmlFile(paths.coursePath, relPath);

      const editorData: FileEditorData = {
        fileName: path.basename(relPath),
        normalizedFileName: path.normalize(relPath),
        aceMode: lintHtmlMustache ? 'ace/mode/handlebars' : getModeForPath(relPath).mode,
        diskContents: encodedContents,
        diskHash: computeFileContentHash(stringContents),
        fileMetadata,
        lintHtmlMustache,
      };

      const draftEdit = await readDraftEdit({
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        course_id: res.locals.course.id,
        dir_name: path.dirname(relPath),
        file_name: editorData.fileName,
      });

      let draftEditResult: {
        outcome: EditOutcome | undefined;
        jobSequence: JobSequenceResultsProps | null;
      } | null = null;
      let versionChoice: { hasRemoteChanges: boolean } | null = null;
      if (draftEdit != null) {
        let outcome: EditOutcome | undefined;
        let jobSequence: JobSequenceResultsProps | null = null;
        if (draftEdit.fileEdit.job_sequence_id != null) {
          const fullJobSequence = await getJobSequence(
            draftEdit.fileEdit.job_sequence_id,
            res.locals.course.id,
          );

          if (fullJobSequence.status === 'Running') {
            // Because of the redirect, if the job sequence ends up failing to save,
            // then the corresponding draft will be lost (all drafts are soft-deleted
            // from the database on readDraftEdit).
            res.redirect(`${res.locals.urlPrefix}/jobSequence/${fullJobSequence.id}`);
            return;
          }

          // Note that if using git, we pull before we push, so a failed save
          // still syncs whatever was pulled from the remote repository (with
          // the edit's changes discarded). We ignore that case in the UI.
          outcome = classifyEditOutcome(fullJobSequence.jobs[0].data);
          jobSequence = getJobSequenceResultsProps({
            course: res.locals.course,
            jobSequence: fullJobSequence,
          });
        }
        draftEditResult = { outcome, jobSequence };

        const editWasSaved = outcome != null && outcome !== 'save_failed';
        if (!editWasSaved && draftEdit.hash !== editorData.diskHash) {
          // There is a recently saved draft that was not written to disk and that differs from what is on disk.
          versionChoice = {
            hasRemoteChanges: draftEdit.fileEdit.orig_hash !== editorData.diskHash,
          };
        }
      }

      const { __csrf_token } = res.locals;

      res.send(
        PageLayout({
          resLocals: res.locals,
          pageTitle: `Edit ${editorData.fileName}`,
          navContext: {
            type: res.locals.navbarType,
            page: res.locals.navPage,
            subPage: 'file_edit',
          },
          options: {
            fullWidth: true,
          },
          headContent: html`
            <meta
              name="ace-base-path"
              content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
            />
            ${editorData.lintHtmlMustache
              ? html`
                  <meta
                    name="htmlmustache-runtime-wasm"
                    content="${nodeModulesAssetPath('web-tree-sitter/web-tree-sitter.wasm')}"
                  />
                  <meta
                    name="htmlmustache-grammar-wasm"
                    content="${nodeModulesAssetPath(
                      '@prairielearn/tree-sitter-htmlmustache/tree-sitter-htmlmustache.wasm',
                    )}"
                  />
                  ${compiledScriptTag('instructorFileEditorHtmlMustacheLinterClient.ts')}
                `
              : ''}
          `,
          content: html`
            ${editorData.fileMetadata?.syncErrors
              ? html`
                  <div class="alert alert-danger" role="alert">
                    <h2 class="h5 alert-heading">Sync error</h2>
                    <p>
                      There were one or more errors in this file the last time you tried to sync.
                      This file will not be able to be synced until the errors are corrected. The
                      errors are listed below.
                    </p>
                    <pre
                      class="text-white rounded p-3 mb-0"
                      style="background-color: black;"
                    ><code>${unsafeHtml(
                      ansiToHtml(editorData.fileMetadata.syncErrors),
                    )}</code></pre>
                  </div>
                `
              : ''}
            ${editorData.fileMetadata?.syncWarnings
              ? html`
                  <div class="alert alert-warning" role="alert">
                    <h2 class="h5 alert-heading">Sync warning</h2>
                    <p>
                      There were one or more warnings in this file the last time you tried to sync.
                      These warnings do not prevent this file from being synced, but they should
                      still be fixed. The warnings are listed below.
                    </p>
                    <pre
                      class="text-white rounded p-3 mb-0"
                      style="background-color: black;"
                    ><code>${unsafeHtml(
                      ansiToHtml(editorData.fileMetadata.syncWarnings),
                    )}</code></pre>
                  </div>
                `
              : ''}
            <h1 class="visually-hidden">File editor</h1>

            ${hydrateHtml(
              <FileEditor
                editorData={editorData}
                draftContents={draftEdit?.contents}
                versionChoice={versionChoice}
                draftEditResult={draftEditResult}
                csrfToken={__csrf_token}
                fileEditorUseGit={config.fileEditorUseGit}
                branch={paths.branch.map((dir) => ({
                  name: dir.name,
                  path: dir.path,
                  href: dir.canView ? `${paths.urlPrefix}/file_view/${encodePath(dir.path)}` : null,
                }))}
              />,
            )}
          `,
        }),
      );
    },
  ),
);

router.post(
  '/*',
  typedAsyncHandler<'course' | 'course-instance' | 'assessment'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a course Editor)');
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
      const editID = await writeDraftEdit({
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
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
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

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
}): Promise<{ fileEdit: FileEdit; contents?: string; hash?: string } | null> {
  const fileEdit = await queryOptionalRow(
    sql.select_file_edit,
    { user_id, course_id, dir_name, file_name, max_age_sec: 24 * 60 * 60 },
    FileEditSchema,
  );

  // We are choosing to soft-delete all drafts *before* reading the
  // contents of whatever draft we found, because we don't want to get
  // in a situation where the user is trapped with an unreadable draft.
  // We accept the possibility that a draft will occasionally be lost.
  const deletedFileEdits = await queryScalars(
    sql.soft_delete_file_edit,
    { user_id, course_id, dir_name, file_name },
    IdSchema.nullable(),
  );
  for (const file_id of deletedFileEdits) {
    if (file_id != null && (fileEdit?.file_id == null || !idsEqual(file_id, fileEdit.file_id))) {
      await deleteFile(file_id, authn_user_id);
    }
  }
  if (fileEdit == null) return null;

  let contents: string | undefined;
  let hash: string | undefined;
  if (fileEdit.file_id != null) {
    const result = await getFile(fileEdit.file_id);
    const stringContents = result.contents.toString('utf8');
    contents = b64EncodeUnicode(stringContents);
    hash = computeFileContentHash(stringContents);

    await deleteFile(fileEdit.file_id, authn_user_id);
  }

  return { fileEdit, contents, hash };
}

async function updateJobSequenceId(edit_id: string, job_sequence_id: string) {
  await execute(sql.update_job_sequence_id, { id: edit_id, job_sequence_id });
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
  const deletedFileEdits = await queryScalars(
    sql.soft_delete_file_edit,
    { user_id, course_id, dir_name, file_name },
    IdSchema.nullable(),
  );
  for (const file_id of deletedFileEdits) {
    if (file_id != null) {
      await deleteFile(file_id, authn_user_id);
    }
  }

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

  const editID = await queryScalar(
    sql.insert_file_edit,
    { user_id, course_id, dir_name, file_name, orig_hash, file_id },
    IdSchema,
  );
  return editID;
}

export default router;

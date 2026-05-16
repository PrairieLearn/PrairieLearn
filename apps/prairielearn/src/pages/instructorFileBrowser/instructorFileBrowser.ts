import * as path from 'node:path';

import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import type { NavPage } from '../../components/Navbar.types.js';
import {
  deleteCourseFile,
  getSuccessfulActionRedirectUrl,
  renameCourseFile,
  uploadCourseFile,
} from '../../lib/course-file-actions.js';
import { getCourseOwners } from '../../lib/course.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { encodePath } from '../../lib/uri-util.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

const router = Router();

const FileActionSchema = z.object({
  __action: z.string(),
});

const RedirectUrlSchema = z.object({
  redirect_url: z.string().optional(),
});

const DeleteFileActionSchema = RedirectUrlSchema.extend({
  __action: z.literal('delete_file'),
  file_path: z.string(),
});

const RenameFileActionSchema = RedirectUrlSchema.extend({
  __action: z.literal('rename_file'),
  working_path: z.string(),
  old_file_name: z.string(),
  new_file_name: z.string().min(1),
  was_viewing_file: z.string().optional(),
});

const UploadFileActionSchema = z.union([
  RedirectUrlSchema.extend({
    __action: z.literal('upload_file'),
    file_path: z.string().min(1),
    working_path: z.string().optional(),
  }),
  RedirectUrlSchema.extend({
    __action: z.literal('upload_file'),
    file_path: z.undefined().optional(),
    working_path: z.string().min(1),
  }),
]);

router.get(
  '/*',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  typedAsyncHandler<'course' | 'course-instance' | 'assessment', { navPage: NavPage }>(
    async (req, res) => {
      if (!res.locals.authz_data.has_course_permission_view) {
        // Access denied, but instead of sending them to an error page, we'll show
        // them an explanatory message and prompt them to get view permissions.
        const courseOwners = await getCourseOwners(res.locals.course.id);
        res.status(403).send(
          InsufficientCoursePermissionsCardPage({
            resLocals: res.locals,
            courseOwners,
            navContext: {
              type: res.locals.navbarType,
              page: res.locals.navPage,
              subPage: 'file_view',
            },
            pageTitle: 'Files',
            requiredPermissions: 'Viewer',
          }),
        );
        return;
      }

      const paths = getPaths(req.params[0], res.locals);

      try {
        const fileBrowser = await createFileBrowser({
          paths,
          resLocals: res.locals,
          isReadOnly: false,
        });
        res.send(fileBrowser);
      } catch (err: any) {
        if (err.code === 'ENOENT' && paths.branch.length > 1) {
          res.redirect(`${req.baseUrl}/${encodePath(paths.branch.slice(-2)[0].path)}`);
          return;
        }

        throw err;
      }
    },
  ),
);

router.post(
  '/*',
  typedAsyncHandler<'course' | 'course-instance' | 'assessment', { navPage: NavPage }>(
    async (req, res) => {
      if (!res.locals.authz_data.has_course_permission_edit) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
      }

      const paths = getPaths(req.params[0], res.locals);
      const actionBody = FileActionSchema.parse(req.body);

      // NOTE: All actions are meant to do things to *files* and not to directories
      // (or anything else). However, nowhere do we check that it is actually being
      // applied to a file and not to a directory.

      if (actionBody.__action === 'delete_file') {
        const body = DeleteFileActionSchema.parse(req.body);
        const successfulActionRedirectUrl = getSuccessfulActionRedirectUrl({
          redirectUrl: body.redirect_url,
          urlPrefix: res.locals.urlPrefix,
        });
        const result = await deleteCourseFile({
          locals: res.locals,
          paths,
          filePath: body.file_path,
        });
        if (result.status === 'error') {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + result.jobSequenceId);
          return;
        }
        res.redirect(successfulActionRedirectUrl ?? req.originalUrl);
      } else if (actionBody.__action === 'rename_file') {
        const body = RenameFileActionSchema.parse(req.body);
        const successfulActionRedirectUrl = getSuccessfulActionRedirectUrl({
          redirectUrl: body.redirect_url,
          urlPrefix: res.locals.urlPrefix,
        });
        const result = await renameCourseFile({
          locals: res.locals,
          paths,
          workingPath: body.working_path,
          oldFileName: body.old_file_name,
          newFileName: body.new_file_name,
        });
        if (result.status === 'unchanged') {
          res.redirect(successfulActionRedirectUrl ?? req.originalUrl);
          return;
        }
        if (result.status === 'error') {
          res.redirect(`${res.locals.urlPrefix}/edit_error/${result.jobSequenceId}`);
          return;
        }
        if (successfulActionRedirectUrl != null) {
          res.redirect(successfulActionRedirectUrl);
        } else if (body.was_viewing_file) {
          res.redirect(
            `${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodePath(
              path.relative(res.locals.course.path, result.newPath),
            )}`,
          );
        } else {
          res.redirect(req.originalUrl);
        }
      } else if (actionBody.__action === 'upload_file') {
        const body = UploadFileActionSchema.parse(req.body);
        const successfulActionRedirectUrl = getSuccessfulActionRedirectUrl({
          redirectUrl: body.redirect_url,
          urlPrefix: res.locals.urlPrefix,
        });
        if (!req.file) throw new Error('No file uploaded');
        const result =
          body.file_path != null
            ? await uploadCourseFile({
                locals: res.locals,
                paths,
                file: req.file,
                destinationFilePath: body.file_path,
              })
            : await uploadCourseFile({
                locals: res.locals,
                paths,
                file: req.file,
                destinationDirectory: body.working_path,
              });
        if (result.status === 'error') {
          res.redirect(`${res.locals.urlPrefix}/edit_error/${result.jobSequenceId}`);
          return;
        }
        res.redirect(successfulActionRedirectUrl ?? req.originalUrl);
      } else {
        throw new Error(`unknown __action: ${actionBody.__action}`);
      }
    },
  ),
);

export default router;

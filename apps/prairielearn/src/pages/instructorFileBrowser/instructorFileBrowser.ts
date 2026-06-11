import * as path from 'node:path';

import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import type { NavPage } from '../../components/Navbar.types.js';
import { getCourseOwners } from '../../lib/course.js';
import {
  FileDeleteEditor,
  FileRenameEditor,
  FileUploadEditor,
  runEditorJob,
} from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { FILE_NAME_PATTERN } from '../../lib/short-name.js';
import { encodePath } from '../../lib/uri-util.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

const router = Router();

const BodySchema = z.discriminatedUnion('__action', [
  z.object({
    __action: z.literal('delete_file'),
    file_path: z.string(),
  }),
  z.object({
    __action: z.literal('rename_file'),
    working_path: z.string(),
    old_file_name: z.string(),
    new_file_name: z.string().min(1),
    was_viewing_file: z.string().optional(),
  }),
  // The upload form posts exactly one of `file_path` (replace an existing
  // file) or `working_path` (add a new file, uploaded under its original
  // name); the handler checks that one is present.
  z.object({
    __action: z.literal('upload_file'),
    file_path: z.string().min(1).optional(),
    working_path: z.string().min(1).optional(),
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
      const container = {
        rootPath: paths.rootPath,
        invalidRootPaths: paths.invalidRootPaths,
      };
      const body = BodySchema.parse(req.body);

      // NOTE: All actions are meant to do things to *files* and not to directories
      // (or anything else). However, nowhere do we check that it is actually being
      // applied to a file and not to a directory.

      switch (body.__action) {
        case 'delete_file': {
          const result = await runEditorJob(
            new FileDeleteEditor({
              locals: res.locals,
              container,
              deletePath: path.join(res.locals.course.path, body.file_path),
            }),
          );
          if (result.status === 'error') {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + result.jobSequenceId);
            return;
          }
          res.redirect(req.originalUrl);
          return;
        }
        case 'rename_file': {
          if (!FILE_NAME_PATTERN.test(body.new_file_name)) {
            throw new Error(
              `Invalid new file name (did not match required pattern): ${body.new_file_name}`,
            );
          }

          const oldPath = path.join(body.working_path, body.old_file_name);
          const newPath = path.join(body.working_path, body.new_file_name);
          if (oldPath === newPath) {
            res.redirect(req.originalUrl);
            return;
          }

          const result = await runEditorJob(
            new FileRenameEditor({
              locals: res.locals,
              container,
              oldPath,
              newPath,
            }),
          );
          if (result.status === 'error') {
            res.redirect(`${res.locals.urlPrefix}/edit_error/${result.jobSequenceId}`);
            return;
          }
          if (body.was_viewing_file) {
            res.redirect(
              `${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodePath(
                path.relative(res.locals.course.path, newPath),
              )}`,
            );
          } else {
            res.redirect(req.originalUrl);
          }
          return;
        }
        case 'upload_file': {
          if (!req.file) throw new Error('No file uploaded');
          const filePath =
            body.file_path != null
              ? path.join(res.locals.course.path, body.file_path)
              : body.working_path != null
                ? path.join(body.working_path, req.file.originalname)
                : null;
          if (filePath == null) {
            throw new Error('Either file_path or working_path must be provided');
          }

          const result = await runEditorJob(
            new FileUploadEditor({
              locals: res.locals,
              container,
              filePath,
              fileContents: req.file.buffer,
            }),
          );
          if (result.status === 'error') {
            res.redirect(`${res.locals.urlPrefix}/edit_error/${result.jobSequenceId}`);
            return;
          }
          res.redirect(req.originalUrl);
          return;
        }
      }
    },
  ),
);

export default router;

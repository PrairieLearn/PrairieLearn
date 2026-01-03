import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { getCourseOwners } from '../../lib/course.js';
import { FileDeleteEditor, FileRenameEditor, FileUploadEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

const router = Router();

router.get(
  '/*',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
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

    const paths = getPaths(req.params[0], res.locals, res.locals.navPage);

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
  }),
);

router.post(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
    }

    const paths = getPaths(req.params[0], res.locals, res.locals.navPage);
    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'delete_file') {
      let deletePath: string;
      try {
        deletePath = path.join(res.locals.course.path, req.body.file_path);
      } catch {
        throw new Error(`Invalid file path: ${req.body.file_path}`);
      }
      const editor = new FileDeleteEditor({
        locals: res.locals as any,
        container,
        deletePath,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'rename_file') {
      let oldPath: string;
      try {
        oldPath = path.join(req.body.working_path, req.body.old_file_name);
      } catch {
        throw new Error(
          `Invalid old file path: ${req.body.working_path} / ${req.body.old_file_name}`,
        );
      }
      if (!req.body.new_file_name) {
        throw new Error(`Invalid new file name (was falsy): ${req.body.new_file_name}`);
      }
      if (
        !/^(?:[-A-Za-z0-9_]+|\.\.)(?:\/(?:[-A-Za-z0-9_]+|\.\.))*(?:\.[-A-Za-z0-9_]+)?$/.test(
          req.body.new_file_name,
        )
      ) {
        throw new Error(
          `Invalid new file name (did not match required pattern): ${req.body.new_file_name}`,
        );
      }
      let newPath: string;
      try {
        newPath = path.join(req.body.working_path, req.body.new_file_name);
      } catch {
        throw new Error(
          `Invalid new file path: ${req.body.working_path} / ${req.body.new_file_name}`,
        );
      }

      if (oldPath === newPath) {
        // The new file name is the same as old file name; do nothing.
        res.redirect(req.originalUrl);
        return;
      }

      const editor = new FileRenameEditor({
        locals: res.locals as any,
        container,
        oldPath,
        newPath,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(`${res.locals.urlPrefix}/edit_error/${serverJob.jobSequenceId}`);
        return;
      }
      if (req.body.was_viewing_file) {
        res.redirect(
          `${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodePath(
            path.relative(res.locals.course.path, newPath),
          )}`,
        );
      } else {
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'upload_file') {
      if (!req.file) throw new Error('No file uploaded');

      let filePath: string;
      if (req.body.file_path) {
        try {
          filePath = path.join(res.locals.course.path, req.body.file_path);
        } catch {
          throw new Error(`Invalid file path: ${req.body.file_path}`);
        }
      } else {
        try {
          filePath = path.join(req.body.working_path, req.file.originalname);
        } catch {
          throw new Error(`Invalid file path: ${req.body.working_path} / ${req.file.originalname}`);
        }
      }
      const editor = new FileUploadEditor({
        locals: res.locals as any,
        container,
        filePath,
        fileContents: req.file.buffer,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(`${res.locals.urlPrefix}/edit_error/${serverJob.jobSequenceId}`);
        return;
      }
      res.redirect(req.originalUrl);
    } else {
      throw new Error(`unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

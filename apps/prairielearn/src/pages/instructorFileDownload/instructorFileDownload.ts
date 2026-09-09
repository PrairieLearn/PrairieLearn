import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getPaths } from '../../lib/instructorFiles.js';

const router = Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be course viewer)');
    }
    const paths = getPaths(req.params[0], res.locals);
    try {
      // Check resolved paths too so symlinks cannot bypass the file browser's boundaries.
      const [coursePath, workingPath] = await Promise.all([
        realpath(paths.coursePath),
        realpath(paths.workingPath),
      ]);
      const resolvedPaths = getPaths(path.relative(coursePath, workingPath), {
        ...res.locals,
        course: { ...res.locals.course, path: coursePath },
      });
      // The file browser hides .git directories, including nested repositories.
      if (
        [paths.workingPathRelativeToCourse, resolvedPaths.workingPathRelativeToCourse].some((p) =>
          p.split(path.sep).includes('.git'),
        )
      ) {
        throw new HttpStatusError(404, 'Not Found');
      }

      if (req.query.type) res.type(req.query.type.toString());
      if (req.query.attachment) res.attachment(req.query.attachment.toString());
      await new Promise<void>((resolve, reject) => {
        res.sendFile(
          path.relative(resolvedPaths.rootPath, resolvedPaths.workingPath) || '.',
          { root: resolvedPaths.rootPath, dotfiles: 'allow' },
          (err?: Error) => (err ? reject(err) : resolve()),
        );
      });
    } catch (err) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }

      // Let the error page render as HTML instead of being treated as a download.
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Range');
      if (
        err instanceof Error &&
        'code' in err &&
        (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR')
      ) {
        throw new HttpStatusError(404, 'Not Found');
      }
      throw err;
    }
  }),
);

export default router;

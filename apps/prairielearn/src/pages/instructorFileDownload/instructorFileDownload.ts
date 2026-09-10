import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';

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
      // Resolve the boundaries too: a context can itself live beneath a symlink.
      const [coursePath, rootPath, workingPath, invalidRootPaths] = await Promise.all([
        realpath(paths.coursePath),
        realpath(paths.rootPath),
        realpath(paths.workingPath),
        Promise.all(
          paths.invalidRootPaths.map(async (invalidRootPath) => {
            try {
              return await realpath(invalidRootPath);
            } catch (err) {
              if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
              throw err;
            }
          }),
        ),
      ]);
      if (
        !contains(coursePath, workingPath) ||
        !contains(rootPath, workingPath) ||
        invalidRootPaths.some((p) => p !== null && contains(p, workingPath)) ||
        // The file browser hides .git directories, including nested repositories.
        [paths.workingPathRelativeToCourse, path.relative(coursePath, workingPath)].some((p) =>
          p.split(path.sep).includes('.git'),
        )
      ) {
        throw new HttpStatusError(404, 'Not Found');
      }

      if (req.query.type) res.type(req.query.type.toString());
      if (req.query.attachment) res.attachment(req.query.attachment.toString());
      await new Promise<void>((resolve, reject) => {
        res.sendFile(
          path.relative(rootPath, workingPath) || '.',
          { root: rootPath, dotfiles: 'allow' },
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

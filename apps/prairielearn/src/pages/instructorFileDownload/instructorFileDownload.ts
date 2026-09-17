import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';

import { getPaths } from '../../lib/instructorFiles.js';

const router = Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be course viewer)');
    }
    const originalCacheControl = res.getHeader('Cache-Control');
    try {
      const paths = getPaths(req.params[0], res.locals);
      // Resolve the boundaries too: a context can itself live beneath a symlink.
      const [coursePath, rootPath, workingPath, invalidRootPaths] = await Promise.all([
        fs.realpath(paths.coursePath),
        fs.realpath(paths.rootPath),
        fs.realpath(paths.workingPath),
        Promise.all(
          paths.invalidRootPaths.map(async (invalidRootPath) => {
            try {
              return await fs.realpath(invalidRootPath);
            } catch (err) {
              if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
              throw err;
            }
          }),
        ),
      ]);

      function validatePath(filePath: string) {
        if (
          !contains(coursePath, filePath) ||
          !contains(rootPath, filePath) ||
          invalidRootPaths.some((p) => p !== null && contains(p, filePath)) ||
          // The file browser hides .git directories, including nested repositories.
          [paths.workingPathRelativeToCourse, path.relative(coursePath, filePath)].some((p) =>
            p.split(path.sep).includes('.git'),
          )
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }
      validatePath(workingPath);

      // Refuse a symlink substituted after realpath, and avoid blocking on special files.
      await using file = await fs.open(
        workingPath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const descriptorPath = `${process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd'}/${file.fd}`;
      if (process.platform === 'linux') {
        // O_NOFOLLOW only protects the final component; a parent could have been replaced too.
        validatePath(await fs.realpath(descriptorPath));
      }
      if (!(await file.stat()).isFile()) {
        throw new HttpStatusError(404, 'Not Found');
      }

      res.type(path.extname(workingPath) || 'application/octet-stream');
      if (req.query.type) res.type(req.query.type.toString());
      if (req.query.attachment) res.attachment(req.query.attachment.toString());
      await new Promise<void>((resolve, reject) => {
        // Serve the retained inode so a rename cannot redirect Express's stat/open operations.
        res.sendFile(descriptorPath, (err?: Error) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }

      // Remove file headers while preserving upstream cache restrictions for the error page.
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Range');
      res.removeHeader('Accept-Ranges');
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      if (originalCacheControl === undefined) {
        res.removeHeader('Cache-Control');
      } else {
        res.setHeader('Cache-Control', originalCacheControl);
      }
      if (
        err instanceof AugmentedError ||
        (err instanceof Error &&
          'code' in err &&
          (err.code === 'ENOENT' ||
            err.code === 'ENOTDIR' ||
            err.code === 'EISDIR' ||
            err.code === 'ELOOP'))
      ) {
        throw new HttpStatusError(404, 'Not Found');
      }
      throw err;
    }
  }),
);

export default router;

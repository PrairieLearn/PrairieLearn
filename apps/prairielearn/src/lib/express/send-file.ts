import * as path from 'node:path';

import type { Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

/**
 * A small wrapper around {@link Response#sendFile} that send a prettier 404
 * error if the file is not found.
 *
 * `filename`, when resolved relative to `directory`, must exist within `directory`.
 *
 * @param res The Express response object.
 * @param params
 * @param params.coursePath The root path to the course directory.
 * @param params.directory The directory within the course directory to serve files from.
 * @param params.filename The name of the file to serve, relative to `directory`.
 */
export function sendCourseFile(
  res: Response,
  { coursePath, directory, filename }: { coursePath: string; directory: string; filename: string },
) {
  const root = path.join(coursePath, directory);

  return new Promise<void>((resolve, reject) => {
    res.sendFile(filename, { root }, (err: any) => {
      if (err && 'code' in err && err.code === 'ENOENT') {
        const pathInCourse = path.normalize(path.join(directory, filename));
        reject(new HttpStatusError(404, `File not found: ${pathInCourse}`));
        return;
      } else if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

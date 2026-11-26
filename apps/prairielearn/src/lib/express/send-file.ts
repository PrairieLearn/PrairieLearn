import * as path from 'node:path';

import type { Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

const CLIENT_DISCONNECT_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE']);

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
      } else if (
        err &&
        'code' in err &&
        CLIENT_DISCONNECT_CODES.has(err.code) &&
        res.req.socket.destroyed
      ) {
        // The client went away mid-transfer; there's no one left to respond to.
        // The socket check ensures that we don't swallow file read errors that
        // happen to share these codes (e.g. from network-backed storage).
        resolve();
        return;
      } else if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

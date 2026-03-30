import { TRPCClientError } from '@trpc/client';

import type { AppErrorBase } from '../../trpc/app-errors.js';

/**
 * Extracts a typed app-level error from a tRPC error, narrowed to the
 * error type `T`. Returns `{ code: 'UNKNOWN' }` for errors without typed
 * metadata (network failures, permission errors, etc.).
 *
 * @example
 * import type { StudentLabelError } from '../../trpc/courseInstance/student-labels.js';
 *
 * const appError = getAppError<StudentLabelError['Upsert']>(mutation.error);
 * if (appError) {
 *   switch (appError.code) {
 *     case 'LABEL_NAME_TAKEN': ...
 *     case 'SYNC_JOB_FAILED': ...
 *     case 'UNKNOWN': ...
 *     default: assertNever(appError);
 *   }
 * }
 */
export function getAppError<T extends AppErrorBase = AppErrorBase>(
  error: unknown,
): (T & { message: string }) | { code: 'UNKNOWN'; message: string } | null {
  if (error instanceof TRPCClientError) {
    const appError = (error.data as { appError?: T } | undefined)?.appError;
    if (appError) return { ...appError, message: error.message };
    return { code: 'UNKNOWN', message: error.message };
  }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return null;
}

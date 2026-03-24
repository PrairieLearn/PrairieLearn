import { TRPCClientError } from '@trpc/client';

import type { AppErrorForPath, AppErrorPaths } from '../../trpc/courseInstance/app-errors.js';

/**
 * Extracts a typed app-level error from a tRPC error, narrowed to the
 * errors declared for a specific procedure. Returns `{ code: 'UNKNOWN' }`
 * for errors without typed metadata (network failures, permission errors, etc.).
 *
 * @example
 * const appError = getAppError<'studentLabels.upsert'>(mutation.error);
 * if (appError) {
 *   switch (appError.code) {
 *     case 'LABEL_NAME_TAKEN': ...
 *     case 'SYNC_JOB_FAILED': ...
 *     case 'UNKNOWN': ...
 *     default: assertNever(appError);
 *   }
 * }
 */
export function getAppError<Path extends AppErrorPaths>(
  error: unknown,
): (AppErrorForPath<Path> & { message: string }) | { code: 'UNKNOWN'; message: string } | null {
  if (error instanceof TRPCClientError) {
    const appError = (error.data as { appError?: AppErrorForPath<Path> } | undefined)?.appError;
    if (appError) return { ...appError, message: error.message };
    return { code: 'UNKNOWN', message: error.message };
  }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return null;
}

import { TRPCClientError } from '@trpc/client';

import type { AppErrorBase } from '../../trpc/app-errors.js';

/**
 * The resolved, non-null return type of {@link getAppError}. Use this to type
 * props on components that render error alerts, so they receive the
 * already-extracted error rather than a raw mutation error.
 *
 * @example
 * function SaveErrorAlert({ appError }: { appError: AppError<MyError['Save']> }) {
 *   switch (appError.code) {
 *     case 'CONFLICT': return <Alert>...</Alert>;
 *     case 'UNKNOWN': return <Alert>{appError.message}</Alert>;
 *   }
 * }
 */
export type AppError<T extends AppErrorBase = AppErrorBase> =
  | (T & { message: string })
  | { code: 'UNKNOWN'; message: string };

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
): AppError<T> | null {
  if (error instanceof TRPCClientError) {
    const appError = (error.data as { appError?: T } | undefined)?.appError;
    if (appError) return { ...appError, message: error.message };
    return { code: 'UNKNOWN', message: error.message };
  }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return null;
}

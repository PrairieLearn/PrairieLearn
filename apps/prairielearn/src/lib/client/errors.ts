import { TRPCClientError } from '@trpc/client';

/**
 * Resolves the error type for client-side use:
 * - Direct error type (has `code`): use as-is.
 * - Error map interface: union of all procedure error types.
 * - Empty error map: `never`, yielding only `'UNKNOWN'`.
 */
type ResolveAppError<T> = T extends { code: string }
  ? T
  : T[keyof T] extends { code: string }
    ? T[keyof T]
    : never;

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
export type AppError<T> =
  | (ResolveAppError<T> & { message: string })
  | { code: 'UNKNOWN'; message: string };

/**
 * Extracts a typed app-level error from a tRPC error, narrowed to the
 * error type `T`. Returns `{ code: 'UNKNOWN' }` for errors without typed
 * metadata (plain `TRPCError` throws, network failures, permission errors, etc.).
 *
 * Pass the subrouter's error interface (e.g. `AdminCourseError`) for procedures
 * with no typed errors, or a specific procedure error type
 * (e.g. `StudentLabelError['Upsert']`) for typed errors.
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
export function getAppError<T>(error: unknown): AppError<T> | null {
  if (error instanceof TRPCClientError) {
    const appError = (error.data as { appError?: ResolveAppError<T> } | undefined)?.appError;
    if (appError) return { ...appError, message: error.message };
    return { code: 'UNKNOWN', message: error.message };
  }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return null;
}

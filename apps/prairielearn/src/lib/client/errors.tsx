import { TRPCClientError } from '@trpc/client';
import type { ReactNode } from 'react';
import { Alert, type AlertProps } from 'react-bootstrap';

/**
 * Resolves the error type for client-side use:
 * - Direct error type (has `code`): use as-is.
 * - Error map interface: union of all procedure entries that carry a `code`.
 * - All-`never` (or empty) error map: `never` — so `AppError<T>` collapses to
 *   just the `UNKNOWN` branch.
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
 */
export type AppError<T> =
  | (ResolveAppError<T> & { message: string })
  | { code: 'UNKNOWN'; message: string };

/**
 * Extracts a typed app-level error from a tRPC error, narrowed to the
 * error type `T`. Returns `{ code: 'UNKNOWN' }` for errors without typed
 * metadata (plain `TRPCError` throws, network failures, permission errors, etc.).
 *
 * Type parameter usage:
 * - **Per-procedure (preferred)**: `getAppError<XError['Procedure']>(err)` —
 *   keeps the binding between call site and procedure explicit. If the
 *   procedure has no typed errors, declare it as `Procedure: never` in the
 *   error map; this resolves to `AppError<never>` = just `'UNKNOWN'`.
 * - **Whole subrouter**: `getAppError<XError>(err)` — union across all
 *   procedures. Use when one component handles errors from several procedures.
 *
 * To render the result, prefer {@link AppErrorAlert} or {@link renderAppError},
 * which require an exhaustive renderer for each variant.
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

/**
 * Per-variant renderer map for an {@link AppError}-shaped union. TypeScript
 * requires one entry per `code`, so missing a variant — or having the server
 * add a new one — is a compile error.
 */
type AppErrorRenderers<E extends { code: string }> = {
  [K in E['code']]: (error: Extract<E, { code: K }>) => ReactNode;
};

/**
 * Standard renderer for the `SYNC_JOB_FAILED` app error: shows the message
 * followed by a link to the job logs. Use as the `SYNC_JOB_FAILED` entry in
 * an {@link AppErrorAlert} or {@link renderAppError} renderer map.
 */
export function syncJobFailedRenderer(urlPrefix: string) {
  return ({ message, jobSequenceId }: { message: string; jobSequenceId: string }) => (
    <>
      {message} <a href={`${urlPrefix}/jobSequence/${jobSequenceId}`}>View job logs</a>
    </>
  );
}

/**
 * Renders an {@link AppError} via an exhaustive per-variant renderer map.
 * Use this when you need a `ReactNode` to pass into another component
 * (e.g. `StickySaveBar`'s `alert.message`). For rendering directly inside a
 * Bootstrap alert, prefer {@link AppErrorAlert}.
 */
export function renderAppError<E extends { code: string }>(
  error: E,
  renderers: AppErrorRenderers<E>,
): ReactNode {
  const render = renderers[error.code as E['code']] as (e: E) => ReactNode;
  return render(error);
}

/**
 * Renders an {@link AppError} inside a Bootstrap `<Alert>` via an exhaustive
 * per-variant `render` map. Returns `null` when `error` is null/undefined.
 *
 * @example
 * <AppErrorAlert
 *   error={copyError}
 *   onDismiss={() => copyMutation.reset()}
 *   render={{
 *     SYNC_JOB_FAILED: ({ message, jobSequenceId }) => (
 *       <>
 *         {message}{' '}
 *         <a href={`${urlPrefix}/jobSequence/${jobSequenceId}`}>View job logs</a>
 *       </>
 *     ),
 *     UNKNOWN: ({ message }) => message,
 *   }}
 * />
 */
export function AppErrorAlert<E extends { code: string }>({
  error,
  onDismiss,
  variant = 'danger',
  className,
  render,
}: {
  error: E | null | undefined;
  onDismiss?: () => void;
  variant?: AlertProps['variant'];
  className?: string;
  render: AppErrorRenderers<E>;
}) {
  if (!error) return null;
  return (
    <Alert variant={variant} dismissible={!!onDismiss} className={className} onClose={onDismiss}>
      {renderAppError(error, render)}
    </Alert>
  );
}

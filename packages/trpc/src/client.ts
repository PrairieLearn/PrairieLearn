import { TRPCClientError } from '@trpc/client';
import type { ReactNode } from 'react';

/**
 * Resolves client error types to the variants a component may receive.
 *
 * Unlike the server's whole-map resolution, a whole map becomes the union of its procedure errors
 * because a component may handle failures from several procedures.
 */
type ResolveClientAppError<T> = T extends { code: string }
  ? T
  : T[keyof T] extends { code: string }
    ? T[keyof T]
    : never;

/** The resolved, non-null return type of {@link getAppError}. */
export type AppError<T> =
  | (ResolveClientAppError<T> & { message: string })
  | { code: 'UNKNOWN'; message: string };

/** An exhaustive renderer map for every statically known application-error code. */
export type AppErrorRenderers<E extends { code: string; message: string }> = {
  [K in E['code']]: (error: Extract<E, { code: K }>) => ReactNode;
};

/**
 * Extracts typed application metadata from a tRPC client error.
 *
 * Pass a procedure entry for a single operation. Pass a whole error map only when one component
 * handles failures from several procedures; in that case the result is their union.
 */
export function getAppError<T>(error: unknown): AppError<T> | null {
  if (error instanceof TRPCClientError) {
    const appError = (error.data as { appError?: ResolveClientAppError<T> } | undefined)?.appError;
    if (appError) return { ...appError, message: error.message };
    return { code: 'UNKNOWN', message: error.message };
  }
  if (error instanceof Error) return { code: 'UNKNOWN', message: error.message };
  return null;
}

/**
 * Renders an application error with an exhaustive map for statically known variants.
 *
 * If a newer server sends a code unknown to a stale browser bundle, the server message is rendered
 * instead of attempting to call a missing renderer.
 */
export function renderAppError<E extends { code: string; message: string }>(
  error: E,
  renderers: AppErrorRenderers<E>,
): ReactNode {
  const render = renderers[error.code as E['code']] as ((error: E) => ReactNode) | undefined;
  return render ? render(error) : error.message;
}

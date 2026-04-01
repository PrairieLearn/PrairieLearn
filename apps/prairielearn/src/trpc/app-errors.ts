import { type TRPCDefaultErrorShape, TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';

/**
 * Typed application-level errors for tRPC procedures.
 *
 * tRPC doesn't natively support typed errors (https://github.com/trpc/trpc/issues/3438).
 * This module works around that by attaching discriminated error metadata via
 * the error formatter, so the client can narrow on `appError.code` per procedure.
 *
 * Error types are co-located with the subrouter procedures that throw them
 * as interfaces keyed by procedure name. This file provides the shared
 * infrastructure: `AppError`, `throwAppError`, and `appErrorFormatter`.
 */

interface AppErrorBase {
  code: string;
  message: string;
}

type Values<T> = T[keyof T];

/**
 * Returns 'fail' if error type `E` is NOT a member of `Map[K]` for some key `K`.
 */
type ErrorInvalidForAny<E, Map> = {
  [K in keyof Map]: E extends Map[K] ? never : 'fail';
}[keyof Map];

/**
 * Computes errors common to ALL procedure error types in an error map.
 * Keeps only error variants that are assignable to every procedure's union.
 */
type SharedProcedureErrors<Map> =
  Values<Map> extends infer E
    ? E extends unknown
      ? ErrorInvalidForAny<E, Map> extends never
        ? E
        : never
      : never
    : never;

/**
 * Resolves the accepted error type:
 * - Direct error type (has `code`): use as-is.
 * - Error map interface (keyed by procedure): compute shared errors.
 */
type ResolveError<T> = T extends { code: string } ? T : SharedProcedureErrors<T>;

interface AppErrorShape extends TRPCDefaultErrorShape {
  data: TRPCDefaultErrorShape['data'] & { appError?: AppErrorBase };
}

/**
 * Error formatter that attaches typed `AppError` metadata to tRPC responses.
 * Pass this to `initTRPC.create({ errorFormatter: appErrorFormatter })` in
 * each scope's `init.ts`.
 */
export const appErrorFormatter = ({
  shape,
  error,
}: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}): AppErrorShape => ({
  ...shape,
  data: {
    ...shape.data,
    ...(error instanceof AppError ? { appError: error.meta } : {}),
  },
});

/**
 * A `TRPCError` subclass that carries typed, discriminated metadata.
 * The error formatter detects `AppError` instances and attaches `.meta`
 * to the serialized response so the client can narrow on it.
 */
class AppError extends TRPCError {
  constructor(
    public readonly meta: AppErrorBase,
    trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
  ) {
    super({ code: trpcCode, message: meta.message });
  }
}

/**
 * Throws an `AppError` with typed metadata.
 *
 * Accepts either a direct error type or an error map interface.
 * When given an error map, only errors shared across ALL procedures are accepted.
 *
 * @example
 * export interface WidgetError {
 *   Update:
 *     | { code: 'NAME_TAKEN'; name: string }
 *     | { code: 'SYNC_FAILED'; id: string };
 *   Delete: { code: 'SYNC_FAILED'; id: string };
 * }
 *
 * // Procedure-specific: all errors for Update
 * throwAppError<WidgetError['Update']>({ code: 'NAME_TAKEN', message: 'A widget with this name already exists', name });
 *
 * // Error map: only errors shared across ALL procedures (SYNC_FAILED)
 * throwAppError<WidgetError>({ code: 'SYNC_FAILED', message: 'Failed to sync widget', id });
 */
export function throwAppError<T>(
  meta: ResolveError<T> & { message: string },
  trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
): never {
  throw new AppError(meta as unknown as AppErrorBase, trpcCode);
}

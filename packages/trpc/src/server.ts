import { type TRPCDefaultErrorShape, TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

import { formatTrpcErrorResponse } from './express.js';

/** Metadata serialized for a typed application-level error. */
export interface AppErrorBase {
  code: string;
  message: string;
  [key: string]: unknown;
}

type Values<T> = T[keyof T];

/** Returns `fail` when `E` is not a member of at least one entry in `Map`. */
type ErrorInvalidForAny<E, Map> = {
  [K in keyof Map]: E extends Map[K] ? never : 'fail';
}[keyof Map];

/** Computes the error variants shared by every procedure in an error map. */
type SharedProcedureErrors<Map> =
  Values<Map> extends infer E
    ? E extends unknown
      ? ErrorInvalidForAny<E, Map> extends never
        ? E
        : never
      : never
    : never;

type ResolveAppErrorForThrow<T> = T extends { code: string } ? T : SharedProcedureErrors<T>;

/** The metadata accepted by {@link throwAppError}. */
export type AppErrorInput<T> = ResolveAppErrorForThrow<T> & { message: string };

/** The tRPC error shape produced by {@link appErrorFormatter}. */
export interface AppErrorShape extends TRPCDefaultErrorShape {
  data: TRPCDefaultErrorShape['data'] & { appError?: AppErrorBase };
}

class AppError extends TRPCError {
  constructor(
    public readonly meta: AppErrorBase,
    trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
  ) {
    super({ code: trpcCode, message: meta.message });
  }
}

/** Preserve HTTP errors wrapped by tRPC, while respecting explicit tRPC error codes. */
export function getTrpcErrorStatus(error: TRPCError): number {
  const cause = error.cause;
  if (
    error.code === 'INTERNAL_SERVER_ERROR' &&
    cause &&
    'status' in cause &&
    typeof cause.status === 'number' &&
    Number.isInteger(cause.status) &&
    cause.status >= 400 &&
    cause.status <= 599
  ) {
    return cause.status;
  }
  return getHTTPStatusCodeFromError(error);
}

/**
 * Attaches typed application-error metadata to a tRPC error response.
 *
 * Pass this formatter to each authorization scope's context-bound `initTRPC.create()` call.
 */
export const appErrorFormatter = ({
  shape,
  error,
}: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}): AppErrorShape => {
  const status = getTrpcErrorStatus(error);
  const formatted =
    status === shape.data.httpStatus
      ? shape
      : formatTrpcErrorResponse({ status, message: error.message, stack: shape.data.stack }).error
          .json;
  return {
    ...shape,
    ...formatted,
    data: {
      ...shape.data,
      ...formatted.data,
      ...(error instanceof AppError ? { appError: error.meta } : {}),
    },
  };
};

/**
 * Throws a typed application error.
 *
 * A direct procedure error type accepts all of that procedure's variants. A whole procedure error
 * map accepts only variants shared by every procedure; this is intentionally narrower than the
 * client-side whole-map resolution used by `getAppError`.
 */
export function throwAppError<T>(
  meta: AppErrorInput<T>,
  trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
): never {
  throw new AppError(meta as unknown as AppErrorBase, trpcCode);
}

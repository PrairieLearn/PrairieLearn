import { type TRPCDefaultErrorShape, TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { sampleSize } from 'es-toolkit';

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
}): AppErrorShape => ({
  ...shape,
  data: {
    ...shape.data,
    ...(error instanceof AppError ? { appError: error.meta } : {}),
  },
});

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

const ERROR_ID_CHARACTERS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** Generates the correlation ID used by normal Express and tRPC adapter errors. */
export function generateErrorId(): string {
  return sampleSize(ERROR_ID_CHARACTERS, 12).join('');
}

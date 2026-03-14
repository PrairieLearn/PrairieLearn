import { TRPCError } from '@trpc/server';
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server/unstable-core-do-not-import';

import type { StudentLabelErrors } from './student-labels.js';

/**
 * Typed application-level errors for tRPC procedures.
 *
 * tRPC doesn't natively support typed errors (https://github.com/trpc/trpc/issues/3438).
 * This module works around that by attaching discriminated error metadata via
 * the error formatter, so the client can narrow on `appError.code` per procedure.
 */
export interface CourseInstanceErrorMap {
  studentLabels: StudentLabelErrors;
}

type Values<T> = T[keyof T];
type AllProcedureErrors<T> = Values<{ [K in keyof T]: Values<T[K]> }>;

/** Union of every app-level error across all course instance procedures. */
type AppErrorMeta = AllProcedureErrors<CourseInstanceErrorMap>;

/** Dot-path keys like `'studentLabels.upsert'` for every procedure with declared errors. */
export type AppErrorPaths = {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  [R in keyof CourseInstanceErrorMap & string]: {
    [P in keyof CourseInstanceErrorMap[R] & string]: `${R}.${P}`;
  }[keyof CourseInstanceErrorMap[R] & string];
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
}[keyof CourseInstanceErrorMap & string];

/** Resolves a dot-path to the error union declared for that procedure. */
export type AppErrorForPath<Path extends string> = Path extends `${infer R}.${infer P}`
  ? R extends keyof CourseInstanceErrorMap
    ? P extends keyof CourseInstanceErrorMap[R]
      ? CourseInstanceErrorMap[R][P]
      : never
    : never
  : never;

/**
 * A `TRPCError` subclass that carries typed, discriminated metadata.
 * The error formatter detects `AppError` instances and attaches `.meta`
 * to the serialized response so the client can narrow on it.
 */
export class AppError extends TRPCError {
  constructor(
    public readonly meta: AppErrorMeta,
    trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
  ) {
    super({ code: trpcCode, message: meta.code });
  }
}

/**
 * Throws an `AppError` constrained to the errors declared in an error map.
 *
 * @example
 * throwAppError<StudentLabelErrors>({ code: 'LABEL_NAME_TAKEN', name });
 * throwAppError<StudentLabelErrors>({ code: 'SYNC_JOB_FAILED', jobSequenceId }, 'INTERNAL_SERVER_ERROR');
 */
export function throwAppError<E extends { [K in keyof E]: AppErrorMeta }>(
  meta: E[keyof E],
  trpcCode: TRPC_ERROR_CODE_KEY = 'BAD_REQUEST',
): never {
  throw new AppError(meta, trpcCode);
}

import { Temporal } from '@js-temporal/polyfill';
import z from 'zod';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/no-unused-vars
declare abstract class Class {
  constructor(..._: unknown[]);
}

/**
 * A Zod validator for a Temporal class which also parses string inputs.
 */
export type ZodTemporal<
  TClass extends typeof Class & {
    from: (arg: string) => InstanceType<TClass>;
  },
> = z.ZodType<InstanceType<TClass>, z.ZodTypeDef, InstanceType<TClass> | string>;

/**
 * Creates Zod validators for a Temporal class.
 *
 * @param cls - The Temporal class to validate.
 * @returns Two Zod validators for the Temporal class: `coerce` for coercing strings to the Temporal class, and `instance` for validating that the value is an instance of the Temporal class.
 */
export function temporalValidators<
  TClass extends typeof Class & {
    from: (arg: string) => InstanceType<TClass>;
  },
>(
  cls: TClass,
): {
  coerce: ZodTemporal<TClass>;
  instance: z.ZodType<InstanceType<TClass>, z.ZodTypeDef, InstanceType<TClass>>;
} {
  const instance = z.instanceof(cls);
  return {
    instance,
    coerce: z.union([
      instance,
      z.string().transform((value, ctx) => {
        try {
          return cls.from(value);
        } catch (error: any) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid ${cls.name}: ${error.message ?? 'unknown error'}`,
          });
          return z.NEVER;
        }
      }),
    ]),
  };
}

export const ZonedDateTime: typeof Temporal.ZonedDateTime = Temporal.ZonedDateTime;
export const Instant: typeof Temporal.Instant = Temporal.Instant;

const zonedDateTimeValidators = temporalValidators(ZonedDateTime);
const instantValidators = temporalValidators(Instant);

/**
 * Validates or coerces a string or Date to a {@link Temporal.Instant}.
 */
export const zInstant: z.ZodType<Temporal.Instant, z.ZodTypeDef, Temporal.Instant | Date | string> =
  z.union([
    instantValidators.coerce,
    z.date().transform((value) => Temporal.Instant.fromEpochMilliseconds(value.getTime())),
  ]);

/**
 * Validates that the value is an instance of {@link Temporal.Instant}.
 */
export const zInstantInstance: z.ZodType<Temporal.Instant> = instantValidators.instance;

/**
 * Validates or coerces a string to a {@link Temporal.ZonedDateTime}.
 */
export const zZonedDateTime: ZodTemporal<typeof ZonedDateTime> = zonedDateTimeValidators.coerce;

/**
 * Validates that the value is an instance of {@link Temporal.ZonedDateTime}.
 */
export const zZonedDateTimeInstance: z.ZodType<
  Temporal.ZonedDateTime,
  z.ZodTypeDef,
  Temporal.ZonedDateTime
> = zonedDateTimeValidators.instance;

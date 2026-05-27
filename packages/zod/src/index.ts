import parsePostgresInterval from 'postgres-interval';
import { type ZodType, z } from 'zod';

const INTERVAL_MS_PER_SECOND = 1000;
const INTERVAL_MS_PER_MINUTE = 60 * INTERVAL_MS_PER_SECOND;
const INTERVAL_MS_PER_HOUR = 60 * INTERVAL_MS_PER_MINUTE;
const INTERVAL_MS_PER_DAY = 24 * INTERVAL_MS_PER_HOUR;
const INTERVAL_MS_PER_MONTH = 30 * INTERVAL_MS_PER_DAY;
const INTERVAL_MS_PER_YEAR = 365.25 * INTERVAL_MS_PER_DAY;

/**
 * A schema type on which `.optional()` cannot be called.
 */
type NoOptional<S extends ZodType> = S & {
  optional: never;
};

/**
 * Wrap any Zod schema so that calling `.optional()` is illegal in TypeScript.
 * Runtime behavior is untouched.
 */
function required<S extends ZodType>(schema: S): NoOptional<S> {
  return schema as unknown as NoOptional<S>;
}

/**
 * A Zod schema for a boolean from a single checkbox input in the body
 * parameters from a form. This will return a boolean with a value of `true` if
 * the checkbox is checked (the input is present) and `false` if it is not
 * checked.
 *
 * Note that this will not behave sensibly if `.optional()` is called on the schema,
 * as it will turn a missing checkbox into `undefined` instead of `false`. We use
 * some TypeScript magic to ensure that `.optional()` cannot be called on this schema.
 */
export const BooleanFromCheckboxSchema = required(
  z
    .string()
    .optional()
    .transform((s) => !!s),
);

/**
 * A Zod schema for a PostgreSQL ID.
 */
export const IdSchema = z.coerce
  .string()
  .refine((val) => /^\d+$/.test(val), { message: 'ID is not a non-negative integer' });

/**
 * A Zod schema for the objects produced by the `postgres-interval` library.
 */
const PostgresIntervalSchema = z.object({
  years: z.number().default(0),
  months: z.number().default(0),
  days: z.number().default(0),
  hours: z.number().default(0),
  minutes: z.number().default(0),
  seconds: z.number().default(0),
  milliseconds: z.number().default(0),
});

/**
 * A Zod schema for a PostgreSQL interval.
 */
export const IntervalSchema = z
  .union([z.string(), PostgresIntervalSchema, z.number()])
  .transform((interval) => {
    if (typeof interval === 'string') {
      interval = parsePostgresInterval(interval);
    }

    if (typeof interval === 'number') {
      return interval;
    }

    // Matches Postgres's behavior for `EXTRACT(epoch from '...'::interval) * 1000`.
    // 1 year = 365.25 days, 1 month = 30 days.
    return (
      interval.years * INTERVAL_MS_PER_YEAR +
      interval.months * INTERVAL_MS_PER_MONTH +
      interval.days * INTERVAL_MS_PER_DAY +
      interval.hours * INTERVAL_MS_PER_HOUR +
      interval.minutes * INTERVAL_MS_PER_MINUTE +
      interval.seconds * INTERVAL_MS_PER_SECOND +
      interval.milliseconds
    );
  });

/**
 * A Zod schema for a date string in ISO format.
 *
 * Accepts either a string or a Date object. If a string is passed, it is
 * validated and parsed as an ISO date string.
 *
 * Useful for parsing dates from JSON, which are always strings.
 */
export const DateFromISOString = z
  .union([z.string(), z.date()])
  .refine(
    (s) => {
      const date = new Date(s);
      return !Number.isNaN(date.getTime());
    },
    {
      message: 'must be a valid ISO date string',
    },
  )
  .transform((s) => new Date(s));

/**
 * A Zod schema for a datetime-local input value.
 */
export const DatetimeLocalStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, {
    message: 'must be a valid datetime-local string (YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS)',
  })
  // Append `:00` seconds if omitted (Chrome bug workaround).
  // https://stackoverflow.com/questions/19504018/show-seconds-on-input-type-date-local-in-chrome
  // https://issues.chromium.org/issues/41159420
  .transform((s) => (s.length === 16 ? `${s}:00` : s))
  .transform((s, ctx) => {
    const date = new Date(s);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'must be a valid date' });
      return z.NEVER;
    }
    return s;
  });

/**
 * A Zod schema that coerces a non-empty string to an integer or an empty string to null.
 */
export const IntegerFromStringOrEmptySchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.union([z.null(), z.coerce.number().int()]),
);

/**
 * A Zod schema for an array of string values from either a string or an array of
 * strings.
 */
export const ArrayFromStringOrArraySchema = z
  .union([z.string(), z.array(z.string())])
  .transform((s) => {
    if (s === null) {
      return [];
    } else if (Array.isArray(s)) {
      return s;
    } else {
      return [s];
    }
  });

/**
 * A Zod schema for an array of string values from a set of checkboxes in the
 * body parameters from a form.
 */
export const ArrayFromCheckboxSchema = z
  .union([z.undefined(), z.string(), z.array(z.string())])
  .transform((s) => {
    if (s == null) {
      return [];
    } else if (Array.isArray(s)) {
      return s;
    } else {
      return [s];
    }
  });

/**
 * Creates a Zod schema that parses a string of UIDs separated by whitespace,
 * commas, or semicolons into an array of unique, trimmed UIDs.
 */
export function UniqueUidsFromStringSchema(limit = 1000) {
  const emailSchema = z.email();

  return z.string().transform((uidsString, ctx) => {
    const uids = new Set(
      uidsString
        .split(/[\s,;]+/)
        .map((uid) => uid.trim())
        .filter(Boolean),
    );

    if (uids.size > limit) {
      ctx.addIssue({
        code: 'too_big',
        maximum: limit,
        origin: 'set',
        inclusive: true,
        message: `Cannot provide more than ${limit} UIDs at a time`,
      });
      return z.NEVER;
    }

    if (uids.size === 0) {
      ctx.addIssue({ code: 'custom', message: 'At least one UID is required' });
      return z.NEVER;
    }

    for (const uid of uids) {
      const result = emailSchema.safeParse(uid);
      if (!result.success) {
        ctx.addIssue({ code: 'custom', message: `Invalid UID format: ${uid}` });
      }
    }

    return Array.from(uids);
  });
}

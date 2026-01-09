import parsePostgresInterval from 'postgres-interval';
import { type ZodTypeAny, z } from 'zod';

const INTERVAL_MS_PER_SECOND = 1000;
const INTERVAL_MS_PER_MINUTE = 60 * INTERVAL_MS_PER_SECOND;
const INTERVAL_MS_PER_HOUR = 60 * INTERVAL_MS_PER_MINUTE;
const INTERVAL_MS_PER_DAY = 24 * INTERVAL_MS_PER_HOUR;
const INTERVAL_MS_PER_MONTH = 30 * INTERVAL_MS_PER_DAY;
const INTERVAL_MS_PER_YEAR = 365.25 * INTERVAL_MS_PER_DAY;

/**
 * A schema type on which `.optional()` cannot be called.
 */
type NoOptional<S extends ZodTypeAny> = S & {
  optional: never;
};

/**
 * Wrap any Zod schema so that calling `.optional()` is illegal in TypeScript.
 * Runtime behavior is untouched.
 */
function required<S extends ZodTypeAny>(schema: S): NoOptional<S> {
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
 *
 * We store IDs as BIGINT in PostgreSQL, which are passed to JavaScript as
 * either strings (if the ID is fetched directly) or numbers (if passed via
 * `to_jsonb()`). This schema coerces the ID to a string to ensure consistent
 * handling.
 *
 * The `refine` step is important to ensure that the thing we've coerced to a
 * string is actually a number. If it's not, we want to fail quickly.
 */
export const IdSchema = z
  .string({ coerce: true })
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
 *
 * This handles three representations of an interval:
 *
 * - A string like "1 year 2 days", which is how intervals will be represented
 *   if they go through `to_jsonb` in a query.
 * - A {@link PostgresIntervalSchema} object, which is what we'll get if a
 *   query directly returns an interval column. The interval will already be
 *   parsed by `postgres-interval` by way of `pg-types`.
 * - A number of milliseconds, which is possible if you want to feed the output of IntervalSchema.parse()
 *   back through this schema.
 *
 * In all cases, we convert the interval to a number of milliseconds.
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

    // This calculation matches Postgres's behavior when computing the number of
    // milliseconds in an interval with `EXTRACT(epoch from '...'::interval) * 1000`.
    // The noteworthy parts of this conversion are that 1 year = 365.25 days and
    // 1 month = 30 days.
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
 *
 * Accepts a string in the format "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
 * as produced by `<input type="datetime-local">` elements.
 *
 * Validates the format and returns it as a string.
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be a valid date',
      });
      return z.NEVER;
    }
    return s;
  });

/**
 * A Zod schema that coerces a non-empty string to an integer or an empty string to null.
 * This is useful for form number inputs that are not required but we do not want to
 * use an empty string to compute values.
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
 * body parameters from a form. The form should have checkboxes with the same
 * name attribute, and the value of the checkboxes should be the string values
 * to include in the array. If no checkboxes are checked, this will return an
 * empty array. This behavior relies on the ExpressJS `bodyParser.urlencoded()`
 * middleware that parses the submitted data into a string or array.
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
 *
 * @param limit - The maximum number of UIDs allowed. Defaults to 1000.
 * @returns A Zod schema that parses and validates the UID string.
 */
export function UniqueUidsFromStringSchema(limit = 1000) {
  const emailSchema = z.string().email();

  return z.string().transform((uidsString, ctx) => {
    const uids = new Set(
      uidsString
        .split(/[\s,;]+/)
        .map((uid) => uid.trim())
        .filter(Boolean),
    );

    if (uids.size > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: limit,
        type: 'set',
        inclusive: true,
        message: `Cannot provide more than ${limit} UIDs at a time`,
      });
      return z.NEVER;
    }

    if (uids.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one UID is required',
      });
      return z.NEVER;
    }

    for (const uid of uids) {
      const result = emailSchema.safeParse(uid);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid UID format: ${uid}`,
        });
      }
    }

    return Array.from(uids);
  });
}

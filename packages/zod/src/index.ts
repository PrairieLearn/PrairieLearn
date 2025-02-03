import parsePostgresInterval from 'postgres-interval';
import { z } from 'zod';

const INTERVAL_MS_PER_SECOND = 1000;
const INTERVAL_MS_PER_MINUTE = 60 * INTERVAL_MS_PER_SECOND;
const INTERVAL_MS_PER_HOUR = 60 * INTERVAL_MS_PER_MINUTE;
const INTERVAL_MS_PER_DAY = 24 * INTERVAL_MS_PER_HOUR;
const INTERVAL_MS_PER_MONTH = 30 * INTERVAL_MS_PER_DAY;
const INTERVAL_MS_PER_YEAR = 365.25 * INTERVAL_MS_PER_DAY;

/**
 * A Zod schema for a boolean from a single checkbox input in the body
 * parameters from a form. This will return a boolean with a value of `true` if
 * the checkbox is checked (the input is present) and `false` if it is not
 * checked.
 */
export const BooleanFromCheckboxSchema = z
  .string()
  .optional()
  .transform((s) => !!s);

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
 * This handles two representations of an interval:
 *
 * - A string like "1 year 2 days", which is how intervals will be represented
 *   if they go through `to_jsonb` in a query.
 * - A {@link PostgresIntervalSchema} object, which is what we'll get if a
 *   query directly returns an interval column. The interval will already be
 *   parsed by `postgres-interval` by way of `pg-types`.
 *
 * In either case, we convert the interval to a number of milliseconds.
 */
export const IntervalSchema = z
  .union([z.string(), PostgresIntervalSchema])
  .transform((interval) => {
    if (typeof interval === 'string') {
      interval = parsePostgresInterval(interval);
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

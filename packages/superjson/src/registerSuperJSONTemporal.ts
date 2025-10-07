import { Temporal } from '@js-temporal/polyfill';
import type { SuperJSON } from 'superjson';

export const registerSuperJSONTemporal = (superjson: Pick<SuperJSON, 'registerCustom'>): void => {
  superjson.registerCustom<Temporal.ZonedDateTime, string>(
    {
      isApplicable: (v) => v instanceof Temporal.ZonedDateTime,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.ZonedDateTime.from(raw),
    },
    'Temporal.ZonedDateTime',
  );

  superjson.registerCustom<Temporal.PlainTime, string>(
    {
      isApplicable: (v) => v instanceof Temporal.PlainTime,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.PlainTime.from(raw),
    },
    'Temporal.PlainTime',
  );

  superjson.registerCustom<Temporal.PlainMonthDay, string>(
    {
      isApplicable: (v) => v instanceof Temporal.PlainMonthDay,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.PlainMonthDay.from(raw),
    },
    'Temporal.PlainMonthDay',
  );

  superjson.registerCustom<Temporal.PlainYearMonth, string>(
    {
      isApplicable: (v) => v instanceof Temporal.PlainYearMonth,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.PlainYearMonth.from(raw),
    },
    'Temporal.PlainYearMonth',
  );

  superjson.registerCustom<Temporal.PlainDate, string>(
    {
      isApplicable: (v) => v instanceof Temporal.PlainDate,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.PlainDate.from(raw),
    },
    'Temporal.PlainDate',
  );

  superjson.registerCustom<Temporal.PlainDateTime, string>(
    {
      isApplicable: (v) => v instanceof Temporal.PlainDateTime,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.PlainDateTime.from(raw),
    },
    'Temporal.PlainDateTime',
  );

  superjson.registerCustom<Temporal.Duration, string>(
    {
      isApplicable: (v) => v instanceof Temporal.Duration,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.Duration.from(raw),
    },
    'Temporal.Duration',
  );

  superjson.registerCustom<Temporal.Instant, string>(
    {
      isApplicable: (v) => v instanceof Temporal.Instant,
      serialize: (v) => v.toJSON(),
      deserialize: (raw) => Temporal.Instant.from(raw),
    },
    'Temporal.Instant',
  );
};

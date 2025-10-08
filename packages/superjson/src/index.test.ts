import { Temporal } from '@js-temporal/polyfill';
import SuperJSON from 'superjson';
import { describe, expect, it } from 'vitest';

import { registerSuperJSONTemporal } from './index.js';

describe('registerSuperJSONTemporal', () => {
  it('should register the serializers/deserializers for Temporal types', () => {
    registerSuperJSONTemporal(SuperJSON);

    const zonedDateTime = Temporal.ZonedDateTime.from('2025-10-07T19:53[America/New_York]');
    const obj = {
      zonedDateTime,
      plainDate: zonedDateTime.toPlainDate(),
      plainDateTime: zonedDateTime.toPlainDateTime(),
      plainMonthDay: zonedDateTime.toPlainDate().toPlainMonthDay(),
      plainYearMonth: zonedDateTime.toPlainDate().toPlainYearMonth(),
      plainTime: zonedDateTime.toPlainTime(),
      duration: zonedDateTime.toPlainDateTime().since({
        year: 2021,
        month: 1,
        day: 28,
      }),
      instant: zonedDateTime.toInstant(),
    };
    const parsedObj = SuperJSON.parse<typeof obj>(SuperJSON.stringify(obj));

    expect(parsedObj.zonedDateTime.equals(obj.zonedDateTime)).toBeTruthy();
    expect(parsedObj.plainDateTime.equals(obj.plainDateTime)).toBeTruthy();
    expect(parsedObj.plainMonthDay.equals(obj.plainMonthDay)).toBeTruthy();
    expect(parsedObj.plainYearMonth.equals(obj.plainYearMonth)).toBeTruthy();
    expect(parsedObj.plainTime.equals(obj.plainTime)).toBeTruthy();
    expect(parsedObj.plainDate.equals(obj.plainDate)).toBeTruthy();
    expect(parsedObj.instant.equals(obj.instant)).toBeTruthy();
    expect(parsedObj.duration.toString()).toEqual(obj.duration.toString());
  });
});

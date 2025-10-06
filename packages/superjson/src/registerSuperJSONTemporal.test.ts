import { Temporal } from '@js-temporal/polyfill';
import SuperJSON from 'superjson';
import { describe, expect, it } from 'vitest';

import { registerSuperJSONTemporal } from './registerSuperJSONTemporal.js';

describe('registerSuperJSONTemporal', () => {
  it('should register the serializers/deserializers for Temporal types', () => {
    registerSuperJSONTemporal(SuperJSON);

    const zonedDateTime = Temporal.ZonedDateTime.from('2022-01-28T19:53+01:00[Europe/Berlin]');
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
    type ObjType = typeof obj;
    const newObj = SuperJSON.parse<ObjType>(SuperJSON.stringify(obj));

    expect(newObj.zonedDateTime.equals(obj.zonedDateTime)).toEqual(true);
    expect(newObj.plainDateTime.equals(obj.plainDateTime)).toEqual(true);
    expect(newObj.plainMonthDay.equals(obj.plainMonthDay)).toEqual(true);
    expect(newObj.plainYearMonth.equals(obj.plainYearMonth)).toEqual(true);
    expect(newObj.plainTime.equals(obj.plainTime)).toEqual(true);
    expect(newObj.plainDate.equals(obj.plainDate)).toEqual(true);
    expect(newObj.instant.equals(obj.instant)).toEqual(true);
    expect(newObj.duration.toString()).toEqual(obj.duration.toString());
  });
});

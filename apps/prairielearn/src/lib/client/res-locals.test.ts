import { describe, expect, it } from 'vitest';

import { stripResLocals } from '../res-locals.js';

describe('stripResLocals', () => {
  it('strips extra fields from the data', () => {
    const mockData = {
      authz_data: {
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        has_course_permission_own: true,
      },
      course_instance: { id: '1', long_name: 'Example Course Instance' },
      course: { id: '1', short_name: 'Example Course' },
      urlPrefix: '/pl/course/1/course_instance/1',
      extraField: 'this should be stripped',
      anotherExtraField: 123,
    };

    const result = stripResLocals(mockData);

    expect(result).toEqual({
      authz_data: {
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        has_course_permission_own: true,
      },
      course_instance: { id: '1', long_name: 'Example Course Instance' },
      course: { id: '1', short_name: 'Example Course' },
      urlPrefix: '/pl/course/1/course_instance/1',
    });

    expect(result).not.toHaveProperty('extraField');
    expect(result).not.toHaveProperty('anotherExtraField');
  });
});

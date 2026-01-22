import { describe, expect, it } from 'vitest';

import { sortStudentCourses } from './home.js';

describe('sortStudentCourses', () => {
  it('sorts by start date descending, then end date descending, then id descending', () => {
    const courses = [
      {
        start_date: new Date('2025-01-15'),
        end_date: new Date('2025-05-15'),
        course_instance: { id: '100' },
      },
      {
        start_date: new Date('2025-01-15'),
        end_date: new Date('2025-06-01'),
        course_instance: { id: '101' },
      },
      {
        start_date: new Date('2024-08-20'),
        end_date: new Date('2024-12-15'),
        course_instance: { id: '99' },
      },
      {
        start_date: null,
        end_date: null,
        course_instance: { id: '102' },
      },
      {
        start_date: new Date('2025-01-15'),
        end_date: new Date('2025-05-15'),
        course_instance: { id: '98' },
      },
    ];

    const sorted = [...courses].sort(sortStudentCourses);

    expect(sorted.map((c) => c.course_instance.id)).toEqual([
      '101', // start: 2025-01-15, end: 2025-06-01 (same start as 100/98, but later end date)
      '100', // start: 2025-01-15, end: 2025-05-15, id: 100 (same start/end as 98, higher id)
      '98', // start: 2025-01-15, end: 2025-05-15, id: 98 (same dates as 100, lower id)
      '99', // start: 2024-08-20 (older start date)
      '102', // start: null (null treated as 0, sorts last)
    ]);
  });
});

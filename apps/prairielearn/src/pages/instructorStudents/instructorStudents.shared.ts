import type { SortingState } from '@tanstack/table-core';
import { createParser } from 'nuqs';
import z from 'zod';

import { type StaffUser, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { type Enrollment, EnrollmentSchema } from '../../lib/db-types.js';

export const StudentQuerySchema = z.object({
  enrollment: EnrollmentSchema,
  user: StaffUserSchema,
});

export type StudentQuery = z.infer<typeof StudentQuerySchema>;
export type StudentRow = Enrollment & StaffUser;
// Custom parser for SortingState: ?sort=col:asc or ?sort=col:desc
export const parseAsSortingState = createParser<SortingState>({
  parse(queryValue) {
    if (!queryValue) return [];
    const [id, dir] = queryValue.split(':');
    if (!id) return [];
    if (dir === 'asc' || dir === 'desc') {
      return [{ id, desc: dir === 'desc' }];
    }
    return [];
  },
  serialize(value) {
    if (!value || value.length === 0) return '';
    const { id, desc } = value[0];
    if (!id) return '';
    return `${id}:${desc ? 'desc' : 'asc'}`;
  },
  eq(a, b) {
    if (!a || !b) return a === b;
    return (
      a.length === b.length &&
      a.every((item, index) => item.id === b[index].id && item.desc === b[index].desc)
    );
  },
});

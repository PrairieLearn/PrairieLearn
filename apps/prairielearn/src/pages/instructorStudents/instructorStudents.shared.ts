import type { SortingState } from '@tanstack/table-core';
import { createParser } from 'nuqs';
import z from 'zod';

import {
  type Enrollment,
  EnrollmentSchema,
  type StudentUser,
  StudentUserSchema,
} from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  enrollment: EnrollmentSchema,
  user: StudentUserSchema,
});

export type StudentRow = Enrollment & StudentUser;

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
    return a.length === b.length && a.every((item, index) => item.id === b[index].id);
  },
});

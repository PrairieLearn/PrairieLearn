import type { SortingState } from '@tanstack/table-core';
import { createParser } from 'nuqs';
import z from 'zod';

import { StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { EnrollmentSchema } from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  enrollment: EnrollmentSchema,
  user: StaffUserSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;

/**
 * Custom parser for SortingState: parses a TanStack Table sorting state from a URL query string.
 *
 * ```ts
 * // sort=col:asc
 * const sortingState = parseAsSortingState('sort');
 * // sortingState = [{ id: 'col', desc: false }]
 * ```
 */
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

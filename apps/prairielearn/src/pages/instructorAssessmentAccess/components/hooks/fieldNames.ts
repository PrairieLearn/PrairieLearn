import { type Path } from 'react-hook-form';

import type { AccessControlFormData } from '../types.js';

export type NamePrefix = 'mainRule' | `overrides.${number}`;

/**
 * Builds a full field path from a name prefix and a relative field path.
 *
 * The `as Path<AccessControlFormData>` cast bypasses compile-time validation
 * that the resulting path exists in the form data type. Making this fully
 * type-safe would require computing "relative paths" from a prefix, which
 * react-hook-form's Path utility doesn't support.
 */
export function getFieldName(
  namePrefix: NamePrefix,
  fieldPath: string,
): Path<AccessControlFormData> {
  return `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>;
}

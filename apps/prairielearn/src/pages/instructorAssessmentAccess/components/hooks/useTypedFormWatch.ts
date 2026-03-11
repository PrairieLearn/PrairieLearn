import { type Path } from 'react-hook-form';

import type { AccessControlFormData } from '../types.js';

export type NamePrefix = 'mainRule' | `overrides.${number}`;

/** Centralizes the type assertion for register() calls. */
export function getFieldName(
  namePrefix: NamePrefix,
  fieldPath: string,
): Path<AccessControlFormData> {
  return `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>;
}

import { type FieldArrayPath, type Path, useFormContext, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from '../types.js';

export type NamePrefix = 'mainRule' | `overrides.${number}`;

/**
 * Type-safe wrapper for useWatch with dynamic paths.
 * Centralizes the necessary type assertion for react-hook-form dynamic paths.
 */
export function useWatchField<T>(namePrefix: NamePrefix, fieldPath: string): T | undefined {
  const { control } = useFormContext<AccessControlFormData>();
  return useWatch({
    control,
    name: `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>,
  }) as T | undefined;
}

/** Centralizes the type assertion for register() calls. */
export function getFieldName(
  namePrefix: NamePrefix,
  fieldPath: string,
): Path<AccessControlFormData> {
  return `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>;
}

/**
 * Create a form field name for use with useFieldArray.
 * useFieldArray has stricter typing requirements than regular register().
 */
export function getArrayFieldName(
  namePrefix: NamePrefix,
  fieldPath: string,
): FieldArrayPath<AccessControlFormData> {
  return `${namePrefix}.${fieldPath}` as FieldArrayPath<AccessControlFormData>;
}

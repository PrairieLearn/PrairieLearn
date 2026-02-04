import { type Control, type Path, useWatch } from 'react-hook-form';

import type { AccessControlFormData, OverridableField } from '../types.js';

export type NamePrefix = 'mainRule' | `overrides.${number}`;

/**
 * Type-safe wrapper for useWatch with dynamic paths.
 * Centralizes the necessary type assertion for react-hook-form dynamic paths.
 *
 * react-hook-form's Path type doesn't support computed template literal paths like
 * `${namePrefix}.dateControl.releaseDate`, so we use a type assertion here.
 * This is the single source of truth for this pattern.
 */
export function useWatchField<T>(
  control: Control<AccessControlFormData>,
  namePrefix: NamePrefix,
  fieldPath: string,
): T | undefined {
  return useWatch({
    control,
    name: `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>,
  }) as T | undefined;
}

/**
 * Watch an overridable field with proper typing.
 */
export function useWatchOverridableField<T>(
  control: Control<AccessControlFormData>,
  namePrefix: NamePrefix,
  fieldPath: string,
): OverridableField<T> | undefined {
  return useWatchField<OverridableField<T>>(control, namePrefix, fieldPath);
}

/**
 * Create a form field name from prefix and path.
 * Centralizes the type assertion for register() calls.
 */
export function getFieldName(
  namePrefix: NamePrefix,
  fieldPath: string,
): Path<AccessControlFormData> {
  return `${namePrefix}.${fieldPath}` as Path<AccessControlFormData>;
}

/**
 * Create a form field name for use with useFieldArray.
 * useFieldArray has stricter typing requirements than regular register().
 *
 * The type assertion here is necessary because useFieldArray expects a narrow
 * FieldArrayPath type that TypeScript cannot infer from dynamic template literals.
 * This function centralizes that assertion.
 *
 * @returns The path as any type to satisfy useFieldArray's strict typing
 */
export function getArrayFieldName(namePrefix: NamePrefix, fieldPath: string): any {
  return `${namePrefix}.${fieldPath}`;
}

import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { AccessControlFormData, OverridableField } from '../types.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface UseOverridableFieldOptions<T> {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
  /** The field path within the namePrefix, e.g. 'dateControl.releaseDate' */
  fieldPath: string;
  /** Default value when field is undefined */
  defaultValue: T;
}

interface UseOverridableFieldResult<T> {
  /** The current field value */
  field: OverridableField<T>;
  /** Whether this is an override rule (vs main rule) */
  isOverrideRule: boolean;
  /** Update the field with partial values */
  setField: (updates: Partial<OverridableField<T>>) => void;
  /** Convenience: set isOverridden to true with initial values */
  enableOverride: (initialValue?: T) => void;
  /** Convenience: set isOverridden to false */
  removeOverride: () => void;
  /** Convenience: toggle isEnabled */
  toggleEnabled: (enabled: boolean) => void;
  /** Convenience: update just the value */
  updateValue: (value: T) => void;
}

/**
 * Hook for managing OverridableField state in react-hook-form.
 * Encapsulates the common pattern of watching and updating overridable fields.
 */
export function useOverridableField<T>({
  control,
  setValue,
  namePrefix,
  fieldPath,
  defaultValue,
}: UseOverridableFieldOptions<T>): UseOverridableFieldResult<T> {
  const isOverrideRule = namePrefix.startsWith('overrides.');

  const fullPath = `${namePrefix}.${fieldPath}` as any;

  const watchedField = useWatch({
    control,
    name: fullPath,
  }) as OverridableField<T> | undefined;

  // Provide a fallback if the field hasn't loaded yet
  const field: OverridableField<T> = watchedField ?? {
    isOverridden: !isOverrideRule,
    isEnabled: false,
    value: defaultValue,
  };

  const setField = (updates: Partial<OverridableField<T>>) => {
    setValue(fullPath, {
      isOverridden: updates.isOverridden ?? field.isOverridden,
      isEnabled: updates.isEnabled ?? field.isEnabled,
      value: updates.value ?? field.value,
    });
  };

  const enableOverride = (initialValue?: T) => {
    setField({
      isOverridden: true,
      isEnabled: false,
      value: initialValue ?? defaultValue,
    });
  };

  const removeOverride = () => {
    setField({
      isOverridden: false,
      isEnabled: false,
      value: defaultValue,
    });
  };

  const toggleEnabled = (enabled: boolean) => {
    setField({ isEnabled: enabled });
  };

  const updateValue = (value: T) => {
    setField({ value });
  };

  return {
    field,
    isOverrideRule,
    setField,
    enableOverride,
    removeOverride,
    toggleEnabled,
    updateValue,
  };
}

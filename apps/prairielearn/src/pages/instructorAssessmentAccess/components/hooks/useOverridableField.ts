import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { AccessControlFormData, DateControlFormData, OverridableField } from '../types.js';

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

/** Check if any date control field is overridden */
function hasAnyDateControlOverride(dateControl: DateControlFormData): boolean {
  return (
    dateControl.releaseDate.isOverridden ||
    dateControl.dueDate.isOverridden ||
    dateControl.earlyDeadlines.isOverridden ||
    dateControl.lateDeadlines.isOverridden ||
    dateControl.afterLastDeadline.isOverridden ||
    dateControl.durationMinutes.isOverridden ||
    dateControl.password.isOverridden
  );
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
  const isDateControlField = fieldPath.startsWith('dateControl.');

  const fullPath = `${namePrefix}.${fieldPath}` as any;
  const dateControlEnabledPath = `${namePrefix}.dateControl.enabled` as any;
  const dateControlPath = `${namePrefix}.dateControl` as any;

  const watchedField = useWatch({
    control,
    name: fullPath,
  }) as OverridableField<T> | undefined;

  // Watch dateControl for checking other fields when removing override
  const watchedDateControl = useWatch({
    control,
    name: dateControlPath,
  }) as DateControlFormData | undefined;

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

    // When enabling a dateControl field override, also enable dateControl
    if (isDateControlField && isOverrideRule) {
      setValue(dateControlEnabledPath, true);
    }
  };

  const removeOverride = () => {
    setField({
      isOverridden: false,
      isEnabled: false,
      value: defaultValue,
    });

    // When removing a dateControl field override, check if any other fields are still overridden
    // If not, disable dateControl
    if (isDateControlField && isOverrideRule && watchedDateControl) {
      // Create a copy with this field's override removed to check
      const fieldName = fieldPath.split('.')[1] as keyof DateControlFormData;
      const updatedDateControl = {
        ...watchedDateControl,
        // @ts-expect-error FIXME FIXME FIXME
        [fieldName]: { ...watchedDateControl[fieldName], isOverridden: false },
      } as DateControlFormData;

      if (!hasAnyDateControlOverride(updatedDateControl)) {
        setValue(dateControlEnabledPath, false);
      }
    }
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

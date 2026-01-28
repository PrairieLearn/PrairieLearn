import { type Control, type FieldValues, type Path, type UseFormSetValue } from 'react-hook-form';

import type { AccessControlFormData, DateControlFormData, OverridableField } from '../types.js';

import { type NamePrefix, getFieldName, useWatchField } from './useTypedFormWatch.js';

/** Keys of DateControlFormData that are OverridableField types */
type OverridableFieldKey = Exclude<keyof DateControlFormData, 'enabled'>;

function isOverridableFieldKey(key: string): key is OverridableFieldKey {
  return (
    key === 'releaseDate' ||
    key === 'dueDate' ||
    key === 'earlyDeadlines' ||
    key === 'lateDeadlines' ||
    key === 'afterLastDeadline' ||
    key === 'durationMinutes' ||
    key === 'password'
  );
}

/**
 * Type-safe setValue wrapper for dynamic paths.
 * Centralizes the type assertion needed for computed field paths.
 */
function setValueAtPath<TFieldValues extends FieldValues>(
  setValue: UseFormSetValue<TFieldValues>,
  path: Path<TFieldValues>,

  value: any,
  options?: { shouldDirty?: boolean },
): void {
  setValue(path, value, options);
}

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

  const fullPath = getFieldName(namePrefix, fieldPath);
  const dateControlEnabledPath = getFieldName(namePrefix, 'dateControl.enabled');

  const watchedField = useWatchField<OverridableField<T>>(control, namePrefix, fieldPath);

  // Watch dateControl for checking other fields when removing override
  const watchedDateControl = useWatchField<DateControlFormData>(control, namePrefix, 'dateControl');

  // Provide a fallback if the field hasn't loaded yet
  const field: OverridableField<T> = watchedField ?? {
    isOverridden: !isOverrideRule,
    isEnabled: false,
    value: defaultValue,
  };

  const setField = (updates: Partial<OverridableField<T>>) => {
    setValueAtPath(
      setValue,
      fullPath,
      {
        isOverridden: updates.isOverridden ?? field.isOverridden,
        isEnabled: updates.isEnabled ?? field.isEnabled,
        value: updates.value ?? field.value,
      },
      { shouldDirty: true },
    );
  };

  const enableOverride = (initialValue?: T) => {
    setField({
      isOverridden: true,
      isEnabled: false,
      value: initialValue ?? defaultValue,
    });

    // When enabling a dateControl field override, also enable dateControl
    if (isDateControlField && isOverrideRule) {
      setValueAtPath(setValue, dateControlEnabledPath, true, { shouldDirty: true });
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
      const fieldName = fieldPath.split('.')[1];
      if (fieldName && isOverridableFieldKey(fieldName)) {
        const currentFieldValue = watchedDateControl[fieldName];
        const updatedDateControl: DateControlFormData = {
          ...watchedDateControl,
          [fieldName]: { ...currentFieldValue, isOverridden: false },
        };

        if (!hasAnyDateControlOverride(updatedDateControl)) {
          setValueAtPath(setValue, dateControlEnabledPath, false, { shouldDirty: true });
        }
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

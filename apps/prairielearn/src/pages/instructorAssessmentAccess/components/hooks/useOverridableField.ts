import {
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormSetValue,
} from 'react-hook-form';

import type { AccessControlFormData, DateControlFormData, OverridableField } from '../types.js';

import { type NamePrefix, getFieldName, useWatchField } from './useTypedFormWatch.js';

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

/** Centralizes the type assertion needed for computed field paths. */
function setValueAtPath<TFieldValues extends FieldValues>(
  setValue: UseFormSetValue<TFieldValues>,
  path: Path<TFieldValues>,
  value: OverridableField<unknown> | boolean,
  options?: { shouldDirty?: boolean },
): void {
  setValue(path, value as PathValue<TFieldValues, Path<TFieldValues>>, options);
}

interface UseOverridableFieldOptions<T> {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
  /** The field path within the namePrefix, e.g. 'dateControl.releaseDate' */
  fieldPath: string;
  defaultValue: T;
}

interface UseOverridableFieldResult<T> {
  field: OverridableField<T>;
  isOverrideRule: boolean;
  setField: (updates: Partial<OverridableField<T>>) => void;
  enableOverride: (initialValue?: T) => void;
  removeOverride: () => void;
  toggleEnabled: (enabled: boolean) => void;
  updateValue: (value: T) => void;
}

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

  const watchedDateControl = useWatchField<DateControlFormData>(control, namePrefix, 'dateControl');

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

    // Auto-disable dateControl when no fields remain overridden
    if (isDateControlField && isOverrideRule && watchedDateControl) {
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

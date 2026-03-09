import { useController } from 'react-hook-form';

import type { OverridableField } from '../types.js';

import { type NamePrefix, getFieldName } from './useTypedFormWatch.js';

interface UseOverridableFieldOptions<T> {
  namePrefix: NamePrefix;
  /** The field path within the namePrefix, e.g. 'dateControl.releaseDate' */
  fieldPath: string;
  defaultValue: T;
  /** Relative field paths (without namePrefix) that should be re-validated when this field changes. */
  deps?: string[];
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

export function useOverridableField<T>({
  namePrefix,
  fieldPath,
  defaultValue,
  deps,
}: UseOverridableFieldOptions<T>): UseOverridableFieldResult<T> {
  const isOverrideRule = namePrefix.startsWith('overrides.');

  const fullPath = getFieldName(namePrefix, fieldPath);

  const { field: controllerField } = useController({
    name: fullPath,
    rules: deps?.length ? { deps: deps.map((d) => getFieldName(namePrefix, d)) } : undefined,
  });

  const field: OverridableField<T> = (controllerField.value as OverridableField<T> | undefined) ?? {
    isOverridden: !isOverrideRule,
    isEnabled: false,
    value: defaultValue,
  };

  const setField = (updates: Partial<OverridableField<T>>) => {
    controllerField.onChange({
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

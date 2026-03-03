import { useEffect } from 'react';
import type { FieldValues, UseFormGetValues } from 'react-hook-form';

export function useAutoSave<T extends FieldValues>({
  isDirty,
  isValid,
  getValues,
  onSave,
}: {
  isDirty: boolean;
  isValid: boolean;
  getValues: UseFormGetValues<T>;
  onSave: (data: T) => void;
}) {
  useEffect(() => {
    if (isDirty && isValid) {
      onSave(getValues());
    }
  }, [isDirty, isValid, getValues, onSave]);
}

import { useEffect, useRef } from 'react';
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
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isDirtyRef = useRef(isDirty);
  const isValidRef = useRef(isValid);
  isDirtyRef.current = isDirty;
  isValidRef.current = isValid;

  // Save whenever the form is dirty and valid. With mode: 'onChange',
  // react-hook-form re-renders on every field change, so this effect
  // naturally fires after each keystroke.
  useEffect(() => {
    if (isDirty && isValid) {
      onSaveRef.current(getValues());
    }
  });

  // Save on unmount in case the deferred effect above hasn't fired yet
  // (React can unmount before a pending useEffect runs).
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && isValidRef.current) {
        onSaveRef.current(getValues());
      }
    };
  }, [getValues]);
}

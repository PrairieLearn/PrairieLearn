import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormGetValues, UseFormWatch } from 'react-hook-form';

export function useAutoSave<T extends FieldValues>({
  isDirty,
  isValid,
  getValues,
  onSave,
  watch,
}: {
  isDirty: boolean;
  isValid: boolean;
  getValues: UseFormGetValues<T>;
  onSave: (data: T) => void;
  watch: UseFormWatch<T>;
}) {
  // TODO: this is super ugly, we should make sure this is needed for the test suite to pass.

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Track isDirty/isValid via refs so the debounced timeout reads the
  // latest values, not stale closure captures from when the effect ran.
  const isDirtyRef = useRef(isDirty);
  const isValidRef = useRef(isValid);
  isDirtyRef.current = isDirty;
  isValidRef.current = isValid;

  const formValues = watch();
  const serialized = JSON.stringify(formValues);

  // Debounce saves so that react-hook-form's async validation can settle
  // before we check isValid. The timeout reads isDirty/isValid from refs
  // to get the most up-to-date values.
  const pendingRef = useRef(false);

  useEffect(() => {
    pendingRef.current = true;
    const timer = setTimeout(() => {
      pendingRef.current = false;
      if (isDirtyRef.current && isValidRef.current) {
        onSaveRef.current(getValues());
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [serialized, getValues]);

  // Flush any pending save when the component unmounts (e.g. when the
  // user switches to a different detail panel before the debounce fires).
  useEffect(() => {
    return () => {
      if (pendingRef.current && isDirtyRef.current && isValidRef.current) {
        onSaveRef.current(getValues());
      }
    };
  }, [getValues]);
}

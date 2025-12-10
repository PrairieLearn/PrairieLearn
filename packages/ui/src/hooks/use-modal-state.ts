import { useState } from 'preact/hooks';

export function useModalState<T>(initialData: T | null = null) {
  const [show, setShow] = useState<boolean>(false);
  const [data, setData] = useState<T | null>(initialData);
  return {
    show,
    data,
    open: (state: T) => {
      setData(state);
      setShow(true);
    },
    onHide: () => setShow(false),
    onExited: () => setData(null),
  };
}

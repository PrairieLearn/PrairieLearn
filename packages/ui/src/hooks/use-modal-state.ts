import { useState } from 'preact/hooks';

/**
 * A hook to manage the state of a modal dialog that's rendered with a certain set of data.
 *
 * The main thing this hook achieves is to separate the "shown" state of the modal from the
 * data that it's rendered with, so that when the modal is closed, the data is cleared only
 * after the modal has finished closing (i.e., after any closing animation has completed).
 * This avoids a flash of an empty modal if the data is cleared immediately when the modal is closed.
 */
export function useModalState<T>(initialData: T | null = null) {
  const [show, setShow] = useState<boolean>(false);
  const [data, setData] = useState<T | null>(initialData);
  return {
    show,
    data,
    showWithData: (data: T) => {
      setData(data);
      setShow(true);
    },
    hide: () => setShow(false),
    onHide: () => setShow(false),
    onExited: () => setData(null),
  };
}

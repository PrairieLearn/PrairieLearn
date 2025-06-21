import { type SortingState } from '@tanstack/react-table';
import { useEffect } from 'preact/compat';

export function useURLSync(globalFilter: string, sorting: SortingState) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // Update search param
    if (globalFilter) {
      params.set('search', globalFilter);
    } else {
      params.delete('search');
    }
    // Update sort params
    if (sorting.length > 0) {
      params.set('sortBy', sorting[0].id);
      params.set('sortOrder', sorting[0].desc ? 'desc' : 'asc');
    } else {
      params.delete('sortBy');
      params.delete('sortOrder');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }, [globalFilter, sorting]);
}

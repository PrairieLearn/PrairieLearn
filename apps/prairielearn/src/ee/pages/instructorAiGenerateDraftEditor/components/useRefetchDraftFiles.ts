import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useTRPC } from '../../../../trpc/course/context.js';

/**
 * Refetches the draft question's file data by invalidating every `aiDraftFiles`
 * query (the code-editor `contents` and the file-browser `browse`).
 */
export function useRefetchDraftFiles() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.aiDraftFiles.pathKey() }),
    [queryClient, trpc],
  );
}

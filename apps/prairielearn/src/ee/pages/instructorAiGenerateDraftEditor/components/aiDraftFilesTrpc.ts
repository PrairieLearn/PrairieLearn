import { useQueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useCallback } from 'react';
import superjson from 'superjson';

import type { AiDraftFilesTrpcRouter } from '../../../../trpc/shared/ai-draft-files.js';

export function createAiDraftFilesTrpcClient({
  csrfToken,
  trpcUrl,
}: {
  csrfToken: string;
  trpcUrl: string;
}) {
  return createTRPCClient<AiDraftFilesTrpcRouter>({
    links: [
      httpLink({
        url: trpcUrl,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

export const { TRPCProvider, useTRPC } = createTRPCContext<AiDraftFilesTrpcRouter>();

/** Refetches the draft question's file data by invalidating the `list` query. */
export function useRefetchDraftFiles() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.aiDraftFiles.list.queryKey() }),
    [queryClient, trpc],
  );
}

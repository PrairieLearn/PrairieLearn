import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
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

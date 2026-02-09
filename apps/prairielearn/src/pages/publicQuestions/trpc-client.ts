import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { PublicQuestionsRouter } from './trpc.js';

export function createPublicQuestionsTrpcClient() {
  return createTRPCClient<PublicQuestionsRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
        headers: { 'X-TRPC': 'true' },
        transformer: superjson,
      }),
    ],
  });
}

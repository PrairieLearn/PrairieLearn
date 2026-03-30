import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { InstanceQuestionRouter } from './trpc.js';

export function createInstanceQuestionTrpcClient(csrfToken: string) {
  return createTRPCClient<InstanceQuestionRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

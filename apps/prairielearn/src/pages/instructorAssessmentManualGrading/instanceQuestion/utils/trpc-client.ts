import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { ManualGradingInstanceQuestionRouter } from '../trpc.js';

export function createManualGradingInstanceQuestionTrpcClient(csrfToken: string) {
  return createTRPCClient<ManualGradingInstanceQuestionRouter>({
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

import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AccessControlRouter } from '../trpc.js';

export function createAccessControlTrpcClient(csrfToken: string, trpcUrl: string) {
  return createTRPCClient<AccessControlRouter>({
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

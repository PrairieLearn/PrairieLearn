import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdminCreditPoolRouter } from '../trpc.js';

export function createAdminCreditPoolTrpcClient(csrfToken: string) {
  return createTRPCClient<AdminCreditPoolRouter>({
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

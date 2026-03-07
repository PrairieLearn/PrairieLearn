import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AccessControlRouter } from '../trpc.js';

import { buildTrpcUrl } from './trpc-url.js';

export function createAccessControlTrpcClient(csrfToken: string) {
  return createTRPCClient<AccessControlRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : buildTrpcUrl(window.location.pathname),
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

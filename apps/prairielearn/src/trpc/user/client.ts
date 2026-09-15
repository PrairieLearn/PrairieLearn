import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getUserTrpcUrl } from '../../lib/client/url.js';

import type { UserRouter } from './trpc.js';

export function createUserTrpcClient({
  csrfToken,
  urlBase = '',
}: {
  csrfToken: string;
  urlBase?: string;
}) {
  return createTRPCClient<UserRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getUserTrpcUrl()}`,
        headers: { 'X-TRPC': 'true', 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

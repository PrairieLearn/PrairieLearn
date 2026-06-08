import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getAdministratorTrpcUrl } from '../../lib/client/url.js';

import type { AdministratorRouter } from './trpc.js';

export function createAdministratorTrpcClient({
  csrfToken,
  urlBase = '',
}: {
  csrfToken: string;
  urlBase?: string;
}) {
  return createTRPCClient<AdministratorRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getAdministratorTrpcUrl()}`,
        headers: { 'X-TRPC': 'true', 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

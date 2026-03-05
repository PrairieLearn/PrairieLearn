import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdministratorRouter } from '../../trpc/administrator/trpc.js';

export function createAdministratorTrpcClient({
  csrfToken,
  url = '/pl/administrator/trpc',
}: {
  csrfToken: string;
  url?: string;
}) {
  return createTRPCClient<AdministratorRouter>({
    links: [
      httpLink({
        url,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

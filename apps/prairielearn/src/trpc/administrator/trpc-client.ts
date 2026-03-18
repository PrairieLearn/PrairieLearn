import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdministratorRouter } from '../../trpc/administrator/trpc.js';

export function createAdministratorTrpcClient({
  csrfToken,
  urlPrefix = '/pl',
}: {
  csrfToken: string;
  urlPrefix?: string;
}) {
  return createTRPCClient<AdministratorRouter>({
    links: [
      httpLink({
        url: `${urlPrefix}/administrator/trpc`,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

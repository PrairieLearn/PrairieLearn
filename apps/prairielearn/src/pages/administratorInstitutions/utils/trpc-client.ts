import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdministratorInstitutionsRouter } from '../trpc.js';

export function createAdministratorInstitutionsTrpcClient({
  csrfToken,
  url = '/pl/administrator/institutions/trpc',
}: {
  csrfToken: string;
  url?: string;
}) {
  return createTRPCClient<AdministratorInstitutionsRouter>({
    links: [
      httpLink({
        url,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

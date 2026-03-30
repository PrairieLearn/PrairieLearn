import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdministratorInstitutionsRouter } from '../trpc.js';

export function createAdministratorInstitutionsTrpcClient({
  csrfToken,
  urlPrefix = '/pl',
}: {
  csrfToken: string;
  urlPrefix?: string;
}) {
  return createTRPCClient<AdministratorInstitutionsRouter>({
    links: [
      httpLink({
        url: `${urlPrefix}/administrator/institutions/trpc`,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}

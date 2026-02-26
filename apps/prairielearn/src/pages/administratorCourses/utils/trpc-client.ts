import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AdministratorRouter } from '../../../trpc/administrator/index.js';

export function createAdministratorCoursesTrpcClient(csrfToken: string, urlPrefix: string) {
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

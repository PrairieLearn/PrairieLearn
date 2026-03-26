import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { SettingsRouter } from '../trpc.js';

export function createSettingsTrpcClient(csrfToken: string, trpcUrl: string) {
  return createTRPCClient<SettingsRouter>({
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

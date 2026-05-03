import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AiGradingSettingsRouter } from '../trpc.js';

export function createAiGradingSettingsTrpcClient({
  csrfToken,
  urlBase,
}: {
  csrfToken: string;
  urlBase?: string;
}) {
  return createTRPCClient<AiGradingSettingsRouter>({
    links: [
      httpLink({
        url: `${urlBase ?? (typeof window === 'undefined' ? '' : window.location.pathname)}/trpc`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

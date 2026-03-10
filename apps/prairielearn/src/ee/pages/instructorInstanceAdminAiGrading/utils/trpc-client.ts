import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AiGradingSettingsRouter } from '../trpc.js';

export function createAiGradingSettingsTrpcClient(csrfToken: string) {
  return createTRPCClient<AiGradingSettingsRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

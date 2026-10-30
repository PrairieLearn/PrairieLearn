import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getWorkspaceTrpcUrl } from '../../lib/client/url.js';

import type { WorkspaceRouter } from './trpc.js';

export function createWorkspaceTrpcClient({
  csrfToken,
  workspaceId,
  publicQuestionEndpoint,
  urlBase = '',
}: {
  csrfToken: string;
  workspaceId: string;
  publicQuestionEndpoint: boolean;
  urlBase?: string;
}) {
  return createTRPCClient<WorkspaceRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getWorkspaceTrpcUrl({ workspaceId, publicQuestionEndpoint })}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

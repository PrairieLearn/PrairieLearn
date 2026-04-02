import { type TRPCLink, httpLink, splitLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import superjson from 'superjson';

/**
 * Creates a tRPC `splitLink` that routes chunk-server procedures to a
 * separate URL while sending everything else to the main server URL.
 *
 * `chunkPaths` should be derived at runtime from the chunk router via
 * `getRouterPaths()` on the server and passed to the client as a prop.
 */
export function createChunkSplitLink({
  mainUrl,
  chunkUrl,
  csrfToken,
  chunkPaths,
}: {
  mainUrl: string;
  chunkUrl: string;
  csrfToken: string;
  chunkPaths: readonly string[];
}): TRPCLink<AnyRouter> {
  const headers = {
    'X-TRPC': 'true',
    'X-CSRF-Token': csrfToken,
  };
  console.log('chunkPaths', chunkPaths);
  const chunkPathSet: ReadonlySet<string> = new Set(chunkPaths);

  return splitLink({
    condition: (op) => chunkPathSet.has(op.path),
    true: httpLink({ url: chunkUrl, headers, transformer: superjson }),
    false: httpLink({ url: mainUrl, headers, transformer: superjson }),
  });
}

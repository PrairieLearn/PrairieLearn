import { httpLink, splitLink, type TRPCLink } from '@trpc/client';
import type { AnyProcedure, AnyRouter, TRPCRouterRecord } from '@trpc/server';
import superjson from 'superjson';

/** Recursively extract dot-separated leaf paths from a tRPC RouterRecord. */
type FlatPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends AnyProcedure
    ? `${Prefix}${K}`
    : T[K] extends TRPCRouterRecord
      ? FlatPaths<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

type ChunkPaths<TChunkRouter extends AnyRouter> = FlatPaths<TChunkRouter['_def']['record']>;

/**
 * Creates a tRPC `splitLink` that routes chunk-server procedures to a
 * separate URL while sending everything else to the main server URL.
 *
 * Uses a curried signature so `TChunkRouter` is specified explicitly while
 * `TPaths` is inferred from the `chunkPaths` array.  TypeScript will error if:
 * - a path in `chunkPaths` doesn't exist in the chunk router (`satisfies`)
 * - a chunk router path is missing from `chunkPaths` (resolves to `never`)
 *
 * @example
 * ```ts
 * createChunkSplitLink<MyChunkRouter>()({
 *   mainUrl: '/trpc',
 *   chunkUrl: '/trpc-chunk',
 *   csrfToken,
 *   chunkPaths: ['manualGrading.aiGrade', 'manualGrading.aiGroup'],
 * });
 * ```
 */
export function createChunkSplitLink<TChunkRouter extends AnyRouter>() {
  return <const TPaths extends readonly ChunkPaths<TChunkRouter>[]>(opts: {
    mainUrl: string;
    chunkUrl: string;
    csrfToken: string;
    chunkPaths: [Exclude<ChunkPaths<TChunkRouter>, TPaths[number]>] extends [never]
      ? TPaths
      : never;
  }): TRPCLink<AnyRouter> => {
    const headers = {
      'X-TRPC': 'true',
      'X-CSRF-Token': opts.csrfToken,
    };
    const chunkPathSet: ReadonlySet<string> = new Set(opts.chunkPaths);

    return splitLink({
      condition: (op) => chunkPathSet.has(op.path),
      true: httpLink({ url: opts.chunkUrl, headers, transformer: superjson }),
      false: httpLink({ url: opts.mainUrl, headers, transformer: superjson }),
    });
  };
}

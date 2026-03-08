import { TRPCClientError } from '@trpc/client';

/**
 * Extracts a job sequence ID from a tRPC error, if present.
 * The server attaches it via `errorFormatter` on `error.data.jobSequenceId`.
 */
export function extractJobSequenceId(error: unknown): string | undefined {
  if (error instanceof TRPCClientError) {
    const jobSequenceId = (error.data as Record<string, unknown> | undefined)?.jobSequenceId;
    if (typeof jobSequenceId === 'string') {
      return jobSequenceId;
    }
  }
  return undefined;
}

import { TRPCClientError } from '@trpc/client';

/**
 * Extracts a job sequence ID from a tRPC error's cause, if present.
 * Used in client-side components to display links to job logs.
 */
export function extractJobSequenceId(error: unknown): string | undefined {
  if (error instanceof TRPCClientError) {
    const cause = error.data?.cause;
    if (cause && typeof cause === 'object' && 'jobSequenceId' in cause) {
      return (cause as { jobSequenceId?: string }).jobSequenceId;
    }
  }
  return undefined;
}

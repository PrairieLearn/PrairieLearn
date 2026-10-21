import {
  type PublicFetch,
  ResponseTooLargeError,
  publicFetch,
  readResponseWithLimit,
} from '@prairielearn/public-fetch';

// Match the existing JSON grading-result bound; responses contain grades, not attachment data.
const MAX_RESPONSE_BYTES = 1024 * 1024;
// Inference needs more time than model discovery, but must not occupy a job indefinitely.
const GRADING_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export function createAiGradingFetch({
  fetch = publicFetch,
  timeoutMs = GRADING_REQUEST_TIMEOUT_MS,
}: { fetch?: PublicFetch; timeoutMs?: number } = {}): typeof globalThis.fetch {
  // public-fetch uses Undici Fetch types while the AI SDK expects DOM Fetch types.
  const safeFetch = fetch as unknown as (
    ...args: Parameters<typeof globalThis.fetch>
  ) => ReturnType<PublicFetch>;
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const callerSignal =
      init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : null);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    try {
      const response = await safeFetch(input, { ...init, signal });
      const body = await readResponseWithLimit(response, MAX_RESPONSE_BYTES);
      const headers = new Headers([...response.headers.entries()]);
      // public-fetch already decoded the body; the reconstructed response describes those bytes.
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(response.body === null ? null : new Uint8Array(body), {
        status: response.status,
        statusText: response.statusText,
        headers: [...headers.entries()],
      });
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        throw new Error('The custom provider returned a grading response that is too large.', {
          cause: error,
        });
      }
      if (timeout.aborted && !callerSignal?.aborted) {
        throw new Error(
          'The custom provider did not finish the grading request in time. Try a faster model or check the endpoint.',
          { cause: error },
        );
      }
      throw error;
    }
  };
}

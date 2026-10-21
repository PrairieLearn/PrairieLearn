import {
  type PublicFetch,
  ResponseTooLargeError,
  publicFetch,
  readResponseWithLimit,
} from '@prairielearn/public-fetch';

// Match the existing JSON grading-result bound; responses contain grades, not attachment data.
const MAX_RESPONSE_BYTES = 1024 * 1024;

export function createAiGradingFetch({
  fetch = publicFetch,
}: { fetch?: PublicFetch } = {}): typeof globalThis.fetch {
  // public-fetch uses Undici Fetch types while the AI SDK expects DOM Fetch types.
  const safeFetch = fetch as unknown as (
    ...args: Parameters<typeof globalThis.fetch>
  ) => ReturnType<PublicFetch>;
  return async (input, init) => {
    try {
      const response = await safeFetch(input, init);
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
      throw error;
    }
  };
}

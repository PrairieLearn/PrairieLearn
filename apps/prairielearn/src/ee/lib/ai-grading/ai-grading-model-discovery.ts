import { z } from 'zod';

import { type Cache, cache } from '@prairielearn/cache';
import { type PublicFetch, publicFetch, validatePublicHttpsUrl } from '@prairielearn/public-fetch';

// The timeout follows remote-image-copier.ts. The byte limit follows the JSON result limit in
// externalGraderLocal.ts; count and ID limits additionally bound the catalog retained by the UI.
const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODEL_COUNT = 1000;
const MAX_MODEL_ID_LENGTH = 256;
const CACHE_TTL_MS = 5 * 60 * 1000;

const modelListSchema = z.object({
  data: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(MAX_MODEL_ID_LENGTH)
          .refine((id) => id.trim().length > 0),
      }),
    )
    .max(MAX_MODEL_COUNT),
});

class AiGradingModelDiscoveryError extends Error {
  constructor(
    public readonly code:
      | 'invalid_endpoint'
      | 'authentication'
      | 'not_found'
      | 'rate_limit'
      | 'provider_error'
      | 'timeout'
      | 'request_failed'
      | 'response_too_large'
      | 'invalid_response',
    message: string,
  ) {
    super(message);
    this.name = 'AiGradingModelDiscoveryError';
  }
}

export function normalizeAiGradingBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
    validatePublicHttpsUrl(url);
  } catch {
    throw new AiGradingModelDiscoveryError(
      'invalid_endpoint',
      'Enter a valid HTTPS API URL without embedded credentials.',
    );
  }
  if (url.search || url.hash) {
    throw new AiGradingModelDiscoveryError(
      'invalid_endpoint',
      'The API URL must not contain a query string or fragment.',
    );
  }
  return url.href.replace(/\/+$/, '');
}

/** Credential identity must come from an authorized, immutable saved configuration, not the client. */
export async function discoverAiGradingModels(
  {
    baseUrl,
    apiKey,
    credentialIdentity,
  }: {
    baseUrl: string;
    apiKey: string;
    credentialIdentity?: { courseInstanceId: string; credentialId: string };
  },
  {
    fetch = publicFetch,
    modelCache = cache,
    timeoutMs = DISCOVERY_TIMEOUT_MS,
  }: { fetch?: PublicFetch; modelCache?: Cache; timeoutMs?: number } = {},
): Promise<string[]> {
  const normalizedUrl = normalizeAiGradingBaseUrl(baseUrl);
  const cacheKey = credentialIdentity
    ? `ai-grading-models:${credentialIdentity.courseInstanceId}:${credentialIdentity.credentialId}`
    : null;
  if (cacheKey) {
    const cached = await modelCache.get<string[]>(cacheKey);
    if (cached !== null) return cached;
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(`${normalizedUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'follow',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      switch (response.status) {
        case 401:
        case 403:
          throw new AiGradingModelDiscoveryError(
            'authentication',
            'The provider rejected the API key. Check the key and try again.',
          );
        case 404:
          throw new AiGradingModelDiscoveryError(
            'not_found',
            'The models endpoint was not found. Check the API base URL and its path.',
          );
        case 429:
          throw new AiGradingModelDiscoveryError(
            'rate_limit',
            'The provider is rate limiting requests. Try again later.',
          );
        default:
          throw new AiGradingModelDiscoveryError(
            'provider_error',
            'The provider could not return its models. Check the endpoint or try again later.',
          );
      }
    }
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new AiGradingModelDiscoveryError(
        'response_too_large',
        'The provider returned a model list that is too large.',
      );
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response.body ?? []) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new AiGradingModelDiscoveryError(
          'response_too_large',
          'The provider returned a model list that is too large.',
        );
      }
      chunks.push(buffer);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } catch {
      throw new AiGradingModelDiscoveryError(
        'invalid_response',
        'The provider returned an invalid model list. Expected JSON with a data array of model IDs.',
      );
    }
    const result = modelListSchema.safeParse(parsed);
    if (!result.success) {
      throw new AiGradingModelDiscoveryError(
        'invalid_response',
        'The provider returned an invalid model list. Expected up to 1,000 models with nonempty IDs of at most 256 characters.',
      );
    }
    const models = [...new Set(result.data.data.map((model) => model.id))].sort();
    if (cacheKey) modelCache.set(cacheKey, models, CACHE_TTL_MS);
    return models;
  } catch (error) {
    if (error instanceof AiGradingModelDiscoveryError) throw error;
    if (signal.aborted) {
      throw new AiGradingModelDiscoveryError(
        'timeout',
        'The provider did not respond in time. Try again or check the endpoint.',
      );
    }
    throw new AiGradingModelDiscoveryError(
      'request_failed',
      'Could not access the provider. Check that the endpoint uses HTTPS and is publicly reachable.',
    );
  }
}

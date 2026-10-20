import { createHash } from 'node:crypto';

import { z } from 'zod';

import { type Cache, cache } from '@prairielearn/cache';
import {
  type PublicFetch,
  ResponseTooLargeError,
  publicFetch,
  readResponseWithLimit,
  validatePublicHttpsUrl,
} from '@prairielearn/public-fetch';

// The timeout follows remote-image-copier.ts. The byte limit follows the JSON result limit in
// externalGraderLocal.ts; count and ID limits additionally bound the catalog retained by the UI.
const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODEL_COUNT = 1000;
const MAX_MODEL_ID_LENGTH = 256;
const CACHE_TTL_MS = 5 * 60 * 1000;

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z
        .string()
        .min(1)
        .refine((id) => id.trim().length > 0),
    }),
  ),
});

export class AiGradingModelDiscoveryError extends Error {
  constructor(
    public readonly code:
      | 'invalid_endpoint'
      | 'authentication'
      | 'access_denied'
      | 'catalog_limit'
      | 'not_found'
      | 'rate_limit'
      | 'request_rejected'
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

export async function discoverAiGradingModels(
  {
    baseUrl,
    apiKey,
    courseInstanceId,
  }: {
    baseUrl: string;
    apiKey: string;
    courseInstanceId: string;
  },
  { fetch = publicFetch, modelCache = cache }: { fetch?: PublicFetch; modelCache?: Cache } = {},
): Promise<string[]> {
  const normalizedUrl = normalizeAiGradingBaseUrl(baseUrl);
  const configurationHash = createHash('sha256')
    .update(JSON.stringify([normalizedUrl, apiKey]))
    .digest('hex');
  const cacheKey = `ai-grading-models:${courseInstanceId}:${configurationHash}`;
  try {
    const cached = await modelCache.get<unknown>(cacheKey);
    const result = z.array(z.string()).safeParse(cached);
    if (result.success) return result.data;
  } catch {
    // Cache failures must not prevent provider discovery.
  }

  const signal = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`${normalizedUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      switch (response.status) {
        case 401:
          throw new AiGradingModelDiscoveryError(
            'authentication',
            'The provider rejected the API key. Check the key and try again.',
          );
        case 403:
          throw new AiGradingModelDiscoveryError(
            'access_denied',
            'Access to the models endpoint was denied. Check the API key permissions and provider access restrictions.',
          );
        case 404:
          throw new AiGradingModelDiscoveryError(
            'not_found',
            'The models endpoint was not found. Check the API base URL and its path.',
          );
        case 429:
          throw new AiGradingModelDiscoveryError(
            'rate_limit',
            'The provider reported a request limit or quota error. Check your provider limits and quota before trying again.',
          );
        default:
          if (response.status >= 400 && response.status < 500) {
            throw new AiGradingModelDiscoveryError(
              'request_rejected',
              'The provider rejected the models request. Check the API base URL and provider configuration.',
            );
          }
          throw new AiGradingModelDiscoveryError(
            'provider_error',
            'The provider could not return its models. Try again later.',
          );
      }
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
      await response.body?.cancel();
      throw new AiGradingModelDiscoveryError(
        'invalid_response',
        'This URL returned a web page instead of an OpenAI-compatible model list. Check your provider API base URL, including /v1 if required.',
      );
    }
    const body = await readResponseWithLimit(response, MAX_RESPONSE_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      throw new AiGradingModelDiscoveryError(
        'invalid_response',
        'The models endpoint did not return valid JSON. Check your provider API base URL.',
      );
    }
    const result = modelListSchema.safeParse(parsed);
    if (!result.success) {
      throw new AiGradingModelDiscoveryError(
        'invalid_response',
        'The models endpoint did not return an OpenAI-compatible model list. Check your provider API base URL.',
      );
    }
    if (result.data.data.length > MAX_MODEL_COUNT) {
      throw new AiGradingModelDiscoveryError(
        'catalog_limit',
        'The model list exceeds the supported limit of 1,000 models.',
      );
    }
    if (result.data.data.some((model) => model.id.length > MAX_MODEL_ID_LENGTH)) {
      throw new AiGradingModelDiscoveryError(
        'catalog_limit',
        'The model list contains an ID longer than the supported limit of 256 characters.',
      );
    }
    const models = [...new Set(result.data.data.map((model) => model.id))].sort();
    modelCache.set(cacheKey, models, CACHE_TTL_MS);
    return models;
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      throw new AiGradingModelDiscoveryError(
        'response_too_large',
        'The models endpoint response exceeds the supported size limit of 1 MB.',
      );
    }
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

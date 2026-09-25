import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

import { createSsrfSafeFetch, normalizeAiEndpointBaseUrl } from './ssrf-safe-fetch.js';

const OpenAiCompatibleModelsResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
      }),
    )
    .default([]),
});

export function createAiGradingOpenAICompatible({
  name,
  baseURL,
  apiKey,
  fetch: fetchFunction,
}: {
  name: string;
  baseURL: string;
  apiKey: string;
  fetch?: typeof fetch;
}) {
  return createOpenAI({
    name,
    baseURL: normalizeAiEndpointBaseUrl(baseURL),
    apiKey,
    fetch: fetchFunction ?? createSsrfSafeFetch(),
  });
}

export async function listOpenAiCompatibleModels({
  baseURL,
  apiKey,
  fetchFunction = createSsrfSafeFetch(),
}: {
  baseURL: string;
  apiKey: string;
  fetchFunction?: typeof fetch;
}): Promise<string[]> {
  const normalized = normalizeAiEndpointBaseUrl(baseURL);
  const response = await fetchFunction(`${normalized}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not list models from the custom endpoint (HTTP ${response.status}). The endpoint must expose GET /models and support structured outputs.`,
    );
  }

  const parsed = OpenAiCompatibleModelsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('The custom endpoint returned an unexpected /models response.');
  }

  return parsed.data.data.map((model) => model.id);
}

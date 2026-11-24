import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { HttpStatusError } from '@prairielearn/error';
import { assertNever } from '@prairielearn/utils';

import type { CourseInstance } from '../../../lib/db-types.js';
import { decryptFromStorage } from '../../../lib/encrypted-storage.js';
import { selectOptionalCredential } from '../../../models/ai-grading-credentials.js';

import { resolveAiGradingKeys } from './ai-grading-credentials.js';
import { createAiGradingFetch } from './ai-grading-fetch.js';
import {
  discoverAiGradingModels,
  normalizeAiGradingBaseUrl,
} from './ai-grading-model-discovery.js';
import { AI_GRADING_MODEL_PROVIDERS } from './ai-grading-models.shared.js';
import { createAiGradingOpenAI } from './ai-grading-openai-provider.js';
import {
  type AiGradingSelection,
  AiGradingSelectionSchema,
} from './ai-grading-selection.shared.js';

export async function resolveAiGradingModel(
  courseInstance: CourseInstance,
  input: AiGradingSelection,
) {
  const selection = AiGradingSelectionSchema.parse(input);
  if (selection.provider === 'openai-compatible') {
    if (!courseInstance.ai_grading_use_custom_api_keys) {
      throw new HttpStatusError(403, 'Custom API keys are not enabled');
    }
    const credential = await selectOptionalCredential({
      course_instance_id: courseInstance.id,
      credential_id: selection.credential_id,
    });
    if (credential?.provider !== 'openai-compatible' || credential.base_url === null) {
      throw new HttpStatusError(
        400,
        'Custom provider configuration no longer available. Select a provider again.',
      );
    }
    const apiKey = decryptFromStorage(credential.encrypted_secret_key);
    const baseUrl = normalizeAiGradingBaseUrl(credential.base_url);
    const models = await discoverAiGradingModels({
      baseUrl,
      apiKey,
      courseInstanceId: courseInstance.id,
    });
    if (!models.includes(selection.model_id)) {
      throw new HttpStatusError(400, 'Model not available from the custom provider');
    }
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: baseUrl,
      apiKey,
      supportsStructuredOutputs: true,
      fetch: createAiGradingFetch(),
    });
    return {
      model: provider(selection.model_id),
      provider: selection.provider,
      base_url: baseUrl,
      credential_id: credential.id,
    };
  }
  const provider = AI_GRADING_MODEL_PROVIDERS[selection.model_id];
  const keys = await resolveAiGradingKeys(courseInstance);
  switch (provider) {
    case 'openai': {
      if (!keys.openai) {
        throw new HttpStatusError(403, 'Model not available (OpenAI API key not provided)');
      }
      return {
        model: createAiGradingOpenAI({
          apiKey: keys.openai.apiKey,
          organization: keys.openai.organization ?? undefined,
        })(selection.model_id),
        provider,
        base_url: null,
        credential_id: null,
      };
    }
    case 'google': {
      if (!keys.google) {
        throw new HttpStatusError(403, 'Model not available (Google API key not provided)');
      }
      return {
        model: createGoogle({ apiKey: keys.google.apiKey })(selection.model_id),
        provider,
        base_url: null,
        credential_id: null,
      };
    }
    case 'anthropic': {
      if (!keys.anthropic) {
        throw new HttpStatusError(403, 'Model not available (Anthropic API key not provided)');
      }
      return {
        model: createAnthropic({ apiKey: keys.anthropic.apiKey })(selection.model_id),
        provider,
        base_url: null,
        credential_id: null,
      };
    }
    default:
      return assertNever(provider);
  }
}

import { z } from 'zod';

import { AI_GRADING_MODEL_IDS, type AiGradingModelId } from './ai-grading-models.shared.js';

const CUSTOM_AI_GRADING_MODEL_PREFIX = 'openai-compatible:';

export type AiGradingModelSelection =
  | { kind: 'first_party'; modelId: AiGradingModelId }
  | { kind: 'openai_compatible'; endpointId: string; modelId: string };

export function encodeAiGradingModelSelection(selection: AiGradingModelSelection): string {
  if (selection.kind === 'first_party') return selection.modelId;
  return `${CUSTOM_AI_GRADING_MODEL_PREFIX}${selection.endpointId}:${selection.modelId}`;
}

export function parseAiGradingModelSelection(raw: string): AiGradingModelSelection | null {
  if ((AI_GRADING_MODEL_IDS as readonly string[]).includes(raw)) {
    return { kind: 'first_party', modelId: raw as AiGradingModelId };
  }

  if (!raw.startsWith(CUSTOM_AI_GRADING_MODEL_PREFIX)) return null;
  const rest = raw.slice(CUSTOM_AI_GRADING_MODEL_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) return null;
  const endpointId = rest.slice(0, separator);
  const modelId = rest.slice(separator + 1);
  if (!/^\d+$/.test(endpointId) || modelId.length === 0) return null;
  return { kind: 'openai_compatible', endpointId, modelId };
}

export const AiGradingModelSelectionSchema = z
  .string()
  .min(1)
  .refine((value) => parseAiGradingModelSelection(value) != null, {
    message: 'Invalid AI grading model',
  });

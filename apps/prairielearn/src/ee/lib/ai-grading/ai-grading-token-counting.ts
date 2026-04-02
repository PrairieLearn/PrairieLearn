import type { ModelMessage } from 'ai';
import { type TiktokenEncoding, getEncoding } from 'js-tiktoken';
import sharp from 'sharp';

import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

import { AI_GRADING_MODEL_PROVIDERS, type AiGradingModelId } from './ai-grading-models.shared.js';

// ---------------------------------------------------------------------------
// OpenAI image token constants
// Source: https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
//
// GPT-5 mini:
// - 32x32 patches capped at 1536 patches
// - tokens = ceil(patches * 1.62)
//
// GPT-5 / GPT-5.1 / o-series:
// - Scale to fit within 2048x2048
// - Then scale shortest side to 768
// - Tile into 512x512 blocks
// - tokens = 140 * tiles + 70
// ---------------------------------------------------------------------------

const OPENAI_MAX_LONG_SIDE = 2048;
const OPENAI_MAX_SHORT_SIDE = 768;
const OPENAI_TILE_SIZE = 512;
const OPENAI_GPT5_TOKENS_PER_TILE = 140;
const OPENAI_GPT5_BASE_TOKENS = 70;

const OPENAI_PATCH_SIZE = 32;
const OPENAI_PATCH_BUDGET = 1536;
const OPENAI_GPT5_MINI_PATCH_MULTIPLIER = 1.62;

// ---------------------------------------------------------------------------
// Google image token constants
// Source: https://ai.google.dev/gemini-api/docs/tokens
// Related: https://ai.google.dev/gemini-api/docs/media-resolution
//
// - Images <= 384x384 cost 258 tokens.
// - Larger images are split into 768x768 tiles, each tile costs 258 tokens.
// ---------------------------------------------------------------------------

const GOOGLE_SMALL_IMAGE_MAX_DIMENSION = 384;
const GOOGLE_TILE_SIZE = 768;
const GOOGLE_TOKENS_PER_TILE = 258;

// ---------------------------------------------------------------------------
// Anthropic image token constants
// Source: https://platform.claude.com/docs/en/build-with-claude/vision
//
// Resize constraints:
// - max side length: 1568 px
// - max area before downscale: ~1.15 megapixels
//
// Tokens: ceil(width * height / 750)
// ---------------------------------------------------------------------------

const ANTHROPIC_MAX_IMAGE_SIDE = 1568;
const ANTHROPIC_MAX_IMAGE_PIXELS = 1_150_000;
const ANTHROPIC_TOKENS_DIVISOR = 750;

// ---------------------------------------------------------------------------
// Tiktoken encoding mapping per provider
// We use different tiktoken encodings to better approximate each provider's
// native tokenizer.
// ---------------------------------------------------------------------------

const PROVIDER_TIKTOKEN_ENCODING: Record<EnumAiGradingProvider, TiktokenEncoding> = {
  openai: 'o200k_base',
  google: 'o200k_base',
  anthropic: 'cl100k_base',
};

/** Fallback character-to-token ratio used when tiktoken fails. */
const FALLBACK_CHARS_PER_TOKEN = 3.04;
/** Fallback per-image token estimate when dimensions cannot be determined. */
const FALLBACK_TOKENS_PER_IMAGE = 1000;

function scaleToLongAndShortEdgeLimits(
  width: number,
  height: number,
): { width: number; height: number } {
  if (Math.max(width, height) > OPENAI_MAX_LONG_SIDE) {
    const scale = OPENAI_MAX_LONG_SIDE / Math.max(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  if (Math.min(width, height) > OPENAI_MAX_SHORT_SIDE) {
    const scale = OPENAI_MAX_SHORT_SIDE / Math.min(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  return { width, height };
}

/**
 * Computes image tokens for GPT-5 / GPT-5.1 / o-series tile-based accounting.
 * Source: https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
 */
export function computeOpenAiGpt5ImageTokens(width: number, height: number): number {
  const scaled = scaleToLongAndShortEdgeLimits(width, height);
  const tilesX = Math.ceil(scaled.width / OPENAI_TILE_SIZE);
  const tilesY = Math.ceil(scaled.height / OPENAI_TILE_SIZE);
  return OPENAI_GPT5_TOKENS_PER_TILE * tilesX * tilesY + OPENAI_GPT5_BASE_TOKENS;
}

/**
 * Computes image tokens for GPT-5 mini patch-based accounting.
 * Source: https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
 */
export function computeOpenAiGpt5MiniImageTokens(width: number, height: number): number {
  let patchesX = Math.ceil(width / OPENAI_PATCH_SIZE);
  let patchesY = Math.ceil(height / OPENAI_PATCH_SIZE);
  let totalPatches = patchesX * patchesY;

  if (totalPatches > OPENAI_PATCH_BUDGET) {
    const scaleFactor = Math.sqrt(
      (OPENAI_PATCH_BUDGET * OPENAI_PATCH_SIZE * OPENAI_PATCH_SIZE) / (width * height),
    );

    const scaledPatchesX = (width * scaleFactor) / OPENAI_PATCH_SIZE;
    const scaledPatchesY = (height * scaleFactor) / OPENAI_PATCH_SIZE;

    const adjustedScaleFactor =
      scaleFactor *
      Math.min(
        Math.floor(scaledPatchesX) / scaledPatchesX,
        Math.floor(scaledPatchesY) / scaledPatchesY,
      );

    width = Math.max(1, Math.floor(width * adjustedScaleFactor));
    height = Math.max(1, Math.floor(height * adjustedScaleFactor));

    patchesX = Math.ceil(width / OPENAI_PATCH_SIZE);
    patchesY = Math.ceil(height / OPENAI_PATCH_SIZE);
    totalPatches = Math.min(patchesX * patchesY, OPENAI_PATCH_BUDGET);
  }

  return Math.ceil(totalPatches * OPENAI_GPT5_MINI_PATCH_MULTIPLIER);
}

/**
 * Computes the Google token cost for a single image.
 * Source: https://ai.google.dev/gemini-api/docs/tokens
 */
export function computeGoogleImageTokens(width: number, height: number): number {
  if (width <= GOOGLE_SMALL_IMAGE_MAX_DIMENSION && height <= GOOGLE_SMALL_IMAGE_MAX_DIMENSION) {
    return GOOGLE_TOKENS_PER_TILE;
  }

  const tilesX = Math.ceil(width / GOOGLE_TILE_SIZE);
  const tilesY = Math.ceil(height / GOOGLE_TILE_SIZE);
  return GOOGLE_TOKENS_PER_TILE * tilesX * tilesY;
}

/**
 * Computes the Anthropic token cost for a single image based on its pixel dimensions.
 * Source: https://platform.claude.com/docs/en/build-with-claude/vision
 */
export function computeAnthropicImageTokens(width: number, height: number): number {
  if (Math.max(width, height) > ANTHROPIC_MAX_IMAGE_SIDE) {
    const scale = ANTHROPIC_MAX_IMAGE_SIDE / Math.max(width, height);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  if (width * height > ANTHROPIC_MAX_IMAGE_PIXELS) {
    const scale = Math.sqrt(ANTHROPIC_MAX_IMAGE_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  return Math.max(1, Math.ceil((width * height) / ANTHROPIC_TOKENS_DIVISOR));
}

function getImageTokenCountForModel(
  width: number,
  height: number,
  modelId: AiGradingModelId,
): number {
  switch (modelId) {
    case 'gpt-5-mini-2025-08-07':
      return computeOpenAiGpt5MiniImageTokens(width, height);
    case 'gpt-5.1-2025-11-13':
      return computeOpenAiGpt5ImageTokens(width, height);
    case 'gemini-3-flash-preview':
    case 'gemini-3.1-pro-preview':
      return computeGoogleImageTokens(width, height);
    case 'claude-haiku-4-5':
    case 'claude-sonnet-4-5':
    case 'claude-opus-4-5':
      return computeAnthropicImageTokens(width, height);
  }
}

/**
 * Counts input tokens for a specific model using local computation only.
 * Text tokens are counted with a tiktoken encoding that approximates the
 * provider's native tokenizer. Image tokens use model-specific formulas.
 *
 * No external API calls are made.
 */
export async function countInputTokensForModel(
  messages: ModelMessage[],
  modelId: AiGradingModelId,
): Promise<number> {
  try {
    const provider = AI_GRADING_MODEL_PROVIDERS[modelId];
    const encoding = PROVIDER_TIKTOKEN_ENCODING[provider];
    const enc = getEncoding(encoding);
    let totalTokens = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalTokens += enc.encode(msg.content).length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            totalTokens += enc.encode(part.text).length;
          } else if (part.type === 'image') {
            totalTokens += await getImageTokensForModel(part, modelId);
          }
        }
      }
      // Per-message overhead (role, delimiters).
      totalTokens += 4;
    }

    return totalTokens;
  } catch {
    return estimateFallbackTokens(messages);
  }
}

async function getImageTokensForModel(
  part: { type: 'image'; image: unknown },
  modelId: AiGradingModelId,
): Promise<number> {
  try {
    const imageData = part.image;
    const buffer =
      typeof imageData === 'string' ? Buffer.from(imageData, 'base64') : (imageData as Buffer);
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return getImageTokenCountForModel(metadata.width, metadata.height, modelId);
    }
    return FALLBACK_TOKENS_PER_IMAGE;
  } catch {
    return FALLBACK_TOKENS_PER_IMAGE;
  }
}

// ---------------------------------------------------------------------------
// Fallback: character-based estimation
// ---------------------------------------------------------------------------

function estimateFallbackTokens(messages: ModelMessage[]): number {
  let totalTextLength = 0;
  let imageCount = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalTextLength += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          totalTextLength += part.text.length;
        } else if (part.type === 'image') {
          imageCount++;
        }
      }
    }
  }

  return (
    Math.ceil(totalTextLength / FALLBACK_CHARS_PER_TOKEN) + imageCount * FALLBACK_TOKENS_PER_IMAGE
  );
}

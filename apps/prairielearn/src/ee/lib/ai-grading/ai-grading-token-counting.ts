import type { ImagePart, ModelMessage } from 'ai';
import { type TiktokenEncoding, getEncoding } from 'js-tiktoken';
import sharp from 'sharp';

import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

import { AI_GRADING_MODEL_PROVIDERS, type AiGradingModelId } from './ai-grading-models.shared.js';

/**
 * Tiktoken encoding mapping per provider.
 *
 * We use different tiktoken encodings to better approximate each provider's
 * native tokenizer, since each provider uses a different vocabulary size and
 * tokenization algorithm:
 *
 * - OpenAI: o200k_base is the native encoding for the GPT-4o / GPT-5 family.
 * - Google: Uses SentencePiece with a ~256k vocabulary. o200k_base (200k vocab)
 *   is the closest available tiktoken encoding in vocabulary density.
 * - Anthropic: Uses BPE with a ~100k vocabulary. cl100k_base (GPT-4/3.5
 *   encoding, 100k vocab) is a closer match than o200k_base.
 */
const PROVIDER_TIKTOKEN_ENCODING: Record<EnumAiGradingProvider, TiktokenEncoding> = {
  openai: 'o200k_base',
  google: 'o200k_base',
  anthropic: 'cl100k_base',
};

/**
 * Counts input tokens for a specific model using local computation only.
 * Text tokens are counted with a tiktoken encoding that approximates the
 * provider's native tokenizer. Image tokens use model-specific formulas.
 *
 * No external API calls are made.
 *
 * @throws {Error} If token counting fails (e.g. corrupted input).
 */
export async function countInputTokensForModel(
  messages: ModelMessage[],
  modelId: AiGradingModelId,
): Promise<number> {
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
}

async function getImageTokensForModel(part: ImagePart, modelId: AiGradingModelId): Promise<number> {
  const imageData = part.image;
  const buffer =
    typeof imageData === 'string' ? Buffer.from(imageData, 'base64') : (imageData as Buffer);
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions');
  }
  return getImageTokenCountForModel(metadata.width, metadata.height, modelId);
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
 * Constants for OpenAI GPT-5 / GPT-5.1 image input token estimation.
 * Source: https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
 *
 * Formula (detail: 'high'):
 *   1. Scale so longest side fits within 2048 px.
 *   2. Scale so shortest side fits within 768 px.
 *   3. Tile into 512x512 blocks; tokens = 140 * tiles + 70.
 */
const OPENAI_MAX_LONG_SIDE = 2048;
const OPENAI_MAX_SHORT_SIDE = 768;
const OPENAI_TILE_SIZE = 512;
const OPENAI_GPT5_TOKENS_PER_TILE = 140;
const OPENAI_GPT5_BASE_TOKENS = 70;

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

export function computeOpenAiGpt5ImageTokens(width: number, height: number): number {
  const scaled = scaleToLongAndShortEdgeLimits(width, height);
  const tilesX = Math.ceil(scaled.width / OPENAI_TILE_SIZE);
  const tilesY = Math.ceil(scaled.height / OPENAI_TILE_SIZE);
  return OPENAI_GPT5_TOKENS_PER_TILE * tilesX * tilesY + OPENAI_GPT5_BASE_TOKENS;
}

/**
 * Constants for OpenAI GPT-5 mini image input token estimation.
 * Source: https://developers.openai.com/api/docs/guides/images-vision#calculating-costs
 *
 * Formula:
 *   - Divide image into 32x32 patches, capped at 1536 patches.
 *   - tokens = ceil(patches * 1.62)
 */
const OPENAI_PATCH_SIZE = 32;
const OPENAI_PATCH_BUDGET = 1536;
const OPENAI_GPT5_MINI_PATCH_MULTIPLIER = 1.62;

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
 * Constants for Google Gemini image input token estimation.
 * Source: https://ai.google.dev/gemini-api/docs/tokens
 * Related: https://ai.google.dev/gemini-api/docs/media-resolution
 *
 * Formula:
 *   - Images <= 384x384 cost a flat 258 tokens.
 *   - Larger images are split into 768x768 tiles, each tile costs 258 tokens.
 */
const GOOGLE_SMALL_IMAGE_MAX_DIMENSION = 384;
const GOOGLE_TILE_SIZE = 768;
const GOOGLE_TOKENS_PER_TILE = 258;

export function computeGoogleImageTokens(width: number, height: number): number {
  if (width <= GOOGLE_SMALL_IMAGE_MAX_DIMENSION && height <= GOOGLE_SMALL_IMAGE_MAX_DIMENSION) {
    return GOOGLE_TOKENS_PER_TILE;
  }

  const tilesX = Math.ceil(width / GOOGLE_TILE_SIZE);
  const tilesY = Math.ceil(height / GOOGLE_TILE_SIZE);
  return GOOGLE_TOKENS_PER_TILE * tilesX * tilesY;
}

/**
 * Constants for Anthropic Claude image input token estimation.
 * Source: https://platform.claude.com/docs/en/build-with-claude/vision
 *
 * Resize constraints:
 *   - No side exceeds 1568 px.
 *   - Total area capped at ~1.15 megapixels before downscaling.
 *
 * Tokens: ceil(width * height / 750)
 */
const ANTHROPIC_MAX_IMAGE_SIDE = 1568;
const ANTHROPIC_MAX_IMAGE_PIXELS = 1_150_000;
const ANTHROPIC_TOKENS_DIVISOR = 750;

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

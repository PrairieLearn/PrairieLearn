import type { ModelMessage } from 'ai';
import { type TiktokenEncoding, encodingForModel } from 'js-tiktoken';
import sharp from 'sharp';

import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

// ---------------------------------------------------------------------------
// OpenAI image token constants
// Source: https://platform.openai.com/docs/guides/vision#calculating-costs
// Formula (detail: 'high'):
//   1. Scale so longest side <= 2048 px.
//   2. Scale so shortest side <= 768 px.
//   3. Tile into 512×512 blocks; tokens = 170 * tiles + 85.
// ---------------------------------------------------------------------------

/** Maximum pixels on the longest side before scaling. */
const OPENAI_MAX_LONG_SIDE = 2048;
/** Maximum pixels on the shortest side after long-side scaling. */
const OPENAI_MAX_SHORT_SIDE = 768;
/** Tile size in pixels for the token grid. */
const OPENAI_TILE_SIZE = 512;
/** Tokens consumed per 512×512 tile. */
const OPENAI_TOKENS_PER_TILE = 170;
/** Fixed base token cost added to every image. */
const OPENAI_IMAGE_BASE_TOKENS = 85;

// ---------------------------------------------------------------------------
// Google image token constant
// Source: https://ai.google.dev/gemini-api/docs/tokens#image-tokens
// All images are charged a flat 258 tokens regardless of resolution.
// ---------------------------------------------------------------------------

const GOOGLE_TOKENS_PER_IMAGE = 258;

// ---------------------------------------------------------------------------
// Anthropic image token constants
// Source: https://docs.anthropic.com/en/docs/build-with-claude/vision#image-costs
// Formula: scale so no side exceeds 1568 px, then tokens = ceil(width * height / 750).
// ---------------------------------------------------------------------------

const ANTHROPIC_MAX_IMAGE_SIDE = 1568;
const ANTHROPIC_TOKENS_DIVISOR = 750;

// ---------------------------------------------------------------------------
// Tiktoken encoding mapping per provider
// We use different tiktoken encodings to better approximate each provider's
// native tokenizer.
//
// - OpenAI: o200k_base is the native encoding for GPT-4o family.
// - Google: SentencePiece with ~256k vocab; o200k_base is the closest match.
// - Anthropic: BPE with ~100k vocab; cl100k_base (GPT-4/3.5) is closer.
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

/**
 * Computes the OpenAI token cost for a single image based on its pixel dimensions.
 * Source: https://platform.openai.com/docs/guides/vision#calculating-costs
 */
export function computeOpenAiImageTokens(width: number, height: number): number {
  // Step 1: Scale so longest side <= 2048
  if (Math.max(width, height) > OPENAI_MAX_LONG_SIDE) {
    const scale = OPENAI_MAX_LONG_SIDE / Math.max(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  // Step 2: Scale so shortest side <= 768
  if (Math.min(width, height) > OPENAI_MAX_SHORT_SIDE) {
    const scale = OPENAI_MAX_SHORT_SIDE / Math.min(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  // Step 3: Tile into 512×512 blocks
  const tilesX = Math.ceil(width / OPENAI_TILE_SIZE);
  const tilesY = Math.ceil(height / OPENAI_TILE_SIZE);
  return OPENAI_TOKENS_PER_TILE * tilesX * tilesY + OPENAI_IMAGE_BASE_TOKENS;
}

/**
 * Computes the Google token cost for a single image.
 * Source: https://ai.google.dev/gemini-api/docs/tokens#image-tokens
 */
function computeGoogleImageTokens(): number {
  return GOOGLE_TOKENS_PER_IMAGE;
}

/**
 * Computes the Anthropic token cost for a single image based on its pixel dimensions.
 * Source: https://docs.anthropic.com/en/docs/build-with-claude/vision#image-costs
 */
function computeAnthropicImageTokens(width: number, height: number): number {
  if (Math.max(width, height) > ANTHROPIC_MAX_IMAGE_SIDE) {
    const scale = ANTHROPIC_MAX_IMAGE_SIDE / Math.max(width, height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  return Math.max(1, Math.ceil((width * height) / ANTHROPIC_TOKENS_DIVISOR));
}

/**
 * Counts input tokens for a specific provider using local computation only.
 * Text tokens are counted with a tiktoken encoding that approximates the
 * provider's native tokenizer. Image tokens use provider-specific formulas.
 *
 * No external API calls are made.
 */
export async function countInputTokensForProvider(
  messages: ModelMessage[],
  provider: EnumAiGradingProvider,
): Promise<number> {
  try {
    const encoding = PROVIDER_TIKTOKEN_ENCODING[provider];
    const enc = encodingForModel(encoding as Parameters<typeof encodingForModel>[0]);
    let totalTokens = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalTokens += enc.encode(msg.content).length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            totalTokens += enc.encode(part.text).length;
          } else if (part.type === 'image') {
            totalTokens += await getImageTokensForProvider(part, provider);
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

/**
 * Returns the image token count for a given provider. For OpenAI and Anthropic
 * this depends on pixel dimensions (read via sharp). For Google it's a flat cost.
 */
async function getImageTokensForProvider(
  part: { type: 'image'; image: unknown },
  provider: EnumAiGradingProvider,
): Promise<number> {
  if (provider === 'google') {
    return computeGoogleImageTokens();
  }

  // OpenAI and Anthropic both need image dimensions.
  try {
    const imageData = part.image;
    const buffer =
      typeof imageData === 'string' ? Buffer.from(imageData, 'base64') : (imageData as Buffer);
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return provider === 'openai'
        ? computeOpenAiImageTokens(metadata.width, metadata.height)
        : computeAnthropicImageTokens(metadata.width, metadata.height);
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

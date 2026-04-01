import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelMessage } from 'ai';
import { encodingForModel } from 'js-tiktoken';
import sharp from 'sharp';

import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

// --- OpenAI image token constants (from OpenAI vision pricing docs, detail: 'high') ---

/** Maximum pixels on the longest side before scaling. */
const OPENAI_MAX_LONG_SIDE = 2048;
/** Maximum pixels on the shortest side after long-side scaling. */
const OPENAI_MAX_SHORT_SIDE = 768;
/** Tile size in pixels for the token grid. */
const OPENAI_TILE_SIZE = 512;
/** Tokens consumed per 512x512 tile. */
const OPENAI_TOKENS_PER_TILE = 170;
/** Fixed base token cost added to every image. */
const OPENAI_IMAGE_BASE_TOKENS = 85;

/** Fallback character-to-token ratio used when a provider API is unavailable. */
const FALLBACK_CHARS_PER_TOKEN = 3.04;
/** Fallback per-image token estimate when dimensions cannot be determined. */
const FALLBACK_TOKENS_PER_IMAGE = 1000;

/**
 * Computes the OpenAI token cost for a single image based on its pixel dimensions.
 * Implements the official OpenAI vision pricing formula for `detail: 'high'`:
 *   1. Scale so the longest side fits within 2048 px.
 *   2. Scale so the shortest side fits within 768 px.
 *   3. Tile into 512×512 blocks; each tile costs 170 tokens plus a base of 85.
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
 * Counts input tokens locally using `js-tiktoken` (OpenAI-compatible tokenizer).
 * No external API calls are made — safe to call without data privacy concerns.
 */
export async function countInputTokensLocal(messages: ModelMessage[]): Promise<number> {
  return countOpenAiTokens(messages);
}

/**
 * Counts input tokens for a specific provider using its native API.
 *
 * - **OpenAI**: local `js-tiktoken` (no API call needed).
 * - **Google**: `@google/generative-ai` SDK `countTokens()` (handles text + images).
 * - **Anthropic**: `@anthropic-ai/sdk` `messages.countTokens()` (handles text + images).
 *
 * Only called on user intent (e.g. hovering a provider) to avoid sending
 * student submission data to providers the instructor hasn't selected.
 */
export async function countInputTokensForProvider(
  messages: ModelMessage[],
  provider: EnumAiGradingProvider,
  apiKey: string | null,
): Promise<number> {
  switch (provider) {
    case 'openai':
      return countOpenAiTokens(messages);
    case 'google':
      return countGoogleTokens(messages, apiKey);
    case 'anthropic':
      return countAnthropicTokens(messages, apiKey);
  }
}

// ---------------------------------------------------------------------------
// OpenAI: local tokenizer + image dimension formula
// ---------------------------------------------------------------------------

async function countOpenAiTokens(messages: ModelMessage[]): Promise<number> {
  try {
    const enc = encodingForModel('gpt-4o');
    let totalTokens = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalTokens += enc.encode(msg.content).length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            totalTokens += enc.encode(part.text).length;
          } else if (part.type === 'image') {
            totalTokens += await getOpenAiImageTokens(part);
          }
        }
      }
      // Per-message overhead (role, delimiters) — OpenAI charges ~4 tokens per message.
      totalTokens += 4;
    }

    return totalTokens;
  } catch (err) {
    void err;
    return estimateFallbackTokens(messages);
  }
}

async function getOpenAiImageTokens(part: { type: 'image'; image: unknown }): Promise<number> {
  try {
    const imageData = part.image;
    const buffer =
      typeof imageData === 'string' ? Buffer.from(imageData, 'base64') : (imageData as Buffer);
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return computeOpenAiImageTokens(metadata.width, metadata.height);
    }
    return FALLBACK_TOKENS_PER_IMAGE;
  } catch {
    return FALLBACK_TOKENS_PER_IMAGE;
  }
}

// ---------------------------------------------------------------------------
// Google: @google/generative-ai SDK countTokens()
// ---------------------------------------------------------------------------

async function countGoogleTokens(messages: ModelMessage[], apiKey: string | null): Promise<number> {
  if (!apiKey) {
    return estimateFallbackTokens(messages);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const contents = convertMessagesToGeminiContents(messages);
    const systemInstruction = extractSystemInstruction(messages);

    const result = await model.countTokens({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
    });

    return result.totalTokens;
  } catch (err) {
    void err;
    return estimateFallbackTokens(messages);
  }
}

function extractSystemInstruction(messages: ModelMessage[]): string | undefined {
  const systemMessages = messages.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) return undefined;
  return systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n');
}

function convertMessagesToGeminiContents(messages: ModelMessage[]): {
  role: string;
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
}[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((msg) => {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image') {
            const data = typeof part.image === 'string' ? part.image : '';
            parts.push({
              inlineData: {
                mimeType:
                  'mediaType' in part && typeof part.mediaType === 'string'
                    ? part.mediaType
                    : 'image/jpeg',
                data,
              },
            });
          }
        }
      }

      return { role, parts };
    });
}

// ---------------------------------------------------------------------------
// Anthropic: @anthropic-ai/sdk messages.countTokens()
// ---------------------------------------------------------------------------

async function countAnthropicTokens(
  messages: ModelMessage[],
  apiKey: string | null,
): Promise<number> {
  if (!apiKey) {
    return estimateFallbackTokens(messages);
  }

  try {
    const client = new Anthropic({ apiKey });

    const { system, convertedMessages } = convertMessagesToAnthropicFormat(messages);

    const result = await client.messages.countTokens({
      model: 'claude-haiku-4-5-20251001',
      messages: convertedMessages,
      ...(system ? { system } : {}),
    });

    return result.input_tokens;
  } catch (err) {
    void err;
    return estimateFallbackTokens(messages);
  }
}

function convertMessagesToAnthropicFormat(messages: ModelMessage[]): {
  system: string | undefined;
  convertedMessages: Anthropic.MessageCreateParams['messages'];
} {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const system = systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n');

  const convertedMessages: Anthropic.MessageCreateParams['messages'] = messages
    .filter((m) => m.role !== 'system')
    .map((msg) => {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';

      if (typeof msg.content === 'string') {
        return { role, content: msg.content };
      }

      const blocks: Anthropic.ContentBlockParam[] = [];
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            blocks.push({ type: 'text', text: part.text });
          } else if (part.type === 'image') {
            const data = typeof part.image === 'string' ? part.image : '';
            const mediaType =
              'mediaType' in part && typeof part.mediaType === 'string'
                ? part.mediaType
                : 'image/jpeg';
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data,
              },
            });
          }
        }
      }

      return { role, content: blocks };
    });

  return { system: system || undefined, convertedMessages };
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

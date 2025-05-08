import * as cheerio from 'cheerio';

import { Cache } from '@prairielearn/cache';

import { config } from './config.js';
import { formatHtmlWithPrettier } from './prettier.js';
/**
 * Processes rendered question HTML to make it suitable for AI grading.
 * This includes removing scripts/stylesheets and attributes that aren't
 * relevant to grading.
 */
export async function stripHtmlForAiGrading(html: string) {
  const $ = cheerio.load(html, null, false);

  // Remove elements that are guaranteed to be irrelevant to grading.
  $('script').remove();
  $('style').remove();
  $('link').remove();
  $('noscript').remove();
  $('svg').remove();

  // Filter out more irrelevant elements/attributes.
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;

    // Remove elements that are hidden from screen readers.
    if ($(el).attr('aria-hidden') === 'true') {
      $(el).remove();
      return;
    }

    $(el).removeAttr('id');
    $(el).removeAttr('class');
    $(el).removeAttr('style');
    for (const name of Object.keys(el.attribs)) {
      if (name.startsWith('data-bs-')) {
        $(el).removeAttr(name);
      }
    }
  });

  // Remove all elements that have no text content.
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    if ($(el).text().trim() === '') {
      $(el).remove();
    }
  });

  const result = $.html();
  if (result.length > 10000) {
    // Prevent denial of service attacks by skipping Prettier formatting
    // if the HTML is too large. 10,000 characters was chosen arbitrarily.
    return html.trim();
  }

  return (await formatHtmlWithPrettier(result)).trim();
}

/**
 * Initializes the AI question generation cache used for rate limiting.
 */
let aiQuestionGenerationCache: Cache | undefined;
export function initializeAiQuestionGenerationCache() {
  // The cache variable is outside the function to avoid creating multiple instances of the same cache in the same process.
  if (aiQuestionGenerationCache) return aiQuestionGenerationCache;
  aiQuestionGenerationCache = new Cache();
  aiQuestionGenerationCache.init({
    type: config.nonVolatileCacheType,
    keyPrefix: config.cacheKeyPrefix,
    redisUrl: config.nonVolatileRedisUrl,
  });
  return aiQuestionGenerationCache;
}

/**
 * Approximate the cost of the prompt, in US dollars.
 * Accounts for the cost of prompt, system, and completion tokens.
 */
export function approximatePromptCost(prompt: string) {
  // There are approximately 4 characters per token (source: https://platform.openai.com/tokenizer),
  // so we divide the length of the prompt by 4 to approximate the number of prompt tokens.
  // Also, on average, we generate 3750 system tokens for each prompt.
  const approxPromptAndSystemTokenCost =
    ((prompt.length / 4 + 3750) * config.costPerMillionPromptTokens) / 1e6;

  // On average, we generate 250 completion tokens for a prompt.
  const approxCompletionTokenCost = (250 * config.costPerMillionCompletionTokens) / 1e6;

  return approxPromptAndSystemTokenCost + approxCompletionTokenCost;
}

/**
 * Retrieve the Redis key for a user's current AI question generation interval usage
 */
function getIntervalUsageKey(userId: number) {
  const intervalStart = Date.now() - (Date.now() % intervalLengthMs);
  return `ai-question-generation-usage:user:${userId}:interval:${intervalStart}`;
}

// 1 hour in milliseconds
const intervalLengthMs = 3600 * 1000;

/**
 * Retrieve the user's AI question generation usage in the last hour interval, in US dollars
 */
export async function getIntervalUsage({
  aiQuestionGenerationCache,
  userId,
}: {
  aiQuestionGenerationCache: Cache;
  userId: number;
}) {
  return (await aiQuestionGenerationCache.get(getIntervalUsageKey(userId))) ?? 0;
}

/**
 * Add the cost of a completion to the usage of the user for the current interval.
 */
export async function addCompletionCostToIntervalUsage({
  aiQuestionGenerationCache,
  userId,
  promptTokens,
  completionTokens,
  intervalCost,
}: {
  aiQuestionGenerationCache: Cache;
  userId: number;
  promptTokens: number;
  completionTokens: number;
  intervalCost: number;
}) {
  const completionCost =
    (config.costPerMillionPromptTokens * (promptTokens ?? 0) +
      config.costPerMillionCompletionTokens * (completionTokens ?? 0)) /
    1e6;

  // Date.now() % intervalLengthMs is the number of milliseconds since the beginning of the interval.
  const timeRemainingInInterval = intervalLengthMs - (Date.now() % intervalLengthMs);

  aiQuestionGenerationCache.set(
    getIntervalUsageKey(userId),
    intervalCost + completionCost,
    timeRemainingInInterval,
  );
}

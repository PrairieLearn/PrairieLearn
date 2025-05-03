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
  if (aiQuestionGenerationCache) return aiQuestionGenerationCache;
  aiQuestionGenerationCache = new Cache();
  aiQuestionGenerationCache.init({
    type: config.cacheTypeAiQuestionGeneration,
    keyPrefix: config.cacheKeyPrefixAiQuestionGeneration,
    redisUrl: config.redisUrlAiQuestionGeneration,
  });
  return aiQuestionGenerationCache;
}

/**
 * Approximate the cost of the prompt tokens, in US dollars.
 */
export function approximatePromptCost(prompt: string) {
  // Multiply the approximate token count by a factor of 1.25 to account for error in the estimate
  const approximatePromptTokenCount = (prompt.length / Math.E) * 1.25;
  return (config.costPerMillionPromptTokens * approximatePromptTokenCount) / 1e6;
}

/**
 * Retrieve the Redis key for a user's current interval usage
 */
function getIntervalUsageKey(userId: number) {
  return `user-${userId}-interval-usage`;
}

/**
 * Retrieve the Redis key for the start of the user's current interval
 */
function getIntervalStartKey(userId: number) {
  return `user-${userId}-interval-start`;
}

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
  let intervalCost = (await aiQuestionGenerationCache.get(getIntervalUsageKey(userId))) ?? 0;

  const currentIntervalStart = Date.now() - (Date.now() % (3600 * 1000));
  const storedIntervalStart = (await aiQuestionGenerationCache.get(getIntervalStartKey(userId))) as
    | number
    | null;

  // If no interval exists or the interval has changed, reset the interval usage
  if (!storedIntervalStart || currentIntervalStart !== storedIntervalStart) {
    aiQuestionGenerationCache.set(getIntervalUsageKey(userId), 0, 3600 * 1000);
    aiQuestionGenerationCache.set(getIntervalStartKey(userId), currentIntervalStart, 3600 * 1000);
    intervalCost = 0;
  }

  return intervalCost;
}

/**
 * Add the cost of a completion to the user's rate limit for the current interval.
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
  aiQuestionGenerationCache.set(
    getIntervalUsageKey(userId),
    intervalCost + completionCost,
    3600 * 1000,
  );
}

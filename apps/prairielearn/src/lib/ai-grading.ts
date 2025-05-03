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
 * Initializes the AI question generation rate limiting cache.
 */
export function initializeAiQuestionGenerationCache() {
  const aiQuestionGenerationCache = new Cache();
  aiQuestionGenerationCache.init({
    type: config.cacheTypeAiQuestionGeneration,
    keyPrefix: config.cacheKeyPrefixAiQuestionGeneration,
    redisUrl: config.redisUrlAiQuestionGeneration,
  });
  return aiQuestionGenerationCache;
}

/**
 * Approximate the cost of the input tokens for a given prompt, in US dollars.
 */
export function approximateInputCost(prompt: string) {
  // 1.25 is a factor to account for the error of the token approximation
  const approximateTokenCount = (prompt.length / Math.E) * 1.25;
  return (config.costPerMillionInputTokens * approximateTokenCount) / 1e6;
}

function getRateLimitKey(userId: number) {
  return `${userId}-rate-limit`;
}

function getRateLimitStartKey(userId: number) {
  return `${userId}-rate-limit-start`;
}

/**
 * Retrieve the AI question generation usage for a user in the current interval.
 */
export async function getIntervalUsage({
  aiQuestionGenerationCache,
  userId,
}: {
  aiQuestionGenerationCache: Cache;
  userId: number;
}) {
  let intervalCost = (await aiQuestionGenerationCache.get(getRateLimitKey(userId))) ?? 0;

  const currentIntervalStart = Date.now() - (Date.now() % (3600 * 1000));
  const storedIntervalStart = (await aiQuestionGenerationCache.get(
    getRateLimitStartKey(userId),
  )) as number | null;

  // If no interval exists, or the interval has changed, reset the rate limit
  if (!storedIntervalStart || currentIntervalStart !== storedIntervalStart) {
    aiQuestionGenerationCache.set(getRateLimitKey(userId), 0, 3600 * 1000);
    aiQuestionGenerationCache.set(getRateLimitStartKey(userId), currentIntervalStart, 3600 * 1000);
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
  inputTokens,
  completionTokens,
  intervalCost,
}: {
  aiQuestionGenerationCache: Cache;
  userId: number;
  inputTokens: number;
  completionTokens: number;
  intervalCost: number;
}) {
  const completionCost =
    (config.costPerMillionInputTokens * (inputTokens ?? 0) +
      config.costPerMillionCompletionTokens * (completionTokens ?? 0)) /
    1e6;
  aiQuestionGenerationCache.set(
    getRateLimitKey(userId),
    intervalCost + completionCost,
    3600 * 1000,
  );
}

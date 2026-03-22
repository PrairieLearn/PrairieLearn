import { type LanguageModelUsage } from 'ai';
import { Redis } from 'ioredis';
import stripAnsi from 'strip-ansi';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { calculateResponseCost } from '../../lib/ai-util.js';
import { config } from '../../lib/config.js';
import { type User } from '../../lib/db-types.js';
import { getAndRenderVariant } from '../../lib/question-render.js';
import type { IssueRenderData } from '../../lib/question-render.types.js';
import { RedisRateLimiter } from '../../lib/redis-rate-limiter.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';
import { selectUserById } from '../../models/user.js';

export type QuestionGenerationModelId = keyof (typeof config)['costPerMillionTokens'];

export const QUESTION_GENERATION_OPENAI_MODEL: QuestionGenerationModelId = 'gpt-5.2-2025-12-11';

export async function checkRender(
  status: 'success' | 'error',
  errors: string[],
  courseId: string,
  userId: string,
  questionId: string,
) {
  // If there was any issue generating the question, we won't yet check rendering.
  if (status === 'error' || errors.length > 0) return [];

  const question = await selectQuestionById(questionId);
  const course = await selectCourseById(courseId);
  const user = await selectUserById(userId);

  const locals = {
    // The URL prefix doesn't matter here since we won't ever show the result to the user.
    urlPrefix: '',
    question,
    course,
    user,
    authn_user: user, // We don't have a separate authn user in this case.
    is_administrator: false,
    // This will be populated with any issues that occur during rendering.
    issues: [] as IssueRenderData[],
  };
  await getAndRenderVariant(null, null, locals, {
    // Needed so that we can read the error output below.
    issuesLoadExtraData: true,
  });

  // Errors should generally have stack traces. If they don't, we'll filter
  // them out, but they may not help us much.
  return locals.issues
    .map((issue) => issue.system_data?.courseErrData?.outputBoth as string | undefined)
    .filter((output) => output !== undefined)
    .map((output) => {
      return `When trying to render, your code created an error with the following output:\n\n\`\`\`${stripAnsi(output)}\`\`\`\n\nPlease fix it.`;
    });
}

const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) {
      // Redis is a hard requirement for AI question generation. We don't attempt
      // to operate without it.
      throw new Error('nonVolatileRedisUrl must be set in config');
    }

    const redis = new Redis(config.nonVolatileRedisUrl);
    redis.on('error', (err) => {
      logger.error('AI question generation Redis error', err);

      // This error could happen during a specific request, but we shouldn't
      // associate it with that request - we just happened to try to set up
      // Redis during a given request. We'll use a fresh scope to capture this.
      Sentry.withScope((scope) => {
        scope.clear();
        Sentry.captureException(err);
      });
    });
    return redis;
  },
  keyPrefix: () => config.cacheKeyPrefix + 'ai-question-generation-usage:',
  intervalSeconds: 3600,
});

/**
 * Retrieve the Redis key for a user's AI question generation interval usage.
 */
function getIntervalUsageKey(user: User) {
  return `user:${user.id}`;
}

/**
 * Retrieve the user's AI question generation usage in the last hour interval, in US dollars
 */
export async function getIntervalUsage(user: User) {
  return rateLimiter.getIntervalUsage(getIntervalUsageKey(user));
}

/**
 * Add the cost of a completion to the usage of the user for the current interval.
 */
export async function addCompletionCostToIntervalUsage({
  user,
  usage,
  model = QUESTION_GENERATION_OPENAI_MODEL,
}: {
  user: User;
  usage: LanguageModelUsage | undefined;
  model?: keyof (typeof config)['costPerMillionTokens'];
}) {
  const completionCost = calculateResponseCost({ model, usage });
  await rateLimiter.addToIntervalUsage(getIntervalUsageKey(user), completionCost);
}

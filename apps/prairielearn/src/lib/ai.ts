import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { config } from './config.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Compute the cost of a completion, in US dollars.
 */
export function computeCompletionCost({
  promptTokens,
  completionTokens,
}: {
  promptTokens: number;
  completionTokens: number;
}) {
  return (
    (config.costPerMillionPromptTokens * promptTokens +
      config.costPerMillionCompletionTokens * completionTokens) /
    1e6
  );
}

/**
 * Create a new course instance usage record for an AI-based completion request.
 */
export async function updateCourseInstanceUsagesForAiCompletion({
  promptId,
  authnUserId,
  promptTokens = 0,
  completionTokens = 0,
}: {
  promptId: string;
  authnUserId: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  await queryAsync(sql.update_course_instance_usages_for_ai_question_generation, {
    prompt_id: promptId,
    authn_user_id: authnUserId,
    cost_ai_question_generation: computeCompletionCost({
      promptTokens,
      completionTokens,
    }),
  });
}
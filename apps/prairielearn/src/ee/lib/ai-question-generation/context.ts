import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { AiQuestionGenerationMessage, Question } from '../../../lib/db-types.js';
import { selectAiQuestionGenerationContextMessages } from '../../models/ai-question-generation-message.js';

const sql = loadSqlEquiv(import.meta.url);

// These numbers were chosen somewhat arbitrarily.
// TODO: replace this with auto-compaction based on context window consumption.
const TRIM_TRIGGER_TOKENS = 50_000;
const TRIM_TARGET_TOKENS = 20_000;

/**
 * Rough estimate of a message's token count based on its serialized parts.
 * Uses the ~4 characters per token heuristic. This estimation is known to be
 * imperfect since (a) it's not performing actual tokenization and (b) the raw
 * JSON doesn't actually end up back in the model's context, but it's sufficient
 * for our purposes.
 */
function estimateMessageTokens(message: AiQuestionGenerationMessage): number {
  return Math.ceil(JSON.stringify(message.parts).length / 4);
}

/**
 * Checks whether the conversation for the given question has grown too large
 * and, if so, marks the oldest messages as excluded from context until the
 * estimated token count drops below the target.
 *
 * Context size is estimated from message content rather than from any actual
 * token counts, because we don't actually have access to the counts per part.
 */
export async function trimContextIfNeeded(question: Question): Promise<void> {
  const contextMessages = await selectAiQuestionGenerationContextMessages(question);

  // Estimate total context size from message content.
  const messageEstimates = contextMessages.map((m) => ({
    id: m.id,
    tokens: estimateMessageTokens(m),
  }));
  const totalEstimatedTokens = messageEstimates.reduce((sum, m) => sum + m.tokens, 0);

  if (totalEstimatedTokens <= TRIM_TRIGGER_TOKENS) return;

  // Walk from oldest to newest, dropping messages until we're under the target.
  let remainingTokens = totalEstimatedTokens;
  const idsToExclude: string[] = [];

  for (const { id, tokens } of messageEstimates) {
    if (remainingTokens <= TRIM_TARGET_TOKENS) break;

    idsToExclude.push(id);
    remainingTokens -= tokens;
  }

  if (idsToExclude.length > 0) {
    await execute(sql.exclude_messages_from_context, { ids: idsToExclude });
  }
}

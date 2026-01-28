import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { AiQuestionGenerationMessage } from '../../../lib/db-types.js';
import { selectAiQuestionGenerationContextMessages } from '../../models/ai-question-generation-message.js';

const sql = loadSqlEquiv(import.meta.url);

// These numbers were chosen somewhat arbitrarily.
// TODO: replace this with auto-compaction based on context window consumption.
const TRIM_TRIGGER_TOKENS = 50_000;
const TRIM_TARGET_TOKENS = 20_000;

/**
 * Rough estimate of a message's token count based on its serialized parts.
 * Uses the ~4 characters per token heuristic.
 *
 * This estimation is known to be imperfect since the raw JSON doesn't actually
 * end up back in the model's context, but it's sufficient for our purposes.
 */
function estimateMessageTokens(message: AiQuestionGenerationMessage): number {
  return Math.ceil(JSON.stringify(message.parts).length / 4);
}

/**
 * Checks whether the conversation for the given question has grown too large
 * and, if so, marks the oldest messages as excluded from context until the
 * estimated token count drops below the target.
 *
 * Context size is estimated from message content (serialized parts length / 4)
 * rather than from `usage_input_tokens`, because usage_input_tokens is the
 * cumulative sum across all tool-loop steps and doesn't represent the actual
 * context window size.
 */
export async function trimContextIfNeeded(questionId: string): Promise<void> {
  const contextMessages = await selectAiQuestionGenerationContextMessages(questionId);

  // Estimate total context size from message content.
  const messageEstimates = contextMessages.map((m) => ({
    id: m.id,
    tokens: estimateMessageTokens(m),
  }));
  const totalEstimatedTokens = messageEstimates.reduce((sum, m) => sum + m.tokens, 0);

  console.log('estimated tokens', totalEstimatedTokens);

  if (totalEstimatedTokens <= TRIM_TRIGGER_TOKENS) return;

  // Walk from oldest to newest, dropping messages until we're under the target.
  let remainingTokens = totalEstimatedTokens;
  const idsToExclude: string[] = [];

  for (const { id, tokens } of messageEstimates) {
    if (remainingTokens <= TRIM_TARGET_TOKENS) break;

    idsToExclude.push(id);
    console.log('excluding message', id, 'with', tokens, 'tokens');
    remainingTokens -= tokens;
  }

  if (idsToExclude.length > 0) {
    await execute(sql.exclude_messages_from_context, { ids: idsToExclude });
  }
}

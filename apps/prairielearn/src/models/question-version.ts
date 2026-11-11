import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { ChunkSchema, QuestionVersionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const QuestionVersionAtDateSchema = z.object({
  chunk: ChunkSchema,
  question_version: QuestionVersionSchema.nullable(),
});

export class QuestionHistoryUnavailableError extends Error {
  constructor(question_id: string, at_date: string) {
    super(`Question history is unavailable for question ${question_id} at ${at_date}.`);
    this.name = 'QuestionHistoryUnavailableError';
  }
}

/**
 * Selects the question's files and settings at a cutoff, including renamed or soft-deleted questions.
 * Pass database timestamps as strings to preserve microsecond precision.
 * Returns null when no chunk covers the cutoff; throws when the selected revision has incomplete history.
 * This lookup does not authorize access to the question.
 */
export async function selectOptionalQuestionVersionAtDate({
  question_id,
  at_date,
}: {
  question_id: string;
  at_date: string;
}) {
  const result = await queryOptionalRow(
    sql.select_question_version_at_date,
    { question_id, at_date },
    QuestionVersionAtDateSchema,
  );
  if (!result) return null;

  // Undated baselines cannot establish when their files and settings became available.
  if (result.chunk.created_at === null || result.question_version === null) {
    throw new QuestionHistoryUnavailableError(question_id, at_date);
  }

  return { chunk: result.chunk, question_version: result.question_version };
}

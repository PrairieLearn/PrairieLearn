import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type VerdictEntry, type VerdictMap, computeCaseId } from './verdicts.js';

const sql = loadSqlEquiv(import.meta.url);

const RowSchema = z.object({
  instance_question_id: z.string(),
  submission_identifier: z.string().nullable(),
  human_descriptions: z.array(z.string()).optional(),
  ai_descriptions: z.array(z.string()).optional(),
  ai_completion: z.unknown().nullable().optional(),
});

type Classification = 'correct' | 'incorrect' | 'unsure';

export interface ClassifiedCase {
  case_id: string;
  submission_identifier: string;
  ai_descriptions: string[];
  ai_explanation: string | null;
  classification: Classification;
  verdict_source: string;
}

/**
 * Pulls the LLM's free-text explanation out of an `ai_grading_jobs.completion`
 * blob. Mirrors the multi-format extraction in
 * `apps/prairielearn/src/ee/lib/ai-grading/ai-grading-util.ts` (chat / response
 * / `ai` package formats). Returns null when no usable explanation is present.
 */
function extractAiExplanation(completion: unknown): string | null {
  if (!completion || typeof completion !== 'object') return null;
  const c = completion as Record<string, any>;
  const trimmed = (s: unknown) => (typeof s === 'string' ? s.trim() || null : null);
  if (Array.isArray(c.choices)) {
    return trimmed(c.choices[0]?.message?.parsed?.explanation);
  }
  if (c.output_parsed) {
    return trimmed(c.output_parsed.explanation);
  }
  if (c.object) {
    return trimmed(c.object.explanation);
  }
  return null;
}

interface ClassificationCounts {
  correct: number;
  incorrect: number;
  unsure: number;
  total: number;
}

export interface ClassifiedRun {
  cases: ClassifiedCase[];
  counts: ClassificationCounts;
  /** correct / (correct + incorrect + unsure). Treats unsure as incorrect. */
  lowerBoundScore: number;
}

export async function seedHumanGradingVerdicts({
  assessment_question_id,
  eval_id,
}: {
  assessment_question_id: string;
  eval_id: string;
}): Promise<VerdictEntry[]> {
  const rows = await queryRows(
    sql.select_human_rubric_selections,
    { assessment_question_id },
    RowSchema,
  );

  const entries: VerdictEntry[] = [];
  for (const row of rows) {
    if (row.submission_identifier == null) continue;
    const descriptions = row.human_descriptions ?? [];
    entries.push({
      case_id: computeCaseId(eval_id, row.submission_identifier, descriptions),
      eval_id,
      submission_identifier: row.submission_identifier,
      rubric_descriptions: [...descriptions].sort(),
      verdict: 'correct',
      source: 'submissions-csv',
      annotator: null,
      timestamp: null,
      notes: null,
    });
  }
  return entries;
}

export async function classifyRun({
  assessment_question_id,
  eval_id,
  verdictMap,
  ai_job_sequence_id,
}: {
  assessment_question_id: string;
  eval_id: string;
  verdictMap: VerdictMap;
  ai_job_sequence_id: string;
}): Promise<ClassifiedRun> {
  const rows = await queryRows(
    sql.select_ai_rubric_selections,
    { assessment_question_id, ai_job_sequence_id },
    RowSchema,
  );

  const cases: ClassifiedCase[] = [];
  const counts: ClassificationCounts = { correct: 0, incorrect: 0, unsure: 0, total: 0 };

  for (const row of rows) {
    if (row.submission_identifier == null) continue;
    const descriptions = row.ai_descriptions ?? [];
    const case_id = computeCaseId(eval_id, row.submission_identifier, descriptions);
    const verdict = verdictMap.get(case_id);
    const classification: Classification = verdict ? verdict.verdict : 'unsure';
    cases.push({
      case_id,
      submission_identifier: row.submission_identifier,
      ai_descriptions: [...descriptions].sort(),
      ai_explanation: extractAiExplanation(row.ai_completion),
      classification,
      verdict_source: verdict?.source ?? 'none',
    });
    counts[classification] += 1;
    counts.total += 1;
  }

  const lowerBoundScore = counts.total === 0 ? 0 : counts.correct / counts.total;

  return { cases, counts, lowerBoundScore };
}

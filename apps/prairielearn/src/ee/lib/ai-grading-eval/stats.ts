import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type ServerJob } from '../../../lib/server-jobs.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import {
  calculateAiGradingStats,
  generateAssessmentAiGradingStats,
} from '../ai-grading/ai-grading-stats.js';

import { type ResolvedTarget } from './resolve-target.js';

const sql = loadSqlEquiv(import.meta.url);

const CostStatsSchema = z.object({
  job_count: z.number(),
  total_cost: z.number(),
  total_prompt_tokens: z.number(),
  total_completion_tokens: z.number(),
  dominant_model: z.string().nullable(),
});
type CostStats = z.infer<typeof CostStatsSchema>;

const TimingStatsSchema = z.object({
  start_date: z.coerce.date(),
  finish_date: z.coerce.date().nullable(),
  duration_seconds: z.coerce.number().nullable(),
});
type TimingStats = z.infer<typeof TimingStatsSchema>;

export interface EvalRunResult {
  evalId: string;
  target: ResolvedTarget;
  aiGradingJobSequenceId: string;
  maxPoints: number;
}

interface EvalStatsSummary {
  evalId: string;
  costJobs: number;
  totalCostDollars: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationSeconds: number | null;
  submissionsScored: number;
  meanPointError: number | null;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '(unknown)';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}m${remainder.toFixed(0)}s`;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

async function collectCostStats(aiGradingJobSequenceId: string): Promise<CostStats> {
  const row = await queryOptionalRow(
    sql.ai_grading_cost_stats,
    { job_sequence_id: aiGradingJobSequenceId },
    CostStatsSchema,
  );
  return (
    row ?? {
      job_count: 0,
      total_cost: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      dominant_model: null,
    }
  );
}

async function collectTimingStats(aiGradingJobSequenceId: string): Promise<TimingStats | null> {
  return await queryOptionalRow(
    sql.job_sequence_timing,
    { job_sequence_id: aiGradingJobSequenceId },
    TimingStatsSchema,
  );
}

function aqDeepLinkPath(target: ResolvedTarget): string {
  return (
    `/pl/course_instance/${target.course_instance.id}/instructor` +
    `/assessment/${target.assessment.id}` +
    `/manual_grading/assessment_question/${target.assessment_question.id}`
  );
}

/**
 * Per-eval stats roll-up. Logs cost, time, accuracy/precision/recall/F1
 * (via PL's existing `generateAssessmentAiGradingStats`), mean point error
 * and per-rubric-item disagreement counts (via `calculateAiGradingStats`),
 * plus a deep link to the AQ's manual-grading page so the user can drill in
 * to per-submission AI-vs-human details in the existing UI.
 *
 * Returns a compact summary the caller aggregates across all evals for the
 * run-wide totals.
 */
async function reportEvalStats(result: EvalRunResult, job: ServerJob): Promise<EvalStatsSummary> {
  const { evalId, target, aiGradingJobSequenceId, maxPoints } = result;

  job.info('');
  job.info(`===== Stats for "${evalId}" =====`);
  job.info(`AQ deep link: ${aqDeepLinkPath(target)}`);
  job.info(`AI grading job sequence: ${aiGradingJobSequenceId}`);

  const [cost, timing] = await Promise.all([
    collectCostStats(aiGradingJobSequenceId),
    collectTimingStats(aiGradingJobSequenceId),
  ]);

  job.info('-- Cost / runtime --');
  job.info(`Submissions graded: ${cost.job_count}`);
  job.info(`Duration: ${formatDuration(timing?.duration_seconds ?? null)}`);
  job.info(`Total cost: $${cost.total_cost.toFixed(4)}`);
  if (cost.job_count > 0) {
    job.info(`Cost / submission: $${(cost.total_cost / cost.job_count).toFixed(6)}`);
  }
  job.info(
    `Tokens: ${cost.total_prompt_tokens.toLocaleString()} prompt / ` +
      `${cost.total_completion_tokens.toLocaleString()} completion`,
  );
  if (cost.dominant_model) {
    job.info(`Model: ${cost.dominant_model}`);
  }

  // Rubric disagreement + mean point error via PL's existing helper.
  const general = await calculateAiGradingStats(target.assessment_question);
  job.info('-- Per-submission point accuracy --');
  job.info(
    `Mean absolute point error vs human: ${general.mean_error ?? '(n/a)'} / ${maxPoints} points ` +
      `(${general.submission_point_count} compared)`,
  );

  const { rubric_items } = await selectCompleteRubric(target.assessment_question.id);
  job.info('-- Per-rubric-item disagreement (AI vs human) --');
  const rubricDenominator = general.submission_rubric_count;
  for (const item of rubric_items) {
    const disagreements = general.rubric_stats[item.id] ?? 0;
    const pct =
      rubricDenominator === 0
        ? '(n/a)'
        : `${((disagreements / rubricDenominator) * 100).toFixed(1)}%`;
    job.info(`  - ${item.description}: ${disagreements} / ${rubricDenominator} (${pct})`);
  }

  // Confusion matrix metrics. generateAssessmentAiGradingStats works at the
  // assessment level; since the harness puts one AQ per assessment, the
  // returned `total` is effectively per-AQ.
  const perf = await generateAssessmentAiGradingStats(target.assessment);
  const total = perf.total;
  job.info('-- Rubric-item confusion matrix (AI vs human) --');
  job.info(`  True positives:  ${total.truePositives}`);
  job.info(`  True negatives:  ${total.trueNegatives}`);
  job.info(`  False positives: ${total.falsePositives}`);
  job.info(`  False negatives: ${total.falseNegatives}`);
  job.info(`  Accuracy:  ${(total.accuracy * 100).toFixed(2)}%`);
  job.info(`  Precision: ${(total.precision * 100).toFixed(2)}%`);
  job.info(`  Recall:    ${(total.recall * 100).toFixed(2)}%`);
  job.info(`  F1 score:  ${(total.f1score * 100).toFixed(2)}%`);

  return {
    evalId,
    costJobs: cost.job_count,
    totalCostDollars: cost.total_cost,
    totalPromptTokens: cost.total_prompt_tokens,
    totalCompletionTokens: cost.total_completion_tokens,
    durationSeconds: timing?.duration_seconds ?? null,
    submissionsScored: general.submission_point_count,
    meanPointError: general.mean_error,
    truePositives: total.truePositives,
    trueNegatives: total.trueNegatives,
    falsePositives: total.falsePositives,
    falseNegatives: total.falseNegatives,
  };
}

/**
 * Emit per-eval stats followed by run-wide totals. Called once at the end of
 * the orchestrator after every eval has been graded.
 */
export async function reportRunStats({
  results,
  job,
}: {
  results: EvalRunResult[];
  job: ServerJob;
}): Promise<void> {
  if (results.length === 0) {
    job.info('No evals were graded — skipping stats.');
    return;
  }

  const summaries: EvalStatsSummary[] = [];
  for (const result of results) {
    summaries.push(await reportEvalStats(result, job));
  }

  const totals = summaries.reduce(
    (acc, s) => {
      acc.costJobs += s.costJobs;
      acc.totalCostDollars += s.totalCostDollars;
      acc.totalPromptTokens += s.totalPromptTokens;
      acc.totalCompletionTokens += s.totalCompletionTokens;
      acc.durationSeconds += s.durationSeconds ?? 0;
      acc.submissionsScored += s.submissionsScored;
      acc.weightedErrorNumerator +=
        s.meanPointError != null ? s.meanPointError * s.submissionsScored : 0;
      acc.weightedErrorDenominator += s.meanPointError != null ? s.submissionsScored : 0;
      acc.tp += s.truePositives;
      acc.tn += s.trueNegatives;
      acc.fp += s.falsePositives;
      acc.fn += s.falseNegatives;
      return acc;
    },
    {
      costJobs: 0,
      totalCostDollars: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      durationSeconds: 0,
      submissionsScored: 0,
      weightedErrorNumerator: 0,
      weightedErrorDenominator: 0,
      tp: 0,
      tn: 0,
      fp: 0,
      fn: 0,
    },
  );

  const aggAccuracy = safeDivide(
    totals.tp + totals.tn,
    totals.tp + totals.tn + totals.fp + totals.fn,
  );
  const aggPrecision = safeDivide(totals.tp, totals.tp + totals.fp);
  const aggRecall = safeDivide(totals.tp, totals.tp + totals.fn);
  const aggF1 = safeDivide(2 * aggPrecision * aggRecall, aggPrecision + aggRecall);
  const weightedMeanError =
    totals.weightedErrorDenominator > 0
      ? totals.weightedErrorNumerator / totals.weightedErrorDenominator
      : null;

  job.info('');
  job.info('===== Run-wide totals =====');
  job.info(`Evals: ${summaries.length}`);
  job.info(`Submissions graded: ${totals.costJobs}`);
  job.info(
    `Total duration (sum of AI-grading job durations): ${formatDuration(totals.durationSeconds)}`,
  );
  job.info(`Total cost: $${totals.totalCostDollars.toFixed(4)}`);
  if (totals.costJobs > 0) {
    job.info(`Cost / submission: $${(totals.totalCostDollars / totals.costJobs).toFixed(6)}`);
  }
  job.info(
    `Tokens: ${totals.totalPromptTokens.toLocaleString()} prompt / ` +
      `${totals.totalCompletionTokens.toLocaleString()} completion`,
  );
  job.info(
    `Weighted mean absolute point error: ${weightedMeanError != null ? weightedMeanError.toFixed(3) : '(n/a)'}`,
  );
  job.info('-- Aggregate rubric-item confusion matrix --');
  job.info(`  True positives:  ${totals.tp}`);
  job.info(`  True negatives:  ${totals.tn}`);
  job.info(`  False positives: ${totals.fp}`);
  job.info(`  False negatives: ${totals.fn}`);
  job.info(`  Accuracy:  ${(aggAccuracy * 100).toFixed(2)}%`);
  job.info(`  Precision: ${(aggPrecision * 100).toFixed(2)}%`);
  job.info(`  Recall:    ${(aggRecall * 100).toFixed(2)}%`);
  job.info(`  F1 score:  ${(aggF1 * 100).toFixed(2)}%`);
}

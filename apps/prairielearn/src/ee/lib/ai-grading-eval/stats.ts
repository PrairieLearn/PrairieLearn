import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
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
  model: string | null;
  costJobs: number;
  totalCostDollars: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationSeconds: number | null;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '(n/a)';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}m${remainder.toFixed(0).padStart(2, '0')}s`;
}

function formatPerSubmissionDuration(totalSeconds: number | null, submissions: number): string {
  if (totalSeconds == null || submissions === 0) return '(n/a)';
  const per = totalSeconds / submissions;
  if (per < 1) return `${(per * 1000).toFixed(0)}ms`;
  if (per < 60) return `${per.toFixed(2)}s`;
  return formatDuration(per);
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatPercent(value: number | null, dp = 2): string {
  return value != null ? `${(value * 100).toFixed(dp)}%` : '(n/a)';
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

function aqDeepLink(target: ResolvedTarget): string {
  const path =
    `/pl/course_instance/${target.course_instance.id}/instructor` +
    `/assessment/${target.assessment.id}` +
    `/manual_grading/assessment_question/${target.assessment_question.id}`;
  const host = (config.serverCanonicalHost ?? '').replace(/\/$/, '');
  return host ? `${host}${path}` : path;
}

/**
 * Two-column resource block:
 *
 *               Total            Per submission
 *     Time      3m07s            0.77s
 *     Cost      $2.4127          $0.0099
 *     Tokens    487,210 prompt   121,548 completion
 */
function renderResourceBlock({
  durationSeconds,
  totalCost,
  totalPromptTokens,
  totalCompletionTokens,
  submissions,
}: {
  durationSeconds: number | null;
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  submissions: number;
}): string {
  const labelWidth = 8;
  const colWidth = 16;
  const header = `${' '.repeat(labelWidth + 2)}` + `${'Total'.padEnd(colWidth)}` + 'Per submission';
  const timeRow =
    `  ${'Time'.padEnd(labelWidth)}` +
    `${formatDuration(durationSeconds).padEnd(colWidth)}` +
    formatPerSubmissionDuration(durationSeconds, submissions);
  const perSubCost = submissions > 0 ? totalCost / submissions : 0;
  const costRow =
    `  ${'Cost'.padEnd(labelWidth)}` +
    `${formatCurrency(totalCost).padEnd(colWidth)}` +
    `${formatCurrency(perSubCost)}`;
  const tokensRow =
    `  ${'Tokens'.padEnd(labelWidth)}` +
    `${totalPromptTokens.toLocaleString()} prompt`.padEnd(colWidth) +
    `${totalCompletionTokens.toLocaleString()} completion`;
  return [header, timeRow, costRow, tokensRow].join('\n');
}

function renderConfusionMatrix({
  tp,
  fp,
  fn,
  tn,
}: {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}): string {
  const rowLabelWidth = 18;
  const colWidth = 17;
  const header =
    `${' '.repeat(rowLabelWidth + 2)}` +
    `${'Human applied'.padEnd(colWidth)}` +
    'Human did not apply';
  const aiAppliedRow =
    `  ${'AI applied'.padEnd(rowLabelWidth)}` + `${String(tp).padEnd(colWidth)}` + `${fp}`;
  const aiDidNotApplyRow =
    `  ${'AI did not apply'.padEnd(rowLabelWidth)}` + `${String(fn).padEnd(colWidth)}` + `${tn}`;
  return [header, aiAppliedRow, aiDidNotApplyRow].join('\n');
}

function renderClassificationMetrics({
  accuracy,
  precision,
  recall,
  f1,
}: {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}): string {
  const left = (label: string, value: number | null) =>
    `${label.padEnd(11)}${formatPercent(value)}`;
  return [
    `    ${left('Accuracy', accuracy)}      ${left('Precision', precision)}`,
    `    ${left('Recall', recall)}      ${left('F1 score', f1)}`,
  ].join('\n');
}

/**
 * Per-eval stats block. Mirrors the run-wide block's grammar so the two read
 * as one template.
 */
async function reportEvalStats(result: EvalRunResult, job: ServerJob): Promise<EvalStatsSummary> {
  const { evalId, target, aiGradingJobSequenceId } = result;

  const [cost, timing, general, perf, rubric] = await Promise.all([
    collectCostStats(aiGradingJobSequenceId),
    collectTimingStats(aiGradingJobSequenceId),
    calculateAiGradingStats(target.assessment_question),
    generateAssessmentAiGradingStats(target.assessment),
    selectCompleteRubric(target.assessment_question.id),
  ]);

  const total = perf.total;
  const submissions = cost.job_count;
  const durationSeconds = timing?.duration_seconds ?? null;

  job.info('');
  job.info(`─── ${evalId} ${'─'.repeat(Math.max(4, 70 - evalId.length))}`);
  job.info(`  Question     ${aqDeepLink(target)}`);
  job.info(`  Model        ${cost.dominant_model ?? '(unknown)'}`);
  job.info(`  Submissions  ${submissions}`);
  job.info('');
  job.info(
    renderResourceBlock({
      durationSeconds,
      totalCost: cost.total_cost,
      totalPromptTokens: cost.total_prompt_tokens,
      totalCompletionTokens: cost.total_completion_tokens,
      submissions,
    }),
  );

  job.info('');
  job.info("  Rubric-item agreement (AI matched the human's decision on each item)");
  const denom = general.submission_rubric_count;
  const descWidth =
    rubric.rubric_items.length > 0
      ? Math.max(...rubric.rubric_items.map((i) => i.description.length))
      : 0;
  for (const item of rubric.rubric_items) {
    const disagree = general.rubric_stats[item.id] ?? 0;
    const agree = denom - disagree;
    const pct = denom === 0 ? '(n/a)' : `${Math.round((agree / denom) * 100)}% agree`;
    const ratio = denom === 0 ? '(n/a)' : `${agree} / ${denom}`;
    job.info(`    ${item.description.padEnd(descWidth)}   ${ratio.padStart(11)}    ${pct}`);
  }

  job.info('');
  job.info('  Confusion matrix (rubric-item decisions across all submissions)');
  job.info(
    renderConfusionMatrix({
      tp: total.truePositives,
      fp: total.falsePositives,
      fn: total.falseNegatives,
      tn: total.trueNegatives,
    }),
  );
  job.info('');
  job.info(
    renderClassificationMetrics({
      accuracy: total.accuracy,
      precision: total.precision,
      recall: total.recall,
      f1: total.f1score,
    }),
  );

  return {
    evalId,
    model: cost.dominant_model,
    costJobs: cost.job_count,
    totalCostDollars: cost.total_cost,
    totalPromptTokens: cost.total_prompt_tokens,
    totalCompletionTokens: cost.total_completion_tokens,
    durationSeconds,
    truePositives: total.truePositives,
    trueNegatives: total.trueNegatives,
    falsePositives: total.falsePositives,
    falseNegatives: total.falseNegatives,
  };
}

/**
 * Compute per-eval classification metrics, then take an unweighted mean
 * across evals (macro-average). A large well-graded eval can't hide a
 * smaller poorly-graded one. Evals with zero denominators in a given metric
 * are skipped for that metric, not zero-substituted.
 */
function macroMetrics(summaries: EvalStatsSummary[]) {
  const per = summaries.map((s) => {
    const total = s.truePositives + s.trueNegatives + s.falsePositives + s.falseNegatives;
    const precDenom = s.truePositives + s.falsePositives;
    const recDenom = s.truePositives + s.falseNegatives;
    const precision = precDenom > 0 ? s.truePositives / precDenom : null;
    const recall = recDenom > 0 ? s.truePositives / recDenom : null;
    const accuracy = total > 0 ? (s.truePositives + s.trueNegatives) / total : null;
    const f1 =
      precision != null && recall != null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;
    return { accuracy, precision, recall, f1 };
  });
  const mean = (vals: (number | null)[]) => {
    const finite = vals.filter((v): v is number => v != null);
    return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length;
  };
  return {
    accuracy: mean(per.map((m) => m.accuracy)),
    precision: mean(per.map((m) => m.precision)),
    recall: mean(per.map((m) => m.recall)),
    f1: mean(per.map((m) => m.f1)),
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

  const resourceTotals = summaries.reduce(
    (acc, s) => {
      acc.costJobs += s.costJobs;
      acc.totalCostDollars += s.totalCostDollars;
      acc.totalPromptTokens += s.totalPromptTokens;
      acc.totalCompletionTokens += s.totalCompletionTokens;
      acc.durationSeconds += s.durationSeconds ?? 0;
      return acc;
    },
    {
      costJobs: 0,
      totalCostDollars: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      durationSeconds: 0,
    },
  );

  const distinctModels = [
    ...new Set(summaries.map((s) => s.model).filter((m): m is string => m != null)),
  ];
  const modelsLine = distinctModels.length === 0 ? '(unknown)' : distinctModels.join(', ');

  const macro = macroMetrics(summaries);

  job.info('');
  job.info(`═══ Run-wide totals ${'═'.repeat(60)}`);
  job.info(`  Evals        ${summaries.length}`);
  job.info(`  Models       ${modelsLine}`);
  job.info(`  Submissions  ${resourceTotals.costJobs}`);
  job.info('');
  job.info(
    renderResourceBlock({
      durationSeconds: resourceTotals.durationSeconds,
      totalCost: resourceTotals.totalCostDollars,
      totalPromptTokens: resourceTotals.totalPromptTokens,
      totalCompletionTokens: resourceTotals.totalCompletionTokens,
      submissions: resourceTotals.costJobs,
    }),
  );
  job.info('');
  job.info('  Classification metrics (averaged across evals)');
  job.info(renderClassificationMetrics(macro));
}

import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { type ServerJob } from '../../../lib/server-jobs.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';
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

export interface EvalModelRun {
  model: AiGradingModelId;
  aiGradingJobSequenceId: string;
}

export interface EvalRunResult {
  evalId: string;
  target: ResolvedTarget;
  maxPoints: number;
  runs: EvalModelRun[];
}

interface ModelRunSummary {
  evalId: string;
  model: AiGradingModelId;
  costJobs: number;
  totalCostDollars: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationSeconds: number | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
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

function renderTable(headers: string[], rows: string[][], widths: number[]): string[] {
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('');
  const dividerLine = widths.map((w) => '─'.repeat(Math.max(1, w - 1))).join(' ');
  const dataLines = rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join(''));
  return ['  ' + headerLine, '  ' + dividerLine, ...dataLines.map((l) => '  ' + l)];
}

/**
 * Snapshots stats for a single (eval × model) run. Must be called *before*
 * the next model overwrites the AI grading on each instance question, since
 * `calculateAiGradingStats` / `generateAssessmentAiGradingStats` read the
 * latest grading job per IQ.
 */
export async function snapshotModelRunStats({
  evalId,
  model,
  target,
  aiGradingJobSequenceId,
  job,
}: {
  evalId: string;
  model: AiGradingModelId;
  target: ResolvedTarget;
  aiGradingJobSequenceId: string;
  job: ServerJob;
}): Promise<ModelRunSummary> {
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
  const header = `${evalId} / ${model}`;
  job.info(`─── ${header} ${'─'.repeat(Math.max(4, 70 - header.length))}`);
  job.info(`  Question     ${aqDeepLink(target)}`);
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
    model,
    costJobs: cost.job_count,
    totalCostDollars: cost.total_cost,
    totalPromptTokens: cost.total_prompt_tokens,
    totalCompletionTokens: cost.total_completion_tokens,
    durationSeconds,
    accuracy: total.accuracy,
    precision: total.precision,
    recall: total.recall,
    f1: total.f1score,
    truePositives: total.truePositives,
    trueNegatives: total.trueNegatives,
    falsePositives: total.falsePositives,
    falseNegatives: total.falseNegatives,
  };
}

function mean(vals: (number | null)[]): number | null {
  const finite = vals.filter((v): v is number => v != null);
  return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length;
}

function aggregateByModel(summaries: ModelRunSummary[]) {
  const byModel = new Map<AiGradingModelId, ModelRunSummary[]>();
  for (const s of summaries) {
    const existing = byModel.get(s.model);
    if (existing) {
      existing.push(s);
    } else {
      byModel.set(s.model, [s]);
    }
  }
  return [...byModel.entries()].map(([model, runs]) => {
    const submissions = runs.reduce((a, r) => a + r.costJobs, 0);
    const totalCost = runs.reduce((a, r) => a + r.totalCostDollars, 0);
    const totalDuration = runs.reduce((a, r) => a + (r.durationSeconds ?? 0), 0);
    return {
      model,
      submissions,
      totalCost,
      totalDuration,
      accuracy: mean(runs.map((r) => r.accuracy)),
      precision: mean(runs.map((r) => r.precision)),
      recall: mean(runs.map((r) => r.recall)),
      f1: mean(runs.map((r) => r.f1)),
    };
  });
}

/**
 * Per-eval table comparing each model's classification + resource numbers.
 */
function renderPerEvalModelTable(summaries: ModelRunSummary[]): string[] {
  const headers = ['Model', 'Acc', 'Prec', 'Rec', 'F1', 'Cost', '/sub'];
  const widths = [26, 9, 9, 9, 9, 11, 9];
  const rows = summaries.map((s) => {
    const perSubCost = s.costJobs > 0 ? s.totalCostDollars / s.costJobs : 0;
    return [
      s.model,
      formatPercent(s.accuracy, 1),
      s.precision != null ? s.precision.toFixed(2) : '(n/a)',
      s.recall != null ? s.recall.toFixed(2) : '(n/a)',
      s.f1 != null ? s.f1.toFixed(2) : '(n/a)',
      formatCurrency(s.totalCostDollars),
      formatCurrency(perSubCost),
    ];
  });
  return renderTable(headers, rows, widths);
}

/**
 * Run-wide table: one row per model, macro-averaged across all evals.
 */
function renderRunWideModelTable(aggregated: ReturnType<typeof aggregateByModel>): string[] {
  const headers = [
    'Model',
    'Acc',
    'Prec',
    'Rec',
    'F1',
    'Total cost',
    'Cost/sub',
    'Total time',
    'Time/sub',
  ];
  const widths = [26, 9, 9, 9, 9, 12, 11, 12, 10];
  const rows = aggregated.map((a) => {
    const perSubCost = a.submissions > 0 ? a.totalCost / a.submissions : 0;
    return [
      a.model,
      formatPercent(a.accuracy, 1),
      a.precision != null ? a.precision.toFixed(2) : '(n/a)',
      a.recall != null ? a.recall.toFixed(2) : '(n/a)',
      a.f1 != null ? a.f1.toFixed(2) : '(n/a)',
      formatCurrency(a.totalCost),
      formatCurrency(perSubCost),
      formatDuration(a.totalDuration),
      formatPerSubmissionDuration(a.totalDuration, a.submissions),
    ];
  });
  return renderTable(headers, rows, widths);
}

/**
 * Emit cross-model comparison tables. Per-(eval×model) detail blocks have
 * already been streamed via `snapshotModelRunStats` as each grading run
 * completed; this is the final roll-up.
 */
export function reportRunStats({
  results,
  summaries,
  job,
}: {
  results: EvalRunResult[];
  summaries: ModelRunSummary[];
  job: ServerJob;
}): void {
  if (summaries.length === 0) {
    job.info('No (eval × model) runs were graded — skipping stats.');
    return;
  }

  job.info('');
  job.info(`═══ Per-eval cross-model comparison ${'═'.repeat(45)}`);
  for (const result of results) {
    const evalSummaries = summaries.filter((s) => s.evalId === result.evalId);
    if (evalSummaries.length === 0) continue;
    job.info('');
    job.info(`  ${result.evalId}`);
    for (const line of renderPerEvalModelTable(evalSummaries)) {
      job.info(line);
    }
  }

  const aggregated = aggregateByModel(summaries);
  const distinctEvals = new Set(summaries.map((s) => s.evalId)).size;

  job.info('');
  job.info(`═══ Run-wide totals ${'═'.repeat(60)}`);
  job.info(`  Evals    ${distinctEvals}`);
  job.info(`  Models   ${aggregated.length}`);
  job.info('');
  for (const line of renderRunWideModelTable(aggregated)) {
    job.info(line);
  }
}

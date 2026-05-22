import { groupBy } from 'es-toolkit';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { type ServerJob } from '../../../lib/server-jobs.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';

import { type ClassifiedRun } from './classify.js';
import { type ResolvedTarget } from './resolve-target.js';
import { type RunSnapshot, SCHEMA_VERSION } from './snapshot.js';
import { type VerdictEntry } from './verdicts.js';

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

export interface ModelRunSummary {
  evalId: string;
  model: AiGradingModelId;
  costJobs: number;
  totalCostDollars: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationSeconds: number | null;
  correctCount: number;
  incorrectCount: number;
  unsureCount: number;
  /**
   * Percentage of submission gradings a human said were correct. Computed as
   * correct / (correct + incorrect + unsure) — unsure cases count against
   * the score until a reviewer resolves them.
   */
  score: number;
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

function renderTable(headers: string[], rows: string[][], widths: number[]): string[] {
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('');
  const dividerLine = widths.map((w) => '─'.repeat(Math.max(1, w - 1))).join(' ');
  const dataLines = rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join(''));
  return ['  ' + headerLine, '  ' + dividerLine, ...dataLines.map((l) => '  ' + l)];
}

/**
 * Inputs needed to render a single (eval × model) detail block + emit a
 * `ModelRunSummary`. Decoupled from DB / snapshot loading so both the live
 * grading path and the verdict-upload recompute path call the same renderer
 * and produce byte-identical output.
 */
interface ModelRunRenderInputs {
  evalId: string;
  model: AiGradingModelId;
  deepLink: string | null;
  cost: CostStats;
  timing: { duration_seconds: number | null } | null;
  classified: ClassifiedRun;
}

function renderModelRunStats({
  inputs,
  job,
}: {
  inputs: ModelRunRenderInputs;
  job: ServerJob;
}): ModelRunSummary {
  const { evalId, model, deepLink, cost, timing, classified } = inputs;

  const submissions = cost.job_count;
  const durationSeconds = timing?.duration_seconds ?? null;

  job.info('');
  const header = `${evalId} / ${model}`;
  job.info(`─── ${header} ${'─'.repeat(Math.max(4, 70 - header.length))}`);
  if (deepLink) {
    job.info(`  Question     ${deepLink}`);
  }
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
  job.info('  Submission classification (correct = AI grading matched a human-confirmed grading)');
  job.info(
    `    Correct    ${classified.counts.correct}` +
      `    Incorrect  ${classified.counts.incorrect}` +
      `    Unsure     ${classified.counts.unsure}` +
      `    Score  ${formatPercent(classified.lowerBoundScore, 1)}`,
  );

  return {
    evalId,
    model,
    costJobs: cost.job_count,
    totalCostDollars: cost.total_cost,
    totalPromptTokens: cost.total_prompt_tokens,
    totalCompletionTokens: cost.total_completion_tokens,
    durationSeconds,
    correctCount: classified.counts.correct,
    incorrectCount: classified.counts.incorrect,
    unsureCount: classified.counts.unsure,
    score: classified.lowerBoundScore,
  };
}

/**
 * Snapshots stats for a single (eval × model) run. Must be called *before*
 * the next model overwrites the AI grading on each instance question.
 *
 * Returns both the rendered `ModelRunSummary` (used to build the run-wide
 * tables) and a serializable `RunSnapshot` (persisted to the eval repo so
 * verdict re-uploads can re-render these stats without re-running grading).
 */
export async function snapshotModelRunStats({
  evalId,
  model,
  target,
  aiGradingJobSequenceId,
  classified,
  seedVerdicts,
  job,
}: {
  evalId: string;
  model: AiGradingModelId;
  target: ResolvedTarget;
  aiGradingJobSequenceId: string;
  classified: ClassifiedRun;
  seedVerdicts: VerdictEntry[];
  job: ServerJob;
}): Promise<{ summary: ModelRunSummary; snapshot: RunSnapshot }> {
  const [cost, timing] = await Promise.all([
    collectCostStats(aiGradingJobSequenceId),
    collectTimingStats(aiGradingJobSequenceId),
  ]);

  const deepLink = aqDeepLink(target);

  const summary = renderModelRunStats({
    inputs: { evalId, model, deepLink, cost, timing, classified },
    job,
  });

  const snapshot: RunSnapshot = {
    schema_version: SCHEMA_VERSION,
    eval_id: evalId,
    model,
    ai_job_sequence_id: aiGradingJobSequenceId,
    timestamp: new Date().toISOString(),
    deep_link: deepLink,
    cases: classified.cases.map((c) => ({
      case_id: c.case_id,
      submission_identifier: c.submission_identifier,
      ai_descriptions: c.ai_descriptions,
      ai_explanation: c.ai_explanation,
    })),
    cost,
    timing: timing
      ? {
          start_date: timing.start_date.toISOString(),
          finish_date: timing.finish_date?.toISOString() ?? null,
          duration_seconds: timing.duration_seconds,
        }
      : null,
    seed_verdicts: seedVerdicts.map((v) => ({
      case_id: v.case_id,
      submission_identifier: v.submission_identifier,
      rubric_descriptions: v.rubric_descriptions,
    })),
  };

  return { summary, snapshot };
}

/**
 * Re-renders stats from a persisted snapshot using a freshly-recomputed
 * `ClassifiedRun` (with the latest verdict map applied). The output goes
 * through the same renderer used during live grading, so the format is
 * byte-identical.
 */
export function renderModelRunStatsFromSnapshot({
  snapshot,
  classified,
  job,
}: {
  snapshot: RunSnapshot;
  classified: ClassifiedRun;
  job: ServerJob;
}): ModelRunSummary {
  return renderModelRunStats({
    inputs: {
      evalId: snapshot.eval_id,
      model: snapshot.model as AiGradingModelId,
      deepLink: snapshot.deep_link,
      cost: snapshot.cost,
      timing: snapshot.timing,
      classified,
    },
    job,
  });
}

function aggregateByModel(summaries: ModelRunSummary[]) {
  return Object.entries(groupBy(summaries, (s) => s.model)).map(([model, runs]) => {
    const correctCount = runs.reduce((a, r) => a + r.correctCount, 0);
    const incorrectCount = runs.reduce((a, r) => a + r.incorrectCount, 0);
    const unsureCount = runs.reduce((a, r) => a + r.unsureCount, 0);
    const classifiedTotal = correctCount + incorrectCount + unsureCount;
    return {
      model: model as AiGradingModelId,
      submissions: runs.reduce((a, r) => a + r.costJobs, 0),
      totalCost: runs.reduce((a, r) => a + r.totalCostDollars, 0),
      totalDuration: runs.reduce((a, r) => a + (r.durationSeconds ?? 0), 0),
      correctCount,
      incorrectCount,
      unsureCount,
      score: classifiedTotal === 0 ? 0 : correctCount / classifiedTotal,
    };
  });
}

/**
 * Per-eval table comparing each model's classification + resource numbers.
 */
function renderPerEvalModelTable(summaries: ModelRunSummary[]): string[] {
  const headers = [
    'Model',
    'Correct',
    'Incorrect',
    'Score',
    'Cost',
    'Cost/sub',
    'Time',
    'Time/sub',
  ];
  const widths = [26, 9, 11, 9, 11, 11, 11, 11];
  const rows = summaries.map((s) => {
    const perSubCost = s.costJobs > 0 ? s.totalCostDollars / s.costJobs : 0;
    return [
      s.model,
      String(s.correctCount),
      String(s.incorrectCount + s.unsureCount),
      formatPercent(s.score, 1),
      formatCurrency(s.totalCostDollars),
      formatCurrency(perSubCost),
      formatDuration(s.durationSeconds),
      formatPerSubmissionDuration(s.durationSeconds, s.costJobs),
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
    'Correct',
    'Incorrect',
    'Score',
    'Total cost',
    'Cost/sub',
    'Total time',
    'Time/sub',
  ];
  const widths = [26, 9, 11, 9, 12, 11, 12, 11];
  const rows = aggregated.map((a) => {
    const perSubCost = a.submissions > 0 ? a.totalCost / a.submissions : 0;
    return [
      a.model,
      String(a.correctCount),
      String(a.incorrectCount + a.unsureCount),
      formatPercent(a.score, 1),
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
  summaries,
  verdictFilesByEval,
  annotationPacketsByEval,
  job,
}: {
  summaries: ModelRunSummary[];
  verdictFilesByEval?: Map<string, Map<string, number>>;
  annotationPacketsByEval?: Map<string, string>;
  job: ServerJob;
}): void {
  if (summaries.length === 0) {
    job.info('No (eval × model) runs were graded — skipping stats.');
    return;
  }

  const byEval = groupBy(summaries, (s) => s.evalId);

  job.info('');
  job.info(`═══ Per-eval cross-model comparison ${'═'.repeat(45)}`);
  job.info('  Note: "Score" = percentage of submission gradings a human said were correct');
  job.info('        (unsure cases count as incorrect until a reviewer resolves them).');
  for (const [evalId, evalSummaries] of Object.entries(byEval)) {
    job.info('');
    job.info(`  ${evalId}`);
    for (const line of renderPerEvalModelTable(evalSummaries)) {
      job.info(line);
    }
  }

  if (annotationPacketsByEval && annotationPacketsByEval.size > 0) {
    job.info('');
    job.info(`═══ Annotation packets ${'═'.repeat(57)}`);
    for (const [evalId, packetPath] of annotationPacketsByEval) {
      job.info('');
      job.info(`  ${evalId}`);
      job.info(`    ${packetPath}`);
    }
  }

  if (verdictFilesByEval && verdictFilesByEval.size > 0) {
    job.info('');
    job.info(`═══ Verdicts loaded ${'═'.repeat(60)}`);
    for (const [evalId, files] of verdictFilesByEval) {
      job.info('');
      job.info(`  ${evalId}`);
      for (const [filename, rowCount] of files) {
        job.info(`    ${filename}  (${rowCount} row${rowCount === 1 ? '' : 's'})`);
      }
    }
  }

  const aggregated = aggregateByModel(summaries);

  job.info('');
  job.info(`═══ Run-wide totals ${'═'.repeat(60)}`);
  job.info(`  Evals    ${Object.keys(byEval).length}`);
  job.info(`  Models   ${aggregated.length}`);
  job.info('');
  for (const line of renderRunWideModelTable(aggregated)) {
    job.info(line);
  }
}

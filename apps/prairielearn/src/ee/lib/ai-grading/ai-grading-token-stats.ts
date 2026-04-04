import type { GenerateObjectResult, LanguageModelUsage, ModelMessage } from 'ai';
import { type Tiktoken, getEncoding } from 'js-tiktoken';
import sharp from 'sharp';

import { calculateCostWithFeeMilliDollars } from '../../../lib/ai-grading-credits.js';
import { calculateResponseCost } from '../../../lib/ai-util.js';
import { config } from '../../../lib/config.js';
import type { RubricItem } from '../../../lib/db-types.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import type { CounterClockwiseRotationDegrees } from './types.js';

export interface SubmissionTokenStats {
  /** Unique ID of the instance question being graded. */
  instanceQuestionId: string;
  /** ID of the assessment question (shared across all students for the same question). */
  assessmentQuestionId: string;
  /** LLM model ID used for grading (e.g. "gpt-5-mini-2025-08-07"). */
  modelId: string;

  // --- Input text characteristics (known before the LLM call) ---

  /** Character count of the rendered submission HTML (the student's answer as HTML). */
  submissionTextChars: number;
  /** Character count of the rendered question prompt HTML shown to the student. */
  questionPromptChars: number;
  /** Character count of the rendered instructor answer HTML. */
  questionAnswerChars: number;
  /** Character count of the rendered grader guidelines. 0 if no guidelines are set. */
  graderGuidelinesChars: number;

  // --- Image characteristics (known before the LLM call) ---

  /** Number of images submitted by the student (via pl-image-capture). */
  imageCount: number;
  /** Pixel dimensions (width x height) of each submitted image, obtained via sharp. */
  imageDimensions: { width: number; height: number }[];
  /** Base64-encoded string length of each submitted image (proxy for image file size). */
  imageBase64Lengths: number[];

  // --- Rubric characteristics (known before the LLM call) ---

  /** Number of rubric items used for grading. 0 for score-based (non-rubric) grading. */
  rubricItemCount: number;
  /** Total character count across all rubric item descriptions, explanations, and grader notes. */
  rubricTotalChars: number;
  /** Approximate token count of all rubric text, estimated via js-tiktoken (o200k_base encoding). */
  estimatedRubricTokens: number;

  // --- Token usage from the final grading LLM response (real values from the API) ---

  /** Total input tokens reported by the API for the final grading call. Includes text + image tokens. */
  inputTokens: number;
  /** Total output tokens reported by the API for the final grading call. */
  outputTokens: number;
  /** Output tokens that are text (non-reasoning), as reported by the API. */
  outputTextTokens: number;
  /** Output tokens used for chain-of-thought reasoning, as reported by the API. */
  reasoningTokens: number;
  /** Input tokens served from the provider's prompt cache (reduces cost). */
  cacheReadTokens: number;
  /** Input tokens written to the provider's prompt cache. */
  cacheWriteTokens: number;
  /** Total tokens (input + output) as reported by the API. */
  totalTokens: number;

  // --- Derived token breakdown (computed, not directly from API) ---

  /** Total character count of ALL text in the full prompt (system messages, rubric, question, submission, etc.). */
  promptTextChars: number;
  /** Approximate token count of all text in the prompt, estimated via js-tiktoken (o200k_base). Exact for OpenAI models, approximate for others. */
  estimatedPromptTextTokens: number;
  /** Estimated image tokens: max(0, inputTokens - estimatedPromptTextTokens). Derives image cost by subtracting text tokens from real total. */
  estimatedImageTokens: number;

  // --- Output characteristics (only known after the LLM call) ---

  /** Character count of the LLM's explanation (instructor-facing grading rationale). */
  explanationChars: number;
  /** Character count of the LLM's student-facing feedback. 0 for rubric-based grading (no feedback field). */
  feedbackChars: number;
  /** Character count of the full serialized JSON response object from the LLM. */
  outputTextChars: number;

  // --- Rotation correction data ---

  /** Whether image rotation correction was applied for this submission. Enables filtering into RC vs non-RC cohorts for separate regressors. */
  rotationCorrectionApplied: boolean;
  /** Sum of input tokens across all rotation correction LLM calls (initial grading + per-image orientation detection). 0 if no RC. */
  rotationCorrectionInputTokens: number;
  /** Sum of output tokens across all rotation correction LLM calls. 0 if no RC. */
  rotationCorrectionOutputTokens: number;
  /** Sum of total tokens across all rotation correction LLM calls. 0 if no RC. */
  rotationCorrectionTotalTokens: number;
  /** Grand total input tokens: final grading + rotation correction combined. */
  allCallsInputTokens: number;
  /** Grand total output tokens: final grading + rotation correction combined. */
  allCallsOutputTokens: number;
  /** Grand total tokens (input + output): final grading + rotation correction combined. */
  allCallsTotalTokens: number;

  // --- Cost ---

  /** Raw API cost in US dollars for all LLM calls in this submission (pre-infrastructure fee). Computed via calculateResponseCost per-model pricing. */
  costPreFeeDollars: number;
  /** Total cost in milli-dollars after applying the infrastructure fee markup. Computed via calculateCostWithFeeMilliDollars. */
  costPostFeeMilliDollars: number;
}

interface FieldAggregateStats {
  mean: number;
  min: number;
  max: number;
  stddev: number;
  total: number;
}

export interface AggregateTokenStats {
  count: number;
  rotationCorrectionCount: number;
  fields: Record<string, FieldAggregateStats & { access: string }>;
}

let cachedEncoding: Tiktoken | null = null;

function getTokenEncoding(): Tiktoken {
  if (!cachedEncoding) {
    cachedEncoding = getEncoding('o200k_base');
  }
  return cachedEncoding;
}

export function countPromptTextTokens(messages: ModelMessage[]): number {
  const encoding = getTokenEncoding();
  let totalTokens = 0;

  for (const message of messages) {
    if (typeof message.content === 'string') {
      totalTokens += encoding.encode(message.content).length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          totalTokens += encoding.encode(part.text).length;
        }
      }
    }
  }

  return totalTokens;
}

function countPromptTextChars(messages: ModelMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      total += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          total += part.text.length;
        }
      }
    }
  }
  return total;
}

async function getImageDimensions(
  submittedImages: Record<string, string>,
): Promise<{ dimensions: { width: number; height: number }[]; base64Lengths: number[] }> {
  const dimensions: { width: number; height: number }[] = [];
  const base64Lengths: number[] = [];

  for (const [, base64Data] of Object.entries(submittedImages)) {
    base64Lengths.push(base64Data.length);
    try {
      const metadata = await sharp(Buffer.from(base64Data, 'base64')).metadata();
      dimensions.push({
        width: metadata.width,
        height: metadata.height,
      });
    } catch {
      dimensions.push({ width: 0, height: 0 });
    }
  }

  return { dimensions, base64Lengths };
}

function computeRubricTotalChars(rubricItems: RubricItem[]): number {
  return rubricItems.reduce((total, item) => {
    return (
      total +
      item.description.length +
      (item.explanation?.length ?? 0) +
      (item.grader_note?.length ?? 0)
    );
  }, 0);
}

function computeEstimatedRubricTokens(rubricItems: RubricItem[]): number {
  const encoding = getTokenEncoding();
  let tokens = 0;
  for (const item of rubricItems) {
    tokens += encoding.encode(item.description).length;
    if (item.explanation) {
      tokens += encoding.encode(item.explanation).length;
    }
    if (item.grader_note) {
      tokens += encoding.encode(item.grader_note).length;
    }
  }
  return tokens;
}

function extractRotationCorrectionTokens(rotationCorrectionResponses: {
  gradingResponseWithRotationIssue?: GenerateObjectResult<any>;
  rotationCorrections?: Record<
    string,
    {
      degreesRotated: CounterClockwiseRotationDegrees;
      response: GenerateObjectResult<any>;
    }
  >;
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  if (rotationCorrectionResponses.gradingResponseWithRotationIssue) {
    const usage = rotationCorrectionResponses.gradingResponseWithRotationIssue.usage;
    inputTokens += usage.inputTokens ?? 0;
    outputTokens += usage.outputTokens ?? 0;
    totalTokens += usage.totalTokens ?? 0;
  }

  if (rotationCorrectionResponses.rotationCorrections) {
    for (const correction of Object.values(rotationCorrectionResponses.rotationCorrections)) {
      const usage = correction.response.usage;
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
      totalTokens += usage.totalTokens ?? 0;
    }
  }

  return { inputTokens, outputTokens, totalTokens };
}

export async function collectSubmissionStats({
  instanceQuestionId,
  assessmentQuestionId,
  modelId,
  prompt,
  submissionTextChars,
  questionPromptChars,
  questionAnswerChars,
  graderGuidelinesChars,
  submittedImages,
  rubricItems,
  finalGradingUsage,
  responseObject,
  rotationCorrectionApplied,
  rotationCorrectionResponses,
}: {
  instanceQuestionId: string;
  assessmentQuestionId: string;
  modelId: AiGradingModelId;
  prompt: ModelMessage[];
  submissionTextChars: number;
  questionPromptChars: number;
  questionAnswerChars: number;
  graderGuidelinesChars: number;
  submittedImages: Record<string, string>;
  rubricItems: RubricItem[];
  finalGradingUsage: LanguageModelUsage;
  responseObject: { explanation?: string; feedback?: string };
  rotationCorrectionApplied: boolean;
  rotationCorrectionResponses?: {
    gradingResponseWithRotationIssue?: GenerateObjectResult<any>;
    rotationCorrections?: Record<
      string,
      {
        degreesRotated: CounterClockwiseRotationDegrees;
        response: GenerateObjectResult<any>;
      }
    >;
  };
}): Promise<SubmissionTokenStats> {
  const { dimensions, base64Lengths } = await getImageDimensions(submittedImages);
  const promptTextChars = countPromptTextChars(prompt);
  const estimatedPromptTextTokens = countPromptTextTokens(prompt);
  const inputTokens = finalGradingUsage.inputTokens ?? 0;
  const outputTokens = finalGradingUsage.outputTokens ?? 0;
  const totalTokens = finalGradingUsage.totalTokens ?? 0;
  const estimatedImageTokens = Math.max(0, inputTokens - estimatedPromptTextTokens);

  const rcTokens = rotationCorrectionApplied
    ? extractRotationCorrectionTokens(rotationCorrectionResponses ?? {})
    : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  // Compute cost: sum costs from all LLM calls for this submission
  let costPreFeeDollars = calculateResponseCost({ model: modelId, usage: finalGradingUsage });
  if (rotationCorrectionResponses?.gradingResponseWithRotationIssue) {
    costPreFeeDollars += calculateResponseCost({
      model: modelId,
      usage: rotationCorrectionResponses.gradingResponseWithRotationIssue.usage,
    });
  }
  if (rotationCorrectionResponses?.rotationCorrections) {
    for (const correction of Object.values(rotationCorrectionResponses.rotationCorrections)) {
      costPreFeeDollars += calculateResponseCost({
        model: modelId,
        usage: correction.response.usage,
      });
    }
  }
  const costPostFeeMilliDollars = calculateCostWithFeeMilliDollars(
    costPreFeeDollars,
    config.aiGradingInfrastructureFeePercent,
  );

  const outputTextStr = JSON.stringify(responseObject);

  return {
    instanceQuestionId,
    assessmentQuestionId,
    modelId,

    submissionTextChars,
    questionPromptChars,
    questionAnswerChars,
    graderGuidelinesChars,

    imageCount: Object.keys(submittedImages).length,
    imageDimensions: dimensions,
    imageBase64Lengths: base64Lengths,

    rubricItemCount: rubricItems.length,
    rubricTotalChars: computeRubricTotalChars(rubricItems),
    estimatedRubricTokens: computeEstimatedRubricTokens(rubricItems),

    inputTokens,
    outputTokens,
    outputTextTokens: finalGradingUsage.outputTokenDetails.textTokens ?? 0,
    reasoningTokens: finalGradingUsage.outputTokenDetails.reasoningTokens ?? 0,
    cacheReadTokens: finalGradingUsage.inputTokenDetails.cacheReadTokens ?? 0,
    cacheWriteTokens: finalGradingUsage.inputTokenDetails.cacheWriteTokens ?? 0,
    totalTokens,

    promptTextChars,
    estimatedPromptTextTokens,
    estimatedImageTokens,

    explanationChars: responseObject.explanation?.length ?? 0,
    feedbackChars: responseObject.feedback?.length ?? 0,
    outputTextChars: outputTextStr.length,

    rotationCorrectionApplied,
    rotationCorrectionInputTokens: rcTokens.inputTokens,
    rotationCorrectionOutputTokens: rcTokens.outputTokens,
    rotationCorrectionTotalTokens: rcTokens.totalTokens,
    allCallsInputTokens: inputTokens + rcTokens.inputTokens,
    allCallsOutputTokens: outputTokens + rcTokens.outputTokens,
    allCallsTotalTokens: totalTokens + rcTokens.totalTokens,

    costPreFeeDollars,
    costPostFeeMilliDollars,
  };
}

/**
 * Each stat field is annotated with an access category:
 * - "input":   Known before the LLM call. Usable as regressor features.
 * - "output":  Only known after the LLM call. These are regression targets.
 * - "derived": Computed from input + output data. Can be used as features if the
 *              component values are available, or as targets.
 */
const NUMERIC_STAT_FIELDS: { field: keyof SubmissionTokenStats; access: string }[] = [
  { field: 'submissionTextChars', access: 'input' },
  { field: 'questionPromptChars', access: 'input' },
  { field: 'questionAnswerChars', access: 'input' },
  { field: 'graderGuidelinesChars', access: 'input' },
  { field: 'imageCount', access: 'input' },
  { field: 'rubricItemCount', access: 'input' },
  { field: 'rubricTotalChars', access: 'input' },
  { field: 'estimatedRubricTokens', access: 'input' },
  { field: 'promptTextChars', access: 'input' },
  { field: 'estimatedPromptTextTokens', access: 'input' },
  { field: 'inputTokens', access: 'output' },
  { field: 'outputTokens', access: 'output' },
  { field: 'outputTextTokens', access: 'output' },
  { field: 'reasoningTokens', access: 'output' },
  { field: 'cacheReadTokens', access: 'output' },
  { field: 'cacheWriteTokens', access: 'output' },
  { field: 'totalTokens', access: 'output' },
  { field: 'estimatedImageTokens', access: 'derived' },
  { field: 'explanationChars', access: 'output' },
  { field: 'feedbackChars', access: 'output' },
  { field: 'outputTextChars', access: 'output' },
  { field: 'rotationCorrectionInputTokens', access: 'output' },
  { field: 'rotationCorrectionOutputTokens', access: 'output' },
  { field: 'rotationCorrectionTotalTokens', access: 'output' },
  { field: 'allCallsInputTokens', access: 'output' },
  { field: 'allCallsOutputTokens', access: 'output' },
  { field: 'allCallsTotalTokens', access: 'output' },
  { field: 'costPreFeeDollars', access: 'output' },
  { field: 'costPostFeeMilliDollars', access: 'output' },
];

function computeFieldStats(values: number[]): FieldAggregateStats {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, min: 0, max: 0, stddev: 0, total: 0 };
  }

  const total = values.reduce((a, b) => a + b, 0);
  const mean = total / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  return { mean, min, max, stddev, total };
}

export function computeAggregateStats(stats: SubmissionTokenStats[]): AggregateTokenStats {
  const fields: Record<string, FieldAggregateStats & { access: string }> = {};

  for (const { field, access } of NUMERIC_STAT_FIELDS) {
    const values = stats.map((s) => s[field] as number);
    fields[field] = { ...computeFieldStats(values), access };
  }

  return {
    count: stats.length,
    rotationCorrectionCount: stats.filter((s) => s.rotationCorrectionApplied).length,
    fields,
  };
}

export function logTokenStats(
  stats: SubmissionTokenStats,
  logger: { info: (msg: string) => void },
): void {
  const parts = [
    `iq=${stats.instanceQuestionId}`,
    `aq=${stats.assessmentQuestionId}`,
    `promptTextChars=${stats.promptTextChars}`,
    `submissionTextChars=${stats.submissionTextChars}`,
    `estTextTok=${stats.estimatedPromptTextTokens}`,
    `imgs=${stats.imageCount}`,
    `estImgTok=${stats.estimatedImageTokens}`,
    `inTok=${stats.inputTokens}`,
    `outTok=${stats.outputTokens}`,
    `reasonTok=${stats.reasoningTokens}`,
    `rc=${stats.rotationCorrectionApplied}`,
  ];
  if (stats.rotationCorrectionApplied) {
    parts.push(`rcTok=${stats.allCallsTotalTokens}`);
  }
  logger.info(`[AI_GRADING_STATS] ${parts.join(', ')}`);
}

/**
 * Columns for the per-submission table. Uses the same numeric fields as the aggregate,
 * prefixed with instanceQuestionId and modelId.
 */
const PER_SUBMISSION_COLUMNS: (keyof SubmissionTokenStats)[] = [
  'instanceQuestionId',
  'assessmentQuestionId',
  'modelId',
  ...NUMERIC_STAT_FIELDS.map((f) => f.field),
  'rotationCorrectionApplied',
];

export function logPerSubmissionTable(
  allStats: SubmissionTokenStats[],
  logger: { info: (msg: string) => void },
): void {
  logger.info('');
  logger.info(
    `=== Per-Submission Statistics (N=${allStats.length}) — TSV (paste into Google Sheets) ===`,
  );

  const headerRow = PER_SUBMISSION_COLUMNS.join('\t');
  logger.info(headerRow);

  for (const stats of allStats) {
    const row = PER_SUBMISSION_COLUMNS.map((col) => String(stats[col])).join('\t');
    logger.info(row);
  }

  logger.info('');
  logger.info(`[AI_GRADING_PER_SUBMISSION] ${JSON.stringify(allStats)}`);
}

export function logAggregateStats(
  aggregate: AggregateTokenStats,
  allStats: SubmissionTokenStats[],
  logger: { info: (msg: string) => void },
): void {
  logPerSubmissionTable(allStats, logger);

  logger.info('');
  logger.info(
    `=== Aggregate Statistics (N=${aggregate.count} submissions) — TSV (paste into Google Sheets) ===`,
  );
  logger.info(
    `Rotation correction applied: ${aggregate.rotationCorrectionCount}/${aggregate.count} (${((aggregate.rotationCorrectionCount / aggregate.count) * 100).toFixed(1)}%)`,
  );
  logger.info('');

  const aggColumns = ['Metric', 'Access', 'Mean', 'Min', 'Max', 'StdDev', 'Total'];
  logger.info(aggColumns.join('\t'));

  for (const [field, fieldStats] of Object.entries(aggregate.fields)) {
    const row = [
      field,
      fieldStats.access,
      fieldStats.mean.toFixed(1),
      String(fieldStats.min),
      String(fieldStats.max),
      fieldStats.stddev.toFixed(1),
      String(fieldStats.total),
    ].join('\t');
    logger.info(row);
  }

  logger.info('');
  logger.info(
    `[AI_GRADING_AGGREGATE_STATS] ${JSON.stringify({ count: aggregate.count, rotationCorrectionCount: aggregate.rotationCorrectionCount, fields: aggregate.fields })}`,
  );
}

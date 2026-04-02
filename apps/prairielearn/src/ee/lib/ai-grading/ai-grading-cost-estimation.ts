import { performance } from 'node:perf_hooks';

import * as async from 'async';
import mustache from 'mustache';

import { logger } from '@prairielearn/logger';

import type {
  AssessmentQuestion,
  Course,
  InstanceQuestion,
  Question,
} from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import {
  AI_GRADING_MODELS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from './ai-grading-models.shared.js';
import {
  type TokenCountDetails,
  type TokenCountTimingBreakdown,
  countInputTokensForModelWithDetails,
} from './ai-grading-token-counting.js';
import {
  filterInstanceQuestionsByMode,
  generatePrompt,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

// Output token estimation constants.
// These are empirically tuned values based on actual AI grading usage costs on
// 100 submissions with GPT 5-mini, GPT 5.1, Gemini 3 Flash, and Gemini 3.1 Pro
// models as of 3/31/2026.

/** Approximate number of characters per output token. */
const CHARS_PER_OUTPUT_TOKEN = 3.04;

/** Average character length of the explanation field in the AI grading output. */
const AVG_EXPLANATION_LENGTH = 2259;

/**
 * Multiplier applied to input tokens to estimate reasoning token usage.
 * Reasoning tokens scale with input complexity and are priced at the output rate.
 */
const REASONING_INPUT_MULTIPLIER = 1;

/**
 * Estimates the output token count using a character-based heuristic.
 *
 * Output tokens are nondeterministic (they depend on the model's generated
 * response), so we can't count them with a tokenizer. Instead, we approximate
 * by constructing what the expected JSON response structure would look like
 * and dividing by the empirically observed characters-per-token ratio.
 */
function estimateOutputTokens(rubricItemDescriptions: string[]): number {
  const explanationPlaceholder = 'x'.repeat(AVG_EXPLANATION_LENGTH);

  if (rubricItemDescriptions.length > 0) {
    // Reconstruct what the filled rubric output would look like.
    // We use `false` since it's the longer of the two boolean strings ("false" vs "true").
    const rubricOutputJson = JSON.stringify({
      explanation: explanationPlaceholder,
      rubric_items: Object.fromEntries(rubricItemDescriptions.map((desc) => [desc, false])),
    });
    return Math.ceil(rubricOutputJson.length / CHARS_PER_OUTPUT_TOKEN);
  }
  // Numeric scoring: { "explanation": "...", "score": N }
  const numericOutputJson = JSON.stringify({
    explanation: explanationPlaceholder,
    score: 0,
  });
  return Math.ceil(numericOutputJson.length / CHARS_PER_OUTPUT_TOKEN);
}

const MODEL_IDS = AI_GRADING_MODELS.map((model) => model.modelId);

interface ModelStatusCount {
  exact: number;
  fallback: number;
  failed_even_fallback: number;
}

interface SampleTimingBreakdown {
  total_ms: number;
  select_last_variant_and_submission_ms: number;
  render_question_ms: number;
  render_submission_ms: number;
  render_rubric_items_ms: number;
  generate_prompt_ms: number;
  token_counting_ms: number;
}

interface TimingStats {
  sum_ms: number;
  avg_ms: number;
  max_ms: number;
  count: number;
}

interface EstimationPhaseTimings {
  select_instance_questions_ms: number;
  filter_instance_questions_ms: number;
  select_complete_rubric_ms: number;
  sampling_ms: number;
  get_question_course_ms: number;
  sample_processing_ms: number;
  total_estimation_ms: number;
}

type SampleEstimationResult =
  | {
      instance_question_id: string;
      token_counts: Record<AiGradingModelId, number>;
      token_details: Record<AiGradingModelId, TokenCountDetails>;
      timings: SampleTimingBreakdown;
    }
  | {
      instance_question_id: string;
      failed: true;
      stage: 'render' | 'token_counting';
      token_details?: Record<AiGradingModelId, TokenCountDetails>;
      timings: Partial<SampleTimingBreakdown>;
      err?: unknown;
    };

const SAMPLE_TIMING_KEYS: (keyof SampleTimingBreakdown)[] = [
  'total_ms',
  'select_last_variant_and_submission_ms',
  'render_question_ms',
  'render_submission_ms',
  'render_rubric_items_ms',
  'generate_prompt_ms',
  'token_counting_ms',
];

const TOKEN_COUNT_TIMING_KEYS: (keyof TokenCountTimingBreakdown)[] = [
  'total_ms',
  'get_encoding_ms',
  'text_encode_ms',
  'image_token_count_ms',
  'image_metadata_ms',
  'image_formula_ms',
  'fallback_estimate_ms',
];

function elapsedMs(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10;
}

function summarizeTimingValues(values: number[]): TimingStats {
  if (values.length === 0) {
    return { sum_ms: 0, avg_ms: 0, max_ms: 0, count: 0 };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  const max = Math.max(...values);
  return {
    sum_ms: Math.round(sum * 10) / 10,
    avg_ms: Math.round((sum / values.length) * 10) / 10,
    max_ms: Math.round(max * 10) / 10,
    count: values.length,
  };
}

function buildSampleTimingSummary(
  results: SampleEstimationResult[],
): Record<keyof SampleTimingBreakdown, TimingStats> {
  return Object.fromEntries(
    SAMPLE_TIMING_KEYS.map((key) => {
      const values = results
        .map((result) => result.timings[key])
        .filter((value): value is number => value != null);
      return [key, summarizeTimingValues(values)];
    }),
  ) as Record<keyof SampleTimingBreakdown, TimingStats>;
}

function initializeModelStatusCounts(): Record<AiGradingModelId, ModelStatusCount> {
  return Object.fromEntries(
    MODEL_IDS.map((modelId) => [modelId, { exact: 0, fallback: 0, failed_even_fallback: 0 }]),
  ) as Record<AiGradingModelId, ModelStatusCount>;
}

function buildEstimationDiagnostics(results: SampleEstimationResult[]) {
  const model_status_counts = initializeModelStatusCounts();
  let samples_with_any_fallback_count = 0;
  let samples_failed_render_count = 0;
  let samples_failed_token_counting_count = 0;

  for (const result of results) {
    if ('failed' in result) {
      if (result.stage === 'render') {
        samples_failed_render_count += 1;
      } else {
        samples_failed_token_counting_count += 1;
      }
      if (result.token_details) {
        for (const modelId of MODEL_IDS) {
          const details = result.token_details[modelId];
          if (details.failedEvenFallback) {
            model_status_counts[modelId].failed_even_fallback += 1;
          }
        }
      }
      continue;
    }

    let sampleHadFallback = false;
    for (const modelId of MODEL_IDS) {
      const details = result.token_details[modelId];
      if (details.failedEvenFallback) {
        model_status_counts[modelId].failed_even_fallback += 1;
        sampleHadFallback = true;
      } else if (details.usedFallback) {
        model_status_counts[modelId].fallback += 1;
        sampleHadFallback = true;
      } else {
        model_status_counts[modelId].exact += 1;
      }
    }
    if (sampleHadFallback) {
      samples_with_any_fallback_count += 1;
    }
  }

  return {
    model_status_counts,
    samples_with_any_fallback_count,
    samples_failed_render_count,
    samples_failed_token_counting_count,
  };
}

function buildTokenCountTimingSummaryByModel(
  results: SampleEstimationResult[],
): Record<AiGradingModelId, Record<keyof TokenCountTimingBreakdown, TimingStats>> {
  return Object.fromEntries(
    MODEL_IDS.map((modelId) => {
      const modelTimingSummary = Object.fromEntries(
        TOKEN_COUNT_TIMING_KEYS.map((timingKey) => {
          const values = results.flatMap((result) => {
            if (!('token_details' in result) || result.token_details == null) return [];
            return [result.token_details[modelId].timing_ms[timingKey]];
          });
          return [timingKey, summarizeTimingValues(values)];
        }),
      ) as Record<keyof TokenCountTimingBreakdown, TimingStats>;
      return [modelId, modelTimingSummary];
    }),
  ) as Record<AiGradingModelId, Record<keyof TokenCountTimingBreakdown, TimingStats>>;
}

function formatTimingBreakdown(timings: SampleTimingBreakdown | Partial<SampleTimingBreakdown>) {
  const parts: string[] = [];
  if (timings.total_ms != null) parts.push(`total=${timings.total_ms}ms`);
  if (timings.select_last_variant_and_submission_ms != null) {
    parts.push(`db=${timings.select_last_variant_and_submission_ms}ms`);
  }
  if (timings.render_question_ms != null) parts.push(`renderQ=${timings.render_question_ms}ms`);
  if (timings.render_submission_ms != null) {
    parts.push(`renderS=${timings.render_submission_ms}ms`);
  }
  if (timings.render_rubric_items_ms != null) {
    parts.push(`rubric=${timings.render_rubric_items_ms}ms`);
  }
  if (timings.generate_prompt_ms != null) parts.push(`prompt=${timings.generate_prompt_ms}ms`);
  if (timings.token_counting_ms != null) parts.push(`tokens=${timings.token_counting_ms}ms`);
  return parts.join(' | ');
}

function formatModelTokenLine(modelId: AiGradingModelId, details: TokenCountDetails): string {
  const status = details.failedEvenFallback
    ? 'FAILED'
    : details.usedFallback
      ? 'FALLBACK'
      : 'exact';
  const imgFallback =
    details.imageFallbackCount > 0 ? ` (${details.imageFallbackCount} img fallbacks)` : '';
  return `  ${modelId}: ${details.tokenCount} tokens [${status}]${imgFallback}`;
}

function logCostEstimationSampleTokens({
  assessment_question_id,
  question_id,
  question_qid,
  instance_question_id,
  token_counts,
  token_details,
  timings,
}: {
  assessment_question_id: string;
  question_id: string;
  question_qid: string | null;
  instance_question_id: string;
  token_counts: Record<AiGradingModelId, number>;
  token_details: Record<AiGradingModelId, TokenCountDetails>;
  timings: SampleTimingBreakdown;
}) {
  const qLabel = question_qid ?? question_id;
  const modelLines = MODEL_IDS.map((id) => formatModelTokenLine(id, token_details[id])).join('\n');
  const timing = formatTimingBreakdown(timings);

  logger.info(
    [
      `[AI cost] Sample OK — aq=${assessment_question_id} q=${qLabel} iq=${instance_question_id}`,
      modelLines,
      `  timing: ${timing}`,
    ].join('\n'),
    { token_counts },
  );
}

function logCostEstimationSampleFailure({
  assessment_question_id,
  question_id,
  question_qid,
  instance_question_id,
  stage,
  token_details,
  timings,
  err,
}: {
  assessment_question_id: string;
  question_id: string;
  question_qid: string | null;
  instance_question_id: string;
  stage: 'render' | 'token_counting';
  token_details?: Record<AiGradingModelId, TokenCountDetails>;
  timings: Partial<SampleTimingBreakdown>;
  err?: unknown;
}) {
  const qLabel = question_qid ?? question_id;
  const timing = formatTimingBreakdown(timings);
  const modelLines = token_details
    ? '\n' + MODEL_IDS.map((id) => formatModelTokenLine(id, token_details[id])).join('\n')
    : '';

  logger.error(
    [
      `[AI cost] Sample FAILED at ${stage} — aq=${assessment_question_id} q=${qLabel} iq=${instance_question_id}`,
      modelLines,
      `  timing: ${timing}`,
    ]
      .filter(Boolean)
      .join('\n'),
    { err },
  );
}

function formatTimingStats(stats: TimingStats): string {
  if (stats.count === 0) return 'n/a';
  return `avg=${stats.avg_ms}ms max=${stats.max_ms}ms sum=${stats.sum_ms}ms (n=${stats.count})`;
}

function logCostEstimationSummary({
  assessment_question_id,
  question_id,
  question_qid,
  num_to_grade,
  sampled_count,
  successful_sample_count,
  failed_sample_count,
  samples_with_any_fallback_count,
  samples_failed_render_count,
  samples_failed_token_counting_count,
  model_status_counts,
  phase_timings_ms,
  sample_timing_stats_ms,
  token_count_timing_stats_by_model_ms,
  avg_input_tokens,
  estimated_output_tokens,
  estimated_reasoning_tokens,
}: {
  assessment_question_id: string;
  question_id: string;
  question_qid: string | null;
  num_to_grade: number;
  sampled_count: number;
  successful_sample_count: number;
  failed_sample_count: number;
  samples_with_any_fallback_count: number;
  samples_failed_render_count: number;
  samples_failed_token_counting_count: number;
  model_status_counts: Record<AiGradingModelId, ModelStatusCount>;
  phase_timings_ms: EstimationPhaseTimings;
  sample_timing_stats_ms: Record<keyof SampleTimingBreakdown, TimingStats>;
  token_count_timing_stats_by_model_ms: Record<
    AiGradingModelId,
    Record<keyof TokenCountTimingBreakdown, TimingStats>
  >;
  avg_input_tokens: Record<AiGradingModelId, number>;
  estimated_output_tokens: number;
  estimated_reasoning_tokens: Record<AiGradingModelId, number>;
}) {
  const qLabel = question_qid ?? question_id;
  const allOk = failed_sample_count === 0 && samples_with_any_fallback_count === 0;

  const modelResultLines = MODEL_IDS.map((id) => {
    const counts = model_status_counts[id];
    const statusParts = [
      counts.exact > 0 ? `${counts.exact} exact` : null,
      counts.fallback > 0 ? `${counts.fallback} fallback` : null,
      counts.failed_even_fallback > 0 ? `${counts.failed_even_fallback} FAILED` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return `  ${id}: avg_in=${avg_input_tokens[id]} reasoning=${estimated_reasoning_tokens[id]} [${statusParts}]`;
  }).join('\n');

  const phaseLines = [
    `  selectIQs=${phase_timings_ms.select_instance_questions_ms}ms`,
    `  filterIQs=${phase_timings_ms.filter_instance_questions_ms}ms`,
    `  rubric=${phase_timings_ms.select_complete_rubric_ms}ms`,
    `  sampling=${phase_timings_ms.sampling_ms}ms`,
    `  questionCourse=${phase_timings_ms.get_question_course_ms}ms`,
    `  sampleProcessing=${phase_timings_ms.sample_processing_ms}ms`,
    `  TOTAL=${phase_timings_ms.total_estimation_ms}ms`,
  ].join(' | ');

  const sampleTimingLines = SAMPLE_TIMING_KEYS.map(
    (key) => `  ${key}: ${formatTimingStats(sample_timing_stats_ms[key])}`,
  ).join('\n');

  const lines = [
    `[AI cost] Summary — aq=${assessment_question_id} q=${qLabel}`,
    `  submissions: ${num_to_grade} to grade, ${sampled_count} sampled (${successful_sample_count} ok, ${failed_sample_count} failed)`,
    ...(allOk
      ? []
      : [
          `  issues: ${samples_with_any_fallback_count} with fallback, ${samples_failed_render_count} render failures, ${samples_failed_token_counting_count} token count failures`,
        ]),
    `  output_tokens: ${estimated_output_tokens} (estimated)`,
    '  per-model results:',
    modelResultLines,
    `  phase timings: ${phaseLines}`,
    '  sample timing stats:',
    sampleTimingLines,
  ];

  logger.info(lines.join('\n'), {
    token_count_timing_stats_by_model_ms,
  });
}

export async function estimateAiGradingCost({
  assessment_question,
  question,
  course,
  urlPrefix,
  mode,
  selected_instance_question_ids,
}: {
  assessment_question: AssessmentQuestion;
  question: Question;
  course: Course;
  urlPrefix: string;
  mode: 'all' | 'human_graded' | 'selected';
  /** When mode is 'selected', the specific instance question IDs to grade. */
  selected_instance_question_ids?: string[];
}): Promise<{
  num_to_grade: number;
  avg_input_tokens: Record<AiGradingModelId, number>;
  estimated_output_tokens: number;
  estimated_reasoning_tokens: Record<AiGradingModelId, number>;
}> {
  const estimateStartTime = performance.now();

  const selectInstanceQuestionsStartTime = performance.now();
  const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });
  const select_instance_questions_ms = elapsedMs(selectInstanceQuestionsStartTime);

  const filterInstanceQuestionsStartTime = performance.now();
  const filtered_instance_questions = await filterInstanceQuestionsByMode(
    all_instance_questions,
    mode,
    selected_instance_question_ids,
  );
  const filter_instance_questions_ms = elapsedMs(filterInstanceQuestionsStartTime);

  const num_to_grade = filtered_instance_questions.length;

  const selectCompleteRubricStartTime = performance.now();
  const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);
  const select_complete_rubric_ms = elapsedMs(selectCompleteRubricStartTime);
  const estimated_output_tokens = estimateOutputTokens(
    rubric_items.map((item) => item.description),
  );

  const zeroTokens = Object.fromEntries(MODEL_IDS.map((modelId) => [modelId, 0])) as Record<
    AiGradingModelId,
    number
  >;

  if (num_to_grade === 0) {
    const emptySampleTimingStats = buildSampleTimingSummary([]);
    const emptyTokenCountTimingStatsByModel = buildTokenCountTimingSummaryByModel([]);
    logCostEstimationSummary({
      assessment_question_id: assessment_question.id,
      question_id: question.id,
      question_qid: question.qid,
      num_to_grade: 0,
      sampled_count: 0,
      successful_sample_count: 0,
      failed_sample_count: 0,
      samples_with_any_fallback_count: 0,
      samples_failed_render_count: 0,
      samples_failed_token_counting_count: 0,
      model_status_counts: initializeModelStatusCounts(),
      phase_timings_ms: {
        select_instance_questions_ms,
        filter_instance_questions_ms,
        select_complete_rubric_ms,
        sampling_ms: 0,
        get_question_course_ms: 0,
        sample_processing_ms: 0,
        total_estimation_ms: elapsedMs(estimateStartTime),
      },
      sample_timing_stats_ms: emptySampleTimingStats,
      token_count_timing_stats_by_model_ms: emptyTokenCountTimingStatsByModel,
      avg_input_tokens: { ...zeroTokens },
      estimated_output_tokens,
      estimated_reasoning_tokens: { ...zeroTokens },
    });
    return {
      num_to_grade: 0,
      avg_input_tokens: { ...zeroTokens },
      estimated_output_tokens,
      estimated_reasoning_tokens: { ...zeroTokens },
    };
  }

  /** Maximum number of submissions to sample for token estimation. */
  const MAX_SAMPLE_SIZE = 10;

  const samplingStartTime = performance.now();
  const shuffled = [...filtered_instance_questions].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(MAX_SAMPLE_SIZE, num_to_grade));
  const sampling_ms = elapsedMs(samplingStartTime);

  const getQuestionCourseStartTime = performance.now();
  const question_course = await getQuestionCourse(question, course);
  const get_question_course_ms = elapsedMs(getQuestionCourseStartTime);

  // Render prompts and count tokens for all models for each sampled submission.
  // Use async.mapLimit to avoid saturating the Python code caller pool, which
  // causes restart timeouts when too many renders run concurrently.
  const PARALLEL_SAMPLE_LIMIT = 3;
  const sampleProcessingStartTime = performance.now();
  const results: SampleEstimationResult[] = await async.mapLimit(
    sampled,
    PARALLEL_SAMPLE_LIMIT,
    async (instance_question: InstanceQuestion): Promise<SampleEstimationResult> => {
      const sampleStartTime = performance.now();
      const sampleTimings: Partial<SampleTimingBreakdown> = {};
      let failureStage: 'render' | 'token_counting' = 'render';

      try {
        const selectLastVariantAndSubmissionStartTime = performance.now();
        const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);
        sampleTimings.select_last_variant_and_submission_ms = elapsedMs(
          selectLastVariantAndSubmissionStartTime,
        );

        const locals = {
          ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
          questionRenderContext: 'ai_grading',
        };

        const questionModule = questionServers.getModule(question.type);

        const renderQuestionStartTime = performance.now();
        const render_question_results = await questionModule.render({
          renderSelection: { question: true, submissions: false, answer: true },
          variant,
          question,
          submission: null,
          submissions: [],
          course: question_course,
          locals,
        });
        sampleTimings.render_question_ms = elapsedMs(renderQuestionStartTime);

        if (render_question_results.courseIssues.length > 0) {
          return {
            instance_question_id: instance_question.id,
            failed: true,
            stage: 'render',
            timings: {
              ...sampleTimings,
              total_ms: elapsedMs(sampleStartTime),
            },
            err: render_question_results.courseIssues,
          };
        }

        const questionPrompt = render_question_results.data.questionHtml;
        const questionAnswer = render_question_results.data.answerHtml;

        const renderSubmissionStartTime = performance.now();
        const render_submission_results = await questionModule.render({
          renderSelection: { question: false, submissions: true, answer: false },
          variant,
          question,
          submission,
          submissions: [submission],
          course: question_course,
          locals,
        });
        sampleTimings.render_submission_ms = elapsedMs(renderSubmissionStartTime);

        const submission_text = render_submission_results.data.submissionHtmls[0];

        // Apply mustache rendering to rubric items (same as in aiGrade).
        const renderRubricItemsStartTime = performance.now();
        const renderedRubricItems = rubric_items.map((item) => {
          const mustacheParams = {
            correct_answers: submission.true_answer ?? {},
            params: submission.params ?? {},
            submitted_answers: submission.submitted_answer,
          };
          return {
            ...item,
            description: mustache.render(item.description, mustacheParams),
            explanation: item.explanation
              ? mustache.render(item.explanation, mustacheParams)
              : null,
            grader_note: item.grader_note
              ? mustache.render(item.grader_note, mustacheParams)
              : null,
          };
        });
        sampleTimings.render_rubric_items_ms = elapsedMs(renderRubricItemsStartTime);

        const generatePromptStartTime = performance.now();
        const messages = await generatePrompt({
          questionPrompt,
          questionAnswer,
          submission_text,
          submitted_answer: submission.submitted_answer,
          rubric_items: renderedRubricItems,
          grader_guidelines: rubric?.grader_guidelines ?? null,
          params: variant.params ?? {},
          true_answer: variant.true_answer ?? {},
          model_id: DEFAULT_AI_GRADING_MODEL,
        });
        sampleTimings.generate_prompt_ms = elapsedMs(generatePromptStartTime);

        failureStage = 'token_counting';
        const tokenCountingStartTime = performance.now();
        const tokenEntries = await Promise.all(
          AI_GRADING_MODELS.map(async (model) => {
            const tokenDetails = await countInputTokensForModelWithDetails(messages, model.modelId);
            return [model.modelId, tokenDetails] as const;
          }),
        );
        sampleTimings.token_counting_ms = elapsedMs(tokenCountingStartTime);

        const token_details = Object.fromEntries(tokenEntries) as Record<
          AiGradingModelId,
          TokenCountDetails
        >;
        const token_counts = Object.fromEntries(
          MODEL_IDS.map((modelId) => [modelId, token_details[modelId].tokenCount]),
        ) as Record<AiGradingModelId, number>;

        const hasFailedEvenFallback = MODEL_IDS.some(
          (modelId) => token_details[modelId].failedEvenFallback,
        );
        if (hasFailedEvenFallback) {
          return {
            instance_question_id: instance_question.id,
            failed: true,
            stage: 'token_counting',
            timings: {
              ...sampleTimings,
              total_ms: elapsedMs(sampleStartTime),
            },
            token_details,
          };
        }

        const fullSampleTimings = {
          total_ms: elapsedMs(sampleStartTime),
          select_last_variant_and_submission_ms:
            sampleTimings.select_last_variant_and_submission_ms ?? 0,
          render_question_ms: sampleTimings.render_question_ms ?? 0,
          render_submission_ms: sampleTimings.render_submission_ms ?? 0,
          render_rubric_items_ms: sampleTimings.render_rubric_items_ms ?? 0,
          generate_prompt_ms: sampleTimings.generate_prompt_ms ?? 0,
          token_counting_ms: sampleTimings.token_counting_ms ?? 0,
        } satisfies SampleTimingBreakdown;

        logCostEstimationSampleTokens({
          assessment_question_id: assessment_question.id,
          question_id: question.id,
          question_qid: question.qid,
          instance_question_id: instance_question.id,
          token_counts,
          token_details,
          timings: fullSampleTimings,
        });
        return {
          instance_question_id: instance_question.id,
          token_counts,
          token_details,
          timings: fullSampleTimings,
        };
      } catch (err) {
        return {
          instance_question_id: instance_question.id,
          failed: true,
          stage: failureStage,
          timings: {
            ...sampleTimings,
            total_ms: elapsedMs(sampleStartTime),
          },
          err,
        };
      }
    },
  );
  const sample_processing_ms = elapsedMs(sampleProcessingStartTime);

  for (const result of results) {
    if ('failed' in result) {
      logCostEstimationSampleFailure({
        assessment_question_id: assessment_question.id,
        question_id: question.id,
        question_qid: question.qid,
        instance_question_id: result.instance_question_id,
        stage: result.stage,
        token_details: result.token_details,
        timings: result.timings,
        err: result.err,
      });
    }
  }

  const successfulResults = results.filter(
    (
      result,
    ): result is Extract<
      SampleEstimationResult,
      { token_counts: Record<AiGradingModelId, number> }
    > => !('failed' in result),
  );

  const diagnostics = buildEstimationDiagnostics(results);
  const sample_timing_stats_ms = buildSampleTimingSummary(results);
  const token_count_timing_stats_by_model_ms = buildTokenCountTimingSummaryByModel(results);
  const phase_timings_ms = {
    select_instance_questions_ms,
    filter_instance_questions_ms,
    select_complete_rubric_ms,
    sampling_ms,
    get_question_course_ms,
    sample_processing_ms,
    total_estimation_ms: elapsedMs(estimateStartTime),
  };

  if (successfulResults.length === 0) {
    logCostEstimationSummary({
      assessment_question_id: assessment_question.id,
      question_id: question.id,
      question_qid: question.qid,
      num_to_grade,
      sampled_count: sampled.length,
      successful_sample_count: 0,
      failed_sample_count: results.length,
      samples_with_any_fallback_count: diagnostics.samples_with_any_fallback_count,
      samples_failed_render_count: diagnostics.samples_failed_render_count,
      samples_failed_token_counting_count: diagnostics.samples_failed_token_counting_count,
      model_status_counts: diagnostics.model_status_counts,
      phase_timings_ms,
      sample_timing_stats_ms,
      token_count_timing_stats_by_model_ms,
      avg_input_tokens: { ...zeroTokens },
      estimated_output_tokens,
      estimated_reasoning_tokens: { ...zeroTokens },
    });
    return {
      num_to_grade,
      avg_input_tokens: { ...zeroTokens },
      estimated_output_tokens,
      estimated_reasoning_tokens: { ...zeroTokens },
    };
  }

  const avg_input_tokens = {} as Record<AiGradingModelId, number>;
  const estimated_reasoning_tokens = {} as Record<AiGradingModelId, number>;

  for (const modelId of MODEL_IDS) {
    const total = successfulResults.reduce((sum, r) => sum + r.token_counts[modelId], 0);
    const avg = Math.ceil(total / successfulResults.length);
    avg_input_tokens[modelId] = avg;
    estimated_reasoning_tokens[modelId] = Math.ceil(avg * REASONING_INPUT_MULTIPLIER);
  }

  logCostEstimationSummary({
    assessment_question_id: assessment_question.id,
    question_id: question.id,
    question_qid: question.qid,
    num_to_grade,
    sampled_count: sampled.length,
    successful_sample_count: successfulResults.length,
    failed_sample_count: results.length - successfulResults.length,
    samples_with_any_fallback_count: diagnostics.samples_with_any_fallback_count,
    samples_failed_render_count: diagnostics.samples_failed_render_count,
    samples_failed_token_counting_count: diagnostics.samples_failed_token_counting_count,
    model_status_counts: diagnostics.model_status_counts,
    phase_timings_ms,
    sample_timing_stats_ms,
    token_count_timing_stats_by_model_ms,
    avg_input_tokens,
    estimated_output_tokens,
    estimated_reasoning_tokens,
  });

  return {
    num_to_grade,
    avg_input_tokens,
    estimated_output_tokens,
    estimated_reasoning_tokens,
  };
}

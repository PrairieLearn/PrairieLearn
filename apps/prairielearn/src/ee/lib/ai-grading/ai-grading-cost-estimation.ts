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

type SampleEstimationResult =
  | {
      instance_question_id: string;
      token_counts: Record<AiGradingModelId, number>;
      token_details: Record<AiGradingModelId, TokenCountDetails>;
    }
  | {
      instance_question_id: string;
      failed: true;
      stage: 'render' | 'token_counting';
      token_details?: Record<AiGradingModelId, TokenCountDetails>;
      err?: unknown;
    };

function buildModelStatusByModel(token_details: Record<AiGradingModelId, TokenCountDetails>) {
  return Object.fromEntries(
    MODEL_IDS.map((modelId) => {
      const details = token_details[modelId];
      const status = details.failedEvenFallback
        ? 'failed_even_fallback'
        : details.usedFallback
          ? 'fallback'
          : 'exact';
      return [
        modelId,
        {
          status,
          image_fallback_count: details.imageFallbackCount,
          token_count: details.tokenCount,
        },
      ];
    }),
  ) as Record<
    AiGradingModelId,
    {
      status: 'exact' | 'fallback' | 'failed_even_fallback';
      image_fallback_count: number;
      token_count: number;
    }
  >;
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

function logCostEstimationSampleTokens({
  assessment_question_id,
  instance_question_id,
  token_counts,
  token_details,
}: {
  assessment_question_id: string;
  instance_question_id: string;
  token_counts: Record<AiGradingModelId, number>;
  token_details: Record<AiGradingModelId, TokenCountDetails>;
}) {
  logger.info('AI grading cost estimation sample token usage', {
    assessment_question_id,
    instance_question_id,
    token_counts,
    model_status_by_model: buildModelStatusByModel(token_details),
  });
}

function logCostEstimationSampleFailure({
  assessment_question_id,
  instance_question_id,
  stage,
  token_details,
  err,
}: {
  assessment_question_id: string;
  instance_question_id: string;
  stage: 'render' | 'token_counting';
  token_details?: Record<AiGradingModelId, TokenCountDetails>;
  err?: unknown;
}) {
  logger.error('AI grading cost estimation sample failed', {
    assessment_question_id,
    instance_question_id,
    stage,
    ...(token_details ? { model_status_by_model: buildModelStatusByModel(token_details) } : {}),
    err,
  });
}

function logCostEstimationSummary({
  assessment_question_id,
  num_to_grade,
  sampled_count,
  successful_sample_count,
  failed_sample_count,
  samples_with_any_fallback_count,
  samples_failed_render_count,
  samples_failed_token_counting_count,
  model_status_counts,
  avg_input_tokens,
  estimated_output_tokens,
  estimated_reasoning_tokens,
}: {
  assessment_question_id: string;
  num_to_grade: number;
  sampled_count: number;
  successful_sample_count: number;
  failed_sample_count: number;
  samples_with_any_fallback_count: number;
  samples_failed_render_count: number;
  samples_failed_token_counting_count: number;
  model_status_counts: Record<AiGradingModelId, ModelStatusCount>;
  avg_input_tokens: Record<AiGradingModelId, number>;
  estimated_output_tokens: number;
  estimated_reasoning_tokens: Record<AiGradingModelId, number>;
}) {
  logger.info('AI grading cost estimation summary', {
    assessment_question_id,
    num_to_grade,
    sampled_count,
    successful_sample_count,
    failed_sample_count,
    samples_with_any_fallback_count,
    samples_failed_render_count,
    samples_failed_token_counting_count,
    model_status_counts,
    avg_input_tokens,
    estimated_output_tokens,
    estimated_reasoning_tokens,
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
  const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });

  const filtered_instance_questions = await filterInstanceQuestionsByMode(
    all_instance_questions,
    mode,
    selected_instance_question_ids,
  );

  const num_to_grade = filtered_instance_questions.length;

  const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);
  const estimated_output_tokens = estimateOutputTokens(
    rubric_items.map((item) => item.description),
  );

  const zeroTokens = Object.fromEntries(MODEL_IDS.map((modelId) => [modelId, 0])) as Record<
    AiGradingModelId,
    number
  >;

  if (num_to_grade === 0) {
    return {
      num_to_grade: 0,
      avg_input_tokens: { ...zeroTokens },
      estimated_output_tokens,
      estimated_reasoning_tokens: { ...zeroTokens },
    };
  }

  /** Maximum number of submissions to sample for token estimation. */
  const MAX_SAMPLE_SIZE = 10;

  const shuffled = [...filtered_instance_questions].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(MAX_SAMPLE_SIZE, num_to_grade));

  const question_course = await getQuestionCourse(question, course);

  // Render prompts and count tokens for all models for each sampled submission.
  // Use async.mapLimit to avoid saturating the Python code caller pool, which
  // causes restart timeouts when too many renders run concurrently.
  const PARALLEL_SAMPLE_LIMIT = 3;
  const results: SampleEstimationResult[] = await async.mapLimit(
    sampled,
    PARALLEL_SAMPLE_LIMIT,
    async (instance_question: InstanceQuestion): Promise<SampleEstimationResult> => {
      try {
        const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);

        const locals = {
          ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
          questionRenderContext: 'ai_grading',
        };

        const questionModule = questionServers.getModule(question.type);

        const render_question_results = await questionModule.render({
          renderSelection: { question: true, submissions: false, answer: true },
          variant,
          question,
          submission: null,
          submissions: [],
          course: question_course,
          locals,
        });

        if (render_question_results.courseIssues.length > 0) {
          return {
            instance_question_id: instance_question.id,
            failed: true,
            stage: 'render',
            err: render_question_results.courseIssues,
          };
        }

        const questionPrompt = render_question_results.data.questionHtml;
        const questionAnswer = render_question_results.data.answerHtml;

        const render_submission_results = await questionModule.render({
          renderSelection: { question: false, submissions: true, answer: false },
          variant,
          question,
          submission,
          submissions: [submission],
          course: question_course,
          locals,
        });

        const submission_text = render_submission_results.data.submissionHtmls[0];

        // Apply mustache rendering to rubric items (same as in aiGrade).
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

        const tokenEntries = await Promise.all(
          AI_GRADING_MODELS.map(async (model) => {
            const tokenDetails = await countInputTokensForModelWithDetails(messages, model.modelId);
            return [model.modelId, tokenDetails] as const;
          }),
        );

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
            token_details,
          };
        }

        logCostEstimationSampleTokens({
          assessment_question_id: assessment_question.id,
          instance_question_id: instance_question.id,
          token_counts,
          token_details,
        });
        return { instance_question_id: instance_question.id, token_counts, token_details };
      } catch (err) {
        return {
          instance_question_id: instance_question.id,
          failed: true,
          stage: 'token_counting',
          err,
        };
      }
    },
  );

  for (const result of results) {
    if ('failed' in result) {
      logCostEstimationSampleFailure({
        assessment_question_id: assessment_question.id,
        instance_question_id: result.instance_question_id,
        stage: result.stage,
        token_details: result.token_details,
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

  if (successfulResults.length === 0) {
    logCostEstimationSummary({
      assessment_question_id: assessment_question.id,
      num_to_grade,
      sampled_count: sampled.length,
      successful_sample_count: 0,
      failed_sample_count: results.length,
      samples_with_any_fallback_count: diagnostics.samples_with_any_fallback_count,
      samples_failed_render_count: diagnostics.samples_failed_render_count,
      samples_failed_token_counting_count: diagnostics.samples_failed_token_counting_count,
      model_status_counts: diagnostics.model_status_counts,
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
    num_to_grade,
    sampled_count: sampled.length,
    successful_sample_count: successfulResults.length,
    failed_sample_count: results.length - successfulResults.length,
    samples_with_any_fallback_count: diagnostics.samples_with_any_fallback_count,
    samples_failed_render_count: diagnostics.samples_failed_render_count,
    samples_failed_token_counting_count: diagnostics.samples_failed_token_counting_count,
    model_status_counts: diagnostics.model_status_counts,
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

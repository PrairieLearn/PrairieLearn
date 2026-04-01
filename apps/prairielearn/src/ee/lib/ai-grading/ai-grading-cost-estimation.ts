import mustache from 'mustache';

import { HttpStatusError } from '@prairielearn/error';

import type {
  AssessmentQuestion,
  Course,
  CourseInstance,
  EnumAiGradingProvider,
  Question,
} from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import { resolveAiGradingKeys } from './ai-grading-credentials.js';
import { DEFAULT_AI_GRADING_MODEL } from './ai-grading-models.shared.js';
import { countInputTokensForProvider, countInputTokensLocal } from './ai-grading-token-counting.js';
import {
  filterInstanceQuestionsByMode,
  generatePrompt,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

// --- Output token estimation constants ---
// These are empirically tuned values for estimating output token usage.

/** Approximate number of characters per output token for code/HTML-heavy content. */
const CHARS_PER_OUTPUT_TOKEN = 3.04;

/** Average character length of the explanation field in the AI grading output. */
const AVG_EXPLANATION_LENGTH = 2259;

/**
 * Multiplier applied to input tokens to estimate reasoning token usage.
 * Reasoning tokens scale with input complexity and are priced at the output rate.
 */
const REASONING_INPUT_MULTIPLIER = 1;

/**
 * Estimates the output token count based on the grading result structure
 * with or without a rubric.
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
  avg_input_tokens: number;
  estimated_output_tokens: number;
  estimated_reasoning_tokens: number;
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

  if (num_to_grade === 0) {
    return {
      num_to_grade: 0,
      avg_input_tokens: 0,
      estimated_output_tokens,
      estimated_reasoning_tokens: 0,
    };
  }

  /** Maximum number of submissions to sample for token estimation. */
  const MAX_SAMPLE_SIZE = 10;

  const shuffled = [...filtered_instance_questions].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(MAX_SAMPLE_SIZE, num_to_grade));

  const question_course = await getQuestionCourse(question, course);

  // Render prompts and count tokens locally for all sampled submissions in parallel.
  const results = await Promise.all(
    sampled.map(async (instance_question) => {
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
          return null;
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

        return await countInputTokensLocal(messages);
      } catch {
        return null;
      }
    }),
  );

  const successful = results.filter((r): r is number => r !== null);

  if (successful.length === 0) {
    throw new HttpStatusError(
      500,
      `Cost estimation failed: all ${sampled.length} sampled submissions failed to render for assessment question ${assessment_question.id}`,
    );
  }

  const totalTokens = successful.reduce((sum, r) => sum + r, 0);
  const avg_input_tokens = Math.ceil(totalTokens / successful.length);
  const estimated_reasoning_tokens = Math.ceil(avg_input_tokens * REASONING_INPUT_MULTIPLIER);

  return {
    num_to_grade,
    avg_input_tokens,
    estimated_output_tokens,
    estimated_reasoning_tokens,
  };
}

/**
 * Counts input tokens for a specific provider by sampling submissions and
 * calling the provider's native token counting API. Only called on explicit
 * user intent (e.g. hovering/selecting a provider in the modal) to avoid
 * sending student data to providers the instructor hasn't chosen.
 */
export async function countTokensForProvider({
  assessment_question,
  question,
  course,
  course_instance,
  urlPrefix,
  mode,
  selected_instance_question_ids,
  provider,
}: {
  assessment_question: AssessmentQuestion;
  question: Question;
  course: Course;
  course_instance: CourseInstance;
  urlPrefix: string;
  mode: 'all' | 'human_graded' | 'selected';
  selected_instance_question_ids?: string[];
  provider: EnumAiGradingProvider;
}): Promise<{
  avg_input_tokens: number;
  estimated_reasoning_tokens: number;
}> {
  const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });

  const filtered_instance_questions = await filterInstanceQuestionsByMode(
    all_instance_questions,
    mode,
    selected_instance_question_ids,
  );

  if (filtered_instance_questions.length === 0) {
    return { avg_input_tokens: 0, estimated_reasoning_tokens: 0 };
  }

  const MAX_SAMPLE_SIZE = 10;
  const shuffled = [...filtered_instance_questions].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(MAX_SAMPLE_SIZE, filtered_instance_questions.length));

  const question_course = await getQuestionCourse(question, course);
  const apiKeys = await resolveAiGradingKeys(course_instance);
  const apiKey =
    provider === 'openai'
      ? (apiKeys.openai?.apiKey ?? null)
      : provider === 'google'
        ? (apiKeys.google?.apiKey ?? null)
        : (apiKeys.anthropic?.apiKey ?? null);

  const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);

  const results = await Promise.all(
    sampled.map(async (instance_question) => {
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

        if (render_question_results.courseIssues.length > 0) return null;

        const render_submission_results = await questionModule.render({
          renderSelection: { question: false, submissions: true, answer: false },
          variant,
          question,
          submission,
          submissions: [submission],
          course: question_course,
          locals,
        });

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
          questionPrompt: render_question_results.data.questionHtml,
          questionAnswer: render_question_results.data.answerHtml,
          submission_text: render_submission_results.data.submissionHtmls[0],
          submitted_answer: submission.submitted_answer,
          rubric_items: renderedRubricItems,
          grader_guidelines: rubric?.grader_guidelines ?? null,
          params: variant.params ?? {},
          true_answer: variant.true_answer ?? {},
          model_id: DEFAULT_AI_GRADING_MODEL,
        });

        return await countInputTokensForProvider(messages, provider, apiKey);
      } catch {
        return null;
      }
    }),
  );

  const successful = results.filter((r): r is number => r !== null);

  if (successful.length === 0) {
    return { avg_input_tokens: 0, estimated_reasoning_tokens: 0 };
  }

  const avg_input_tokens = Math.ceil(successful.reduce((sum, r) => sum + r, 0) / successful.length);
  const estimated_reasoning_tokens = Math.ceil(avg_input_tokens * REASONING_INPUT_MULTIPLIER);

  return { avg_input_tokens, estimated_reasoning_tokens };
}

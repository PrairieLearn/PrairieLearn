import type { ModelMessage } from 'ai';
import mustache from 'mustache';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import type { AssessmentQuestion, Course, Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import { DEFAULT_AI_GRADING_MODEL } from './ai-grading-models.shared.js';
import {
  filterInstanceQuestionsByMode,
  generatePrompt,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

// --- Token estimation constants ---
// These are approximate values that may need empirical tuning.

/** Approximate number of characters per token for English text. */
const CHARS_PER_TOKEN = 4;

/**
 * Approximate number of tokens consumed by a single image in the prompt.
 * TODO: Empirically derive this from past student submissions for `pl-image-capture`.
 */
const INPUT_TOKENS_PER_IMAGE = 1000;

/**
 * Approximate number of tokens for the explanation field in the AI grading output.
 * This represents a moderately-sized grading explanation.
 */
const EXPLANATION_OUTPUT_TOKENS = 400;

/**
 * Approximate number of tokens for the feedback field in the numeric scoring output.
 */
const FEEDBACK_OUTPUT_TOKENS = 200;

function estimateTokensFromMessages(messages: ModelMessage[]): {
  tokens: number;
  imageCount: number;
} {
  let totalTextLength = 0;
  let imageCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalTextLength += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          totalTextLength += part.text.length;
        } else if (part.type === 'image') {
          imageCount++;
        }
      }
    }
  }
  return {
    tokens: Math.ceil(totalTextLength / CHARS_PER_TOKEN) + imageCount * INPUT_TOKENS_PER_IMAGE,
    imageCount,
  };
}

/**
 * Estimates the output token count based on the grading result structure
 * with or without a rubric.
 */
function estimateOutputTokens(rubricItemDescriptions: string[]): number {
  const explanationPlaceholder = 'x'.repeat(EXPLANATION_OUTPUT_TOKENS * CHARS_PER_TOKEN);

  if (rubricItemDescriptions.length > 0) {
    // Reconstruct what the filled rubric output would look like.
    // We use `false` since it's the longer of the two boolean strings ("false" vs "true").
    const rubricOutputJson = JSON.stringify({
      explanation: explanationPlaceholder,
      rubric_items: Object.fromEntries(rubricItemDescriptions.map((desc) => [desc, false])),
    });
    return Math.ceil(rubricOutputJson.length / CHARS_PER_TOKEN);
  }
  // Numeric scoring: { "explanation": "...", "feedback": "...", "score": N }
  const feedbackPlaceholder = 'x'.repeat(FEEDBACK_OUTPUT_TOKENS * CHARS_PER_TOKEN);
  const numericOutputJson = JSON.stringify({
    explanation: explanationPlaceholder,
    feedback: feedbackPlaceholder,
    score: 0,
  });
  return Math.ceil(numericOutputJson.length / CHARS_PER_TOKEN);
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
  avg_input_tokens_per_submission: number;
  estimated_output_tokens: number;
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
      avg_input_tokens_per_submission: 0,
      estimated_output_tokens,
    };
  }

  // Randomly sort and take the first 20 submissions to estimate token counts.
  const shuffled = [...filtered_instance_questions].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, Math.min(20, num_to_grade));

  const question_course = await getQuestionCourse(question, course);

  let totalInputTokens = 0;
  let successCount = 0;

  for (const instance_question of sampled) {
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
        logger.error(
          `Cost estimation: rendering issues for instance question ${instance_question.id}`,
          render_question_results.courseIssues,
        );
        continue;
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
          explanation: item.explanation ? mustache.render(item.explanation, mustacheParams) : null,
          grader_note: item.grader_note ? mustache.render(item.grader_note, mustacheParams) : null,
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

      const { tokens } = estimateTokensFromMessages(messages);
      totalInputTokens += tokens;
      successCount++;
    } catch (err) {
      logger.error(
        `Cost estimation: failed to estimate tokens for instance question ${instance_question.id}`,
        err,
      );
    }
  }

  if (successCount === 0) {
    throw new HttpStatusError(
      500,
      `Cost estimation failed: all ${sampled.length} sampled submissions failed to render for assessment question ${assessment_question.id}`,
    );
  }

  const avg_input_tokens_per_submission = Math.ceil(totalInputTokens / successCount);

  return {
    num_to_grade,
    avg_input_tokens_per_submission,
    estimated_output_tokens,
  };
}

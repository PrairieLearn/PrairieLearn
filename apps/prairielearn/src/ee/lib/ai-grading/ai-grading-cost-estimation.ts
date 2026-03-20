import type { ModelMessage } from 'ai';
import mustache from 'mustache';

import { logger } from '@prairielearn/logger';
import { assertNever } from '@prairielearn/utils';

import type { AssessmentQuestion, Course, Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import { DEFAULT_AI_GRADING_MODEL } from './ai-grading-models.shared.js';
import { selectGradingJobsInfo } from './ai-grading-stats.js';
import {
  containsImageCapture,
  generatePrompt,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

function estimateTokensFromMessages(messages: ModelMessage[]): {
  tokens: number;
  imageCount: number;
} {
  let charCount = 0;
  let imageCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          charCount += part.text.length;
        } else if (part.type === 'image') {
          imageCount++;
        }
      }
    }
  }
  // ~4 chars per token for English text, ~1000 tokens per image
  return { tokens: Math.ceil(charCount / 4) + imageCount * 1000, imageCount };
}

export async function estimateAiGradingCost({
  assessment_question,
  question,
  course,
  urlPrefix,
  mode,
  instance_question_ids,
}: {
  assessment_question: AssessmentQuestion;
  question: Question;
  course: Course;
  urlPrefix: string;
  mode: 'all' | 'human_graded' | 'selected';
  instance_question_ids?: string[];
}): Promise<{
  num_to_grade: number;
  avg_input_tokens_per_submission: number;
  estimated_output_tokens: number;
  has_images: boolean;
  estimation_reliable: boolean;
}> {
  const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });

  const instanceQuestionGradingJobs = await selectGradingJobsInfo(all_instance_questions);

  const filtered_instance_questions = all_instance_questions.filter((instance_question) => {
    switch (mode) {
      case 'all':
        return true;
      case 'human_graded':
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return instanceQuestionGradingJobs[instance_question.id]?.some(
          (job) => job.grading_method === 'Manual',
        );
      case 'selected':
        return instance_question_ids?.includes(instance_question.id);
      default:
        assertNever(mode);
    }
  });

  const num_to_grade = filtered_instance_questions.length;

  if (num_to_grade === 0) {
    return {
      num_to_grade: 0,
      avg_input_tokens_per_submission: 0,
      estimated_output_tokens: 0,
      has_images: false,
      estimation_reliable: true,
    };
  }

  // Take a random sample of submissions to estimate token counts (Fisher-Yates).
  const sampleSize = Math.min(20, num_to_grade);
  const pool = [...filtered_instance_questions];
  for (let i = pool.length - 1; i > 0 && pool.length - i <= sampleSize; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sampled = pool.slice(pool.length - sampleSize);

  const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);
  const question_course = await getQuestionCourse(question, course);

  let totalInputTokens = 0;
  let successCount = 0;
  let has_images = false;

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

      if (containsImageCapture(submission_text)) {
        has_images = true;
      }

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

  const estimation_reliable = successCount > 0;
  if (!estimation_reliable) {
    logger.warn(
      `Cost estimation: all ${sampleSize} sampled submissions failed for assessment question ${assessment_question.id}`,
    );
  }

  const avg_input_tokens_per_submission =
    successCount > 0 ? Math.ceil(totalInputTokens / successCount) : 0;

  // Estimate output tokens based on rubric structure.
  let estimated_output_tokens: number;
  if (rubric_items.length > 0) {
    // Output: { explanation: string, rubric_items: { [desc]: boolean } }
    estimated_output_tokens = 200 + rubric_items.length * 5;
  } else {
    // Output: { explanation: string, feedback: string, score: number }
    estimated_output_tokens = 300;
  }

  if (has_images) {
    // Add extra tokens for image orientation and transcription.
    estimated_output_tokens += 120;
  }

  return {
    num_to_grade,
    avg_input_tokens_per_submission,
    estimated_output_tokens,
    has_images,
    estimation_reliable,
  };
}

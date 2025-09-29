import * as async from 'async';
import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInput } from 'openai/resources/responses/responses';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { formatPrompt, logResponseUsage } from '../../../lib/ai.js';
import { config } from '../../../lib/config.js';
import type {
  AssessmentQuestion,
  Course,
  InstanceQuestion,
  Question,
} from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import * as questionServers from '../../../question-servers/index.js';
import {
  generateSubmissionMessage,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from '../ai-grading/ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from '../ai-grading/types.js';

import {
  insertDefaultInstanceQuestionGroups,
  selectInstanceQuestionGroups,
  updateAiInstanceQuestionGroup,
} from './ai-instance-question-grouping-util.js';

const PARALLEL_INSTANCE_QUESTION_GROUPING_LIMIT = 20;

const INSTANCE_QUESTION_GROUPING_OPENAI_MODEL =
  'gpt-5-mini-2025-08-07' satisfies OpenAI.Chat.ChatModel;

/**
 * Given a question, the AI returns whether or not the student-provided final answer is correct.
 */
async function aiEvaluateStudentResponse({
  course,
  course_instance_id,
  question,
  assessment_question,
  instance_question,
  urlPrefix,
  openai,
  logger,
}: {
  course: Course;
  course_instance_id: string;
  question: Question;
  assessment_question: AssessmentQuestion;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  openai: OpenAI;
  logger: AIGradingLogger;
}) {
  const { submission, variant } = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: true },
    variant,
    question,
    submission,
    [submission],
    course,
    locals,
  );

  const answer_text = render_submission_results.data.answerHtml;
  const submission_text = render_submission_results.data.submissionHtmls[0];

  const submissionMessage = generateSubmissionMessage({
    submission_text,
    submitted_answer: submission.submitted_answer,
  });

  // Prompt the LLM to determine if the submission is correct or not.
  const input: ResponseInput = [
    {
      role: 'developer',
      content: formatPrompt([
        'Your role is to determine if a student submission is correct or not.',
        [
          "Identify the student's final answer.",
          "Then, identify the student's boxed answer.",
          'If the boxed answer exists, the response is the boxed answer. Otherwise, the response is the final answer.',
        ],
        [
          "Does the student's response match the correct answer exactly?",
          'The response must be PRECISELY mathematically equivalent to the correct answer as provided by the instructor.',
        ],
        [
          'Ensure that all parts of the correct answer are included.',
          'Any error in the response will disqualify it from being a correct answer.',
        ],
        [
          'If the response seems AMBIGUOUS (e.g. a few answers are present, one answer erased out, crossed out), mark it incorrect.',
        ],
        'The instructor has provided the following correct answer:',
      ]),
    },
    {
      role: 'user',
      content: answer_text,
    },
    {
      role: 'developer',
      content: 'Now, consider the following student submission:',
    },
    submissionMessage,
    {
      role: 'developer',
      content:
        'Please evaluate whether or not the student submission is correct according to the above instructions.',
    },
  ];

  const response = await openai.responses.parse({
    model: INSTANCE_QUESTION_GROUPING_OPENAI_MODEL,
    input,
    text: {
      format: zodTextFormat(
        z.object({
          correct: z.boolean().describe('Whether or not the student submission is correct.'),
        }),
        'response-evaluation',
      ),
    },
    metadata: {
      course_id: course.id.toString(),
      course_instance_id: course_instance_id.toString(),
      assessment_id: assessment_question.assessment_id,
      assessment_question_id: assessment_question.id,
      instance_question_id: instance_question.id,
    },
    prompt_cache_key: `assessment_question_${instance_question.assessment_question_id}_grouping`,
    safety_identifier: `course_${course.id}`,
  });

  logResponseUsage({ response, logger });

  const completionContent = response.output_parsed;

  if (!completionContent) {
    throw new Error('No response returned from OpenAI.');
  }

  return completionContent.correct;
}

/**
 * Groups student instance questions into AI instance question groups based on exact match to the final answer.
 * Answers that match go into one group; those that don’t are grouped separately.
 * Grouping checks for exact equivalence to the final answer, considering only the boxed or final answer.
 *
 * Instance question grouping is referred to as "AI submission grouping" in the user interface for clarity to users,
 * but as "instance question grouping" in the codebase to align with the database schema.
 */
export async function aiInstanceQuestionGrouping({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
  closed_instance_questions_only,
  instance_question_ids,
  ungrouped_instance_questions_only,
}: {
  question: Question;
  course: Course;
  course_instance_id: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
  closed_instance_questions_only: boolean;
  ungrouped_instance_questions_only: boolean;
  /**
   * Limit grading to the specified instance questions.
   * Only use when mode is 'selected'.
   */
  instance_question_ids?: string[];
}) {
  if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
    throw new HttpStatusError(403, 'Feature not available.');
  }

  const openai = new OpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization,
  });

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: authn_user_id,
    userId: user_id,
    type: 'ai_instance_question_grouping',
    description: 'Perform AI submission grouping',
  });

  const instanceQuestionIdsSet = new Set<string>(instance_question_ids ?? []);

  serverJob.executeInBackground(async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The assessment question has no manual grading');
      return;
    }

    const allInstanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
      assessment_question_id: assessment_question.id,
      closed_instance_questions_only,
      ungrouped_instance_questions_only,
    });

    const selectedInstanceQuestions =
      instanceQuestionIdsSet.size > 0
        ? allInstanceQuestions.filter((q) => instanceQuestionIdsSet.has(q.id))
        : allInstanceQuestions;

    job.info(
      `Grouping ${selectedInstanceQuestions.length} instance question${selectedInstanceQuestions.length !== 1 ? 's' : ''}...`,
    );

    await insertDefaultInstanceQuestionGroups({
      assessment_question_id: assessment_question.id,
    });

    const instanceQuestionGroups = await selectInstanceQuestionGroups({
      assessmentQuestionId: assessment_question.id,
    });

    const likelyCorrectGroup = instanceQuestionGroups.find(
      (g) => g.instance_question_group_name === 'Likely Correct',
    );
    const reviewNeededGroup = instanceQuestionGroups.find(
      (g) => g.instance_question_group_name === 'Review Needed',
    );

    if (!likelyCorrectGroup) {
      job.fail(
        `Missing 'Likely Correct' submission group for assessment question ${assessment_question.id}`,
      );
      return;
    }

    if (!reviewNeededGroup) {
      job.fail(
        `Missing 'Review Needed' submission group for assessment question ${assessment_question.id}`,
      );
      return;
    }

    let index = 1;
    const groupInstanceQuestion = async (
      total: number,
      instance_question: InstanceQuestion,
      logger: AIGradingLogger,
    ) => {
      const responseIsLikelyCorrect = await aiEvaluateStudentResponse({
        course,
        course_instance_id,
        question,
        assessment_question,
        instance_question,
        urlPrefix,
        openai,
        logger,
      });

      await updateAiInstanceQuestionGroup({
        instance_question_id: instance_question.id,
        ai_instance_question_group_id: responseIsLikelyCorrect
          ? likelyCorrectGroup.id
          : reviewNeededGroup.id,
      });

      logger.info(`Grouped instance question ${instance_question.id} (${index}/${total})`);
      index += 1;
      return true;
    };

    const instance_question_grouping_successes = await async.mapLimit(
      selectedInstanceQuestions,
      PARALLEL_INSTANCE_QUESTION_GROUPING_LIMIT,
      async (instanceQuestion) => {
        const logs: AIGradingLog[] = [];
        const logger: AIGradingLogger = {
          info: (msg: string) => {
            logs.push({
              messageType: 'info',
              message: msg,
            });
          },
          error: (msg: string) => {
            logs.push({
              messageType: 'error',
              message: msg,
            });
          },
        };

        try {
          return await groupInstanceQuestion(
            selectedInstanceQuestions.length,
            instanceQuestion,
            logger,
          );
        } catch (err) {
          logger.error(err);
        } finally {
          for (const log of logs) {
            if (log.messageType === 'info') {
              job.info(log.message);
            } else if (log.messageType === 'error') {
              job.error(log.message);
            }
          }
        }
      },
    );

    const errorCount = instance_question_grouping_successes.filter((success) => !success).length;

    if (errorCount > 0) {
      job.error('Number of errors: ' + errorCount);
      job.fail('Errors occurred during AI submission grouping, see output for details');
    } else {
      job.info('AI submission grouping completed successfully');
    }
  });
  return serverJob.jobSequenceId;
}

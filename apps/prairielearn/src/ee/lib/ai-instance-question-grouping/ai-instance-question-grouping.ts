import * as async from 'async';
import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

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

const INSTANCE_QUESTION_GROUPING_OPENAI_MODEL: OpenAI.Chat.ChatModel = 'gpt-5';

async function renderInstanceQuestionAnswerHtml({
  question,
  instance_question,
  course,
  urlPrefix,
}: {
  question: Question;
  instance_question: InstanceQuestion;
  course: Course;
  urlPrefix: string;
}) {
  const { submission, variant } = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: false, answer: true },
    variant,
    question,
    submission,
    [submission],
    course,
    locals,
  );

  return render_submission_results.data.answerHtml;
}

/**
 * Given a question, the AI returns whether or not the student-provided final answer is correct.
 */
async function aiEvaluateStudentResponse({
  question,
  question_answer,
  instance_question,
  course,
  urlPrefix,
  openai,
}: {
  question: Question;
  question_answer: string;
  instance_question: InstanceQuestion;
  course: Course;
  urlPrefix: string;
  openai: OpenAI;
}) {
  const { submission, variant } = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: false },
    variant,
    question,
    submission,
    [submission],
    course,
    locals,
  );

  const submission_text = render_submission_results.data.submissionHtmls[0];

  const submissionMessage = generateSubmissionMessage({
    submission_text,
    submitted_answer: submission.submitted_answer,
    include_ai_grading_prompts: false,
  });

  // Prompt the LLM to determine if the submission is correct or not.
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: 'Start of student submission:',
    },
    submissionMessage,
    {
      role: 'user',
      content: 'End of student submission.',
    },
    {
      role: 'user',
      content: `CORRECT ANSWER: \n${question_answer}`,
    },
    {
      role: 'user',
      content: `
Identify the student's final answer. Then, identify the student's box answer. Consider the box answer. If the boxed answer exists, response = boxed answer. Else, response = final answer.

Does the student's response match the correct answer exactly? Must be PRECISELY mathematically equivalent to the answer as written.

Ensure that all parts of the correct answer are included. Any error in the response will disqualify it from being a correct answer.

If it seems AMBIGUOUS (e.g. a few answers are present, one answer erased out, crossed out), mark it incorrect.

Return a boolean corresponding to whether or not the student's response is equivalent to the correct answer.
      `,
    },
  ];

  const completion = await openai.chat.completions.parse({
    messages,
    model: INSTANCE_QUESTION_GROUPING_OPENAI_MODEL,
    user: `course_${course.id}`,
    response_format: zodResponseFormat(
      z.object({
        correct: z.boolean(),
      }),
      'response-evaluation',
    ),
  });

  const completionContent = completion.choices[0].message.parsed;

  if (!completionContent) {
    throw new Error('No completion content returned from OpenAI.');
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
  course_instance_id?: string;
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

  const instanceQuestionIdsSet: Set<string> = instance_question_ids
    ? new Set(instance_question_ids)
    : new Set();

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

    job.info(`Grouping ${selectedInstanceQuestions.length} instance questions...`);

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
      const answerHtml = await renderInstanceQuestionAnswerHtml({
        question,
        instance_question,
        course,
        urlPrefix,
      });

      if (!answerHtml) {
        logger.error(
          `Instance question ${instance_question.id} has no answer. Ensure that every instance question has an answer in pl-answer-panel.`,
        );
        return false;
      }

      const responseIsLikelyCorrect = await aiEvaluateStudentResponse({
        question,
        question_answer: answerHtml,
        instance_question,
        course,
        urlPrefix,
        openai,
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

    if (error_count > 0) {
      job.error('Number of errors: ' + errorCount);
      job.fail('Errors occurred during AI submission grouping, see output for details');
    } else {
      job.info('AI submission grouping completed successfully');
    }
  });
  return serverJob.jobSequenceId;
}

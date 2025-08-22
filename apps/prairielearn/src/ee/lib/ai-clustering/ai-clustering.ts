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
  insertDefaultAiClusters,
  selectAiClusters,
  updateAiCluster,
} from './ai-clustering-util.js';

const PARALLEL_SUBMISSION_CLUSTERING_LIMIT = 20;

const CLUSTERING_OPENAI_MODEL: OpenAI.Chat.ChatModel = 'gpt-4o';

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
    model: CLUSTERING_OPENAI_MODEL,
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
 * Clusters student submissions based on if their answers match the correct answer exactly. This answer must be in pl-answer-panel.
 * Answers that match go into one cluster, and those that don’t are grouped separately.
 * Clustering checks for exact equivalence to the final answer, considering only the boxed or final answer to form groups.
 */
export async function aiCluster({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
  closed_instance_questions_only,
  instance_question_ids,
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
  closed_instance_questions_only: boolean;
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
    type: 'ai_clustering',
    description: 'Perform AI clustering',
  });

  const instanceQuestionIdsSet: Set<string> = instance_question_ids
    ? new Set(instance_question_ids)
    : new Set();

  serverJob.executeInBackground(async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The assessment question has no manual grading');
    }

    const allInstanceQuestions = await selectInstanceQuestionsForAssessmentQuestion(
      assessment_question.id,
      closed_instance_questions_only,
    );

    const selectedInstanceQuestions =
      instanceQuestionIdsSet.size > 0
        ? allInstanceQuestions.filter((q) => instanceQuestionIdsSet.has(q.id))
        : allInstanceQuestions;

    job.info(`Clustering ${selectedInstanceQuestions.length} instance questions...`);

    await insertDefaultAiClusters({
      assessment_question_id: assessment_question.id,
    });

    const clusters = await selectAiClusters({
      assessmentQuestionId: assessment_question.id,
    });

    // TODO: Match the official cluster list to these clusters. Throw an error.

    const likelyMatchCluster = clusters.find((c) => c.cluster_name === 'Likely Match');
    const reviewNeededCluster = clusters.find((c) => c.cluster_name === 'Review Needed');

    if (!likelyMatchCluster) {
      // Handle missing likely match cluster
      throw new Error(
        `Missing likely match cluster for assessment question ${assessment_question.id}`,
      );
    }

    if (!reviewNeededCluster) {
      // Handle missing review needed cluster
      throw new Error(
        `Missing review needed cluster for assessment question ${assessment_question.id}`,
      );
    }

    let index = 1;
    const clusterInstanceQuestion = async (
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

      const responseCorrect = await aiEvaluateStudentResponse({
        question,
        question_answer: answerHtml,
        instance_question,
        course,
        urlPrefix,
        openai,
      });

      await updateAiCluster({
        instance_question_id: instance_question.id,
        ai_cluster_id: responseCorrect ? likelyMatchCluster.id : reviewNeededCluster.id,
      });
      logger.info(`Clustered instance question ${instance_question.id} (${index}/${total})`);
      index += 1;
      return true;
    };

    const instance_question_clustering_successes = await async.mapLimit(
      selectedInstanceQuestions,
      PARALLEL_SUBMISSION_CLUSTERING_LIMIT,
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
          return await clusterInstanceQuestion(
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
    const error_count = instance_question_clustering_successes.filter((success) => !success).length;

    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred during AI clustering, see output for details');
    } else {
      job.info('AI clustering completed successfully');
    }
  });
  return serverJob.jobSequenceId;
}

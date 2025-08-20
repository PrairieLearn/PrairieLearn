import * as async from 'async';
import { OpenAI } from 'openai';

import { HttpStatusError } from '@prairielearn/error';

import { config } from '../../../lib/config.js';
import type { AssessmentQuestion, Course, InstanceQuestion, Question } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectInstanceQuestionsForAssessmentQuestion } from '../ai-grading/ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from '../ai-grading/types.js';

import { aiEvaluateStudentResponse, getInstanceQuestionAnswer, insertAiClusters, selectAiClusters, updateAiCluster } from './ai-clustering-util.js';


const PARALLEL_SUBMISSION_CLUSTERING_LIMIT = 20;

/**
 * Groups instance questions into "Correct" and "Potentially not correct" clusters using AI.
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
  instance_question_ids
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



    // If OpenAI API Key and Organization are not provided, throw an error
    if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
        throw new HttpStatusError(403, 'Not implemented (feature not available)');
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

    const instanceQuestionIdsSet: Set<string> = instance_question_ids ? new Set(instance_question_ids) : new Set();

    serverJob.executeInBackground(async (job) => {
        if (!assessment_question.max_manual_points) {
            job.fail('The assessment question has no manual grading');
        }

        const allInstanceQuestions = await selectInstanceQuestionsForAssessmentQuestion(
            assessment_question.id,
            closed_instance_questions_only
        );

        const selectedInstanceQuestions = instanceQuestionIdsSet.size > 0
            ? allInstanceQuestions.filter((q) => instanceQuestionIdsSet.has(q.id))
            : allInstanceQuestions;
            
        job.info(`Clustering ${selectedInstanceQuestions.length} instance questions...`)

        await insertAiClusters({
          assessment_question_id: assessment_question.id,
        });

        const clusters = await selectAiClusters({
          assessmentQuestionId: assessment_question.id
        });

        const likelyMatchCluster = clusters.find((c) => c.cluster_name === 'Likely Match');
        const reviewNeededCluster = clusters.find((c) => c.cluster_name === 'Review Needed');

        if (!likelyMatchCluster) {
          // Handle missing likely match cluster
          throw new Error(`Missing likely match cluster for assessment question ${assessment_question.id}`);
        }

        if (!reviewNeededCluster) {
          // Handle missing review needed cluster
          throw new Error(`Missing review needed cluster for assessment question ${assessment_question.id}`);
        }

        let index = 1;
        const clusterInstanceQuestion = async (
            total: number,
            instance_question: InstanceQuestion,
            logger: AIGradingLogger
        ) => {
            // Render the question's answer
            const question_answer = await getInstanceQuestionAnswer({
                question,
                instance_question,
                course,
                urlPrefix
            });

            if (!question_answer) {
                logger.error(`Instance question ${instance_question.id} has no answer. Ensure that every instance question has an answer in pl-answer-panel.`)
                return false;
            }

            const responseCorrect = await aiEvaluateStudentResponse({
                question,
                question_answer,
                instance_question,
                course,
                urlPrefix,
                openai
            });

            await updateAiCluster({
              instance_question_id: instance_question.id,
              ai_cluster_id: responseCorrect ? likelyMatchCluster.id : reviewNeededCluster.id
            });
            logger.info(`Clustered instance question ${instance_question.id} (${index}/${total})`);
            index += 1;
            return true;
        }

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
                    return await clusterInstanceQuestion(selectedInstanceQuestions.length, instanceQuestion, logger);
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
            }
        )
        const error_count = instance_question_clustering_successes.filter(success => !success).length;

        if (error_count > 0) {
            job.error('Number of errors: ' + error_count);
            job.fail('Errors occurred during AI clustering, see output for details');
        } else {
            job.info('AI clustering completed successfully');
        }
    });
    return serverJob.jobSequenceId;
}
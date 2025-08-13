import * as async from 'async';
import { OpenAI } from 'openai';

import { HttpStatusError } from '@prairielearn/error';

import { config } from '../../../lib/config.js';
import type { AssessmentQuestion, Course, InstanceQuestion, Question } from '../../../lib/db-types.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectInstanceQuestionsForAssessmentQuestion } from '../ai-grading/ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from '../ai-grading/types.js';


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
  mode,
  instance_question_ids,
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
  mode: 'all' | 'selected';
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

    const question_course = await getQuestionCourse(question, course);

    const serverJob = await createServerJob({
        courseId: course.id,
        courseInstanceId: course_instance_id,
        assessmentId: assessment_question.assessment_id,
        authnUserId: authn_user_id,
        userId: user_id,
        type: 'ai_clustering',
        description: 'Perform AI clustering',
    });

    serverJob.executeInBackground(async (job) => {
        if (!assessment_question.max_manual_points) {
            job.fail('The assessment question has no manual grading');
        }

        const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion(
            assessment_question.id,
        );

        const clusterInstanceQuestion = async (
            instance_question: InstanceQuestion,
            logger: AIGradingLogger
        ) => {
            logger.info('Test');            
            return true;
        }

        const instance_question_clustering_successes = await async.mapLimit(
            all_instance_questions,
            PARALLEL_SUBMISSION_CLUSTERING_LIMIT,
            async (instance_question: InstanceQuestion) => {
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
                    return await clusterInstanceQuestion(instance_question, logger);
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
        }
    });
    return serverJob.jobSequenceId;
}
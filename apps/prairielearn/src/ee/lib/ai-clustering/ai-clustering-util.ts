


import z from 'zod';

import { loadSqlEquiv, queryAsync, queryOptionalRow, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { AiClusterSchema, type Assessment, type Course, type InstanceQuestion, type Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import * as questionServers from '../../../question-servers/index.js';
import { generateSubmissionMessage, selectLastVariantAndSubmission, selectRubricGradingItems } from '../ai-grading/ai-grading-util.js';

import type { SubmissionDebugData } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const STANDARD_CLUSTERS = [
    'Correct', 'Incorrect'
]

/** Insert the clusters for an assessment question if they don't exist */
export async function insertAiClusters({
    assessment_question_id
}: {
    assessment_question_id: string
}) {
    const aiClustersExist = await queryRow(sql.select_exists_ai_clusters, {
        assessment_question_id
    }, z.boolean());
    if (aiClustersExist) {
        return;
    }

    await runInTransactionAsync(async () => {
        for (const cluster_name of STANDARD_CLUSTERS) {
            await queryAsync(sql.create_ai_cluster, {
                assessment_question_id,
                cluster_name 
            });
        }
    });
}

/** Assign an AI cluster to an instance question */
export async function assignAiCluster({
    instanceQuestionId, 
    aiClusterId
}: {
    instanceQuestionId: string,
    aiClusterId: string 
}) {
    await queryAsync(sql.upsert_ai_cluster_for_instance_question, {
        instance_question_id: instanceQuestionId,
        ai_cluster_id: aiClusterId
    })
}

export async function getAiClusterAssignmentForInstanceQuestion({
    instanceQuestionId
}: {
    instanceQuestionId: string
}) {
    return await queryOptionalRow(sql.select_ai_cluster_assignment_for_instance_question, {
        instance_question_id: instanceQuestionId
    }, z.string().nullable());
}

export async function getAiClusterAssignment({
    assessment_question_id
}: {
    assessment_question_id: string
}) {
    return (await queryRows(sql.select_ai_cluster_assignment,
        {
            assessment_question_id
        },
        z.object({
            cluster_name: z.string(),
            instance_question_id: z.string(),
        })
    )).reduce((acc, { cluster_name, instance_question_id }) => {
        acc[instance_question_id] = cluster_name;
        return acc;
    }, {} as Record<string, string>);
}

/** Retrieve all AI clusters for an assessment question */
export async function getAiClusters({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    return await queryRows(sql.select_ai_clusters, {
        assessment_question_id: assessmentQuestionId
    }, AiClusterSchema);
}

/** Generate submission evaluation data for clusters that were generated. */
export async function generateSubmissionEvaluationData({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    const clusters = await getAiClusters({ assessmentQuestionId });
    // Generate evaluation data based on the clusters
    const evaluationData = clusters.map(cluster => ({
        clusterId: cluster.id,
        clusterName: cluster.cluster_name,
        // Add more fields as needed
    }));
    return evaluationData;
}

export async function generateSubmissionDebuggingData({
    course,
    question,
    assessment,
    instanceQuestion,
    cluster,
    answer,
    urlPrefix,
    includeImages
}: {
    course: Course,
    question: Question,
    assessment: Assessment;
    instanceQuestion: InstanceQuestion, 
    cluster: string,
    answer: string,
    urlPrefix: string,
    includeImages: boolean
}): Promise<SubmissionDebugData> {
    const { submission, variant } = await selectLastVariantAndSubmission(instanceQuestion.id);
    const locals = {
        ...buildQuestionUrls(urlPrefix, variant, question, instanceQuestion),
        questionRenderContext: 'ai_grading',
    };
    const questionModule = questionServers.getModule(question.type);
    const render_submission_results = await questionModule.render({ question: false, submissions: true, answer: false },
        variant,
        question,
        submission,
        [submission],
        course,
        locals,
    );
    const submission_text = render_submission_results.data.submissionHtmls[0];

    const rubric_items = await selectRubricGradingItems(submission.manual_rubric_grading_id);

    const submissionMessage = generateSubmissionMessage({
        submission_text,
        submitted_answer: submission.submitted_answer,
        is_grading: false, // This is not a grading request, so we don't need the grading prompt.
    });

    const images: string[] = [];
    if (includeImages && submissionMessage && submissionMessage.content) {
        for (const part of submissionMessage.content) {
            if (typeof part === 'object' && part.type === 'image_url') {
                images.push(part.image_url.url);
            }
        }
    }

    // TODO: pull whether or not the AI thought it was correct
    return {
        instance_question_id: instanceQuestion.id,
        assessment_question_id: instanceQuestion.assessment_question_id,
        link_to_instance_question: `${config.serverCanonicalHost}/pl/course_instance/${assessment.course_instance_id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instanceQuestion.id}`,
        answer,
        cluster,
        images,
        rubric_items,
    }
}
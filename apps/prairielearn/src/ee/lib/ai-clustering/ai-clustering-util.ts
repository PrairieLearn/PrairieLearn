


import z from 'zod';

import { loadSqlEquiv, queryAsync, queryOptionalRow, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AiClusterSchema } from '../../../lib/db-types.js';

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
    }));
    return evaluationData;
}
import z from 'zod';

import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { AiClusterSchema } from '../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const STANDARD_CLUSTERS = [
  {
    name: 'Likely Match',
    description: 'The final answer likely matches the correct answer.',
  },
  {
    name: 'Review Needed',
    description: 'The AI model could not confidently determine that the final answer is correct.',
  },
];

/** Insert the default clusters for an assessment question if they don't exist */
export async function insertDefaultAiClusters({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  const aiClustersExist = await selectAssessmentQuestionHasAiClusters({
    assessmentQuestionId: assessment_question_id,
  });
  if (aiClustersExist) {
    return;
  }

  await runInTransactionAsync(async () => {
    for (const clusterInfo of STANDARD_CLUSTERS) {
      await queryAsync(sql.insert_ai_cluster, {
        assessment_question_id,
        cluster_name: clusterInfo.name,
        cluster_description: clusterInfo.description,
      });
    }
  });
}

export async function selectAiCluster(ai_cluster_id: string) {
  return await queryRow(
    sql.select_ai_cluster,
    {
      ai_cluster_id,
    },
    AiClusterSchema,
  );
}

/** Set the AI cluster of an instance question. */
export async function updateAiCluster({
  instance_question_id,
  ai_cluster_id,
}: {
  instance_question_id: string;
  ai_cluster_id: string;
}) {
  await queryAsync(sql.update_instance_question_ai_cluster, {
    instance_question_id,
    ai_cluster_id,
  });
}

export async function selectAssessmentQuestionHasAiClusters({
  assessmentQuestionId,
}: {
  assessmentQuestionId: string;
}) {
  return await queryRow(
    sql.select_assessment_question_has_ai_clusters,
    {
      assessment_question_id: assessmentQuestionId,
    },
    z.boolean(),
  );
}

export async function selectAiClusters({ assessmentQuestionId }: { assessmentQuestionId: string }) {
  return await queryRows(
    sql.select_ai_clusters,
    {
      assessment_question_id: assessmentQuestionId,
    },
    AiClusterSchema,
  );
}

export async function resetInstanceQuestionsAiClusters({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  return await queryRow(
    sql.reset_instance_questions_ai_clusters,
    {
      assessment_question_id,
    },
    z.number(),
  );
}

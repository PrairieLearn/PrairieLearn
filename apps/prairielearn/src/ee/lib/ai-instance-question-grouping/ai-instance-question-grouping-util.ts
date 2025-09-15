import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { InstanceQuestionGroupSchema } from '../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const STANDARD_INSTANCE_QUESTION_GROUPS = [
  {
    instance_question_group_name: 'Likely Correct',
    instance_question_group_description: 'The final answer likely matches the correct answer.',
  },
  {
    instance_question_group_name: 'Review Needed',
    instance_question_group_description:
      'The AI model could not confidently determine that the final answer is correct.',
  },
];

/** Insert the default instance question groups for an assessment question if they don't exist */
export async function insertDefaultInstanceQuestionGroups({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  const hasGroups = await selectAssessmentQuestionHasInstanceQuestionGroups({
    assessmentQuestionId: assessment_question_id,
  });
  if (hasGroups) return;

  await runInTransactionAsync(async () => {
    for (const groupInfo of STANDARD_INSTANCE_QUESTION_GROUPS) {
      await execute(sql.insert_instance_question_group, {
        assessment_question_id,
        instance_question_group_name: groupInfo.instance_question_group_name,
        instance_question_group_description: groupInfo.instance_question_group_description,
      });
    }
  });
}

export async function selectInstanceQuestionGroup(instance_question_group_id: string) {
  return await queryRow(
    sql.select_instance_question_group,
    {
      instance_question_group_id,
    },
    InstanceQuestionGroupSchema,
  );
}

export async function updateAiInstanceQuestionGroup({
  instance_question_id,
  ai_instance_question_group_id,
}: {
  instance_question_id: string;
  ai_instance_question_group_id: string | null;
}) {
  await execute(sql.update_instance_question_ai_instance_question_group, {
    instance_question_id,
    ai_instance_question_group_id,
  });
}

/**
 * Set the instance question group of an instance question manually.
 * Manual group assignments take precedence over AI assignments.
 */
export async function updateManualInstanceQuestionGroup({
  instance_question_id,
  manual_instance_question_group_id,
}: {
  instance_question_id: string;
  manual_instance_question_group_id: string | null;
}) {
  await execute(sql.update_instance_question_manual_instance_question_group, {
    instance_question_id,
    manual_instance_question_group_id,
  });

  if (!manual_instance_question_group_id) {
    // Also clear the AI instance question group. If we don't do this, the
    // instance question will be assigned to the AI instance question group,
    // which contradicts the user's intention to have no group assigned.
    await updateAiInstanceQuestionGroup({
      instance_question_id,
      ai_instance_question_group_id: null,
    });
  }
}

export async function selectAssessmentQuestionHasInstanceQuestionGroups({
  assessmentQuestionId,
}: {
  assessmentQuestionId: string;
}) {
  return await queryRow(
    sql.select_assessment_question_has_instance_question_groups,
    {
      assessment_question_id: assessmentQuestionId,
    },
    z.boolean(),
  );
}

export async function selectInstanceQuestionGroups({
  assessmentQuestionId,
}: {
  assessmentQuestionId: string;
}) {
  return await queryRows(
    sql.select_instance_question_groups,
    {
      assessment_question_id: assessmentQuestionId,
    },
    InstanceQuestionGroupSchema,
  );
}

export async function deleteAiInstanceQuestionGroups({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  return await queryRow(
    sql.delete_ai_instance_question_groups,
    {
      assessment_question_id,
    },
    z.number(),
  );
}

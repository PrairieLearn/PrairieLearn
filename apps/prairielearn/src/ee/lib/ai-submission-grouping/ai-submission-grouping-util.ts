import z from 'zod';

import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { AiSubmissionGroupSchema } from '../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const STANDARD_SUBMISSION_GROUPS = [
  {
    submission_group_name: 'Likely Correct',
    submission_group_description: 'The final answer likely matches the correct answer.',
  },
  {
    submission_group_name: 'Review Needed',
    submission_group_description:
      'The AI model could not confidently determine that the final answer is correct.',
  },
];

/** Insert the default submission groups for an assessment question if they don't exist */
export async function insertDefaultAiSubmissionGroups({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  const hasGroups = await selectAssessmentQuestionHasAiSubmissionGroups({
    assessmentQuestionId: assessment_question_id,
  });
  if (hasGroups) return;

  await runInTransactionAsync(async () => {
    for (const groupInfo of STANDARD_SUBMISSION_GROUPS) {
      await queryAsync(sql.insert_ai_submission_group, {
        assessment_question_id,
        submission_group_name: groupInfo.submission_group_name,
        submission_group_description: groupInfo.submission_group_description,
      });
    }
  });
}

export async function selectAiSubmissionGroup(ai_submission_group_id: string) {
  return await queryRow(
    sql.select_ai_submission_group,
    {
      ai_submission_group_id,
    },
    AiSubmissionGroupSchema,
  );
}

/** Set the AI submission group of an instance question. */
export async function updateAiSubmissionGroup({
  instance_question_id,
  ai_submission_group_id,
}: {
  instance_question_id: string;
  ai_submission_group_id: string;
}) {
  await queryAsync(sql.update_instance_question_ai_submission_group, {
    instance_question_id,
    ai_submission_group_id,
  });
}

export async function selectAssessmentQuestionHasAiSubmissionGroups({
  assessmentQuestionId,
}: {
  assessmentQuestionId: string;
}) {
  return await queryRow(
    sql.select_assessment_question_has_ai_submission_groups,
    {
      assessment_question_id: assessmentQuestionId,
    },
    z.boolean(),
  );
}

export async function selectAiSubmissionGroups({
  assessmentQuestionId,
}: {
  assessmentQuestionId: string;
}) {
  return await queryRows(
    sql.select_ai_submission_groups,
    {
      assessment_question_id: assessmentQuestionId,
    },
    AiSubmissionGroupSchema,
  );
}

export async function deleteInstanceQuestionsAiSubmissionGroups({
  assessment_question_id,
}: {
  assessment_question_id: string;
}) {
  return await queryRow(
    sql.delete_instance_questions_ai_submission_groups,
    {
      assessment_question_id,
    },
    z.number(),
  );
}

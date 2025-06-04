import assert from 'node:assert';

import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString } from '@prairielearn/zod';

import {
  type AssessmentQuestion,
  IdSchema,
  type RubricItem,
  RubricItemSchema,
} from '../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);
const GradingJobInfoSchema = z.object({
  grading_job_id: IdSchema,
  graded_at: DateFromISOString.nullable(),
  grading_method: z.enum(['Manual', 'AI']),
  manual_points: z.number().nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
  grader_name: z.string(),
  rubric_items: z.array(RubricItemSchema),
});
type GradingJobInfo = z.infer<typeof GradingJobInfoSchema>;

export interface AIGradingStats {
  last_human_grader: string | null;
  ai_grading_status: 'Graded' | 'Latest' | 'Outdated' | 'None';
  point_difference: number | null;
  rubric_difference: (RubricItem & { false_positive: boolean })[] | null;
}

export type WithAIGradingStats<T> = T & AIGradingStats;

/**
 * Fills in missing columns for manual grading assessment question page.
 * This includes organizing information about past graders
 * and calculating point and/or rubric difference between human and AI.
 */
export async function fillInstanceQuestionColumns<T extends { id: string }>(
  instance_questions: T[],
  assessment_question: AssessmentQuestion,
): Promise<WithAIGradingStats<T>[]> {
  const rubric_modify_time = await queryOptionalRow(
    sql.select_rubric_time,
    { rubric_id: assessment_question.manual_rubric_id },
    DateFromISOString,
  );

  const instance_question_ids = instance_questions.map((iq) => iq.id);
  const grading_jobs = await queryRows(
    sql.select_ai_and_human_grading_jobs_and_rubric,
    { instance_question_ids },
    GradingJobInfoSchema.extend({ instance_question_id: IdSchema }),
  );
  const gradingJobMapping = grading_jobs.reduce(
    (acc, item) => {
      if (!acc[item.instance_question_id]) acc[item.instance_question_id] = [];
      acc[item.instance_question_id].push(item);
      return acc;
    },
    {} as Record<string, GradingJobInfo[]>,
  );

  const results: WithAIGradingStats<T>[] = [];

  for (const base_instance_question of instance_questions) {
    const instance_question: WithAIGradingStats<T> = {
      ...base_instance_question,
      last_human_grader: null,
      ai_grading_status: 'None',
      point_difference: null,
      rubric_difference: null,
    };
    results.push(instance_question);

    const grading_jobs = gradingJobMapping[instance_question.id] ?? [];

    let manualGradingJob: GradingJobInfo | null = null;
    let aiGradingJob: GradingJobInfo | null = null;

    for (const grading_job of grading_jobs) {
      assert(grading_job.graded_at);
      if (grading_job.grading_method === 'Manual') {
        manualGradingJob = grading_job;
        instance_question.last_human_grader = grading_job.grader_name;
      } else {
        aiGradingJob = grading_job;
        instance_question.ai_grading_status = 'Graded';
        if (rubric_modify_time) {
          instance_question.ai_grading_status =
            grading_job.graded_at > rubric_modify_time ? 'Latest' : 'Outdated';
        }
      }
    }

    if (
      !manualGradingJob ||
      !aiGradingJob ||
      manualGradingJob.manual_points === null ||
      aiGradingJob.manual_points === null
    ) {
      continue;
    }
    instance_question.point_difference =
      aiGradingJob.manual_points - manualGradingJob.manual_points;

    if (!manualGradingJob.manual_rubric_grading_id || !aiGradingJob.manual_rubric_grading_id) {
      continue;
    }
    const manualItems = manualGradingJob.rubric_items;
    const aiItems = aiGradingJob.rubric_items;
    const fpItems = aiItems
      .filter((item) => !rubricListIncludes(manualItems, item))
      .map((item) => ({ ...item, false_positive: true }));
    const fnItems = manualItems
      .filter((item) => !rubricListIncludes(aiItems, item))
      .map((item) => ({ ...item, false_positive: false }));
    instance_question.rubric_difference = fnItems.concat(fpItems);
  }

  return results;
}

function rubricListIncludes(items: RubricItem[], itemToCheck: RubricItem): boolean {
  return items.some((item) => item.id === itemToCheck.id);
}

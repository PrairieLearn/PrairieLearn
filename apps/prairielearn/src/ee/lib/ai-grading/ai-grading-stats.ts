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
  ai_grading_status: 'Graded' | 'LatestRubric' | 'OutdatedRubric' | 'None';
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

  const grading_jobs = await queryRows(
    sql.select_ai_and_human_grading_jobs_and_rubric,
    { instance_question_ids: instance_questions.map((iq) => iq.id) },
    GradingJobInfoSchema.extend({ instance_question_id: IdSchema }),
  );
  // Construct mapping from instance question id to grading job info
  const gradingJobMapping = grading_jobs.reduce(
    (acc, item) => {
      acc[item.instance_question_id] ??= [];
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

    const manualGradingJob = grading_jobs.find((job) => job.grading_method === 'Manual');
    const aiGradingJob = grading_jobs.find((job) => job.grading_method === 'AI');

    if (manualGradingJob) {
      instance_question.last_human_grader = manualGradingJob.grader_name;
    }

    if (aiGradingJob) {
      assert(aiGradingJob.graded_at);
      instance_question.ai_grading_status = 'Graded';
      if (rubric_modify_time) {
        instance_question.ai_grading_status =
          aiGradingJob.graded_at > rubric_modify_time ? 'LatestRubric' : 'OutdatedRubric';
      }
    }

    if (manualGradingJob?.manual_points != null && aiGradingJob?.manual_points != null) {
      instance_question.point_difference =
        aiGradingJob.manual_points - manualGradingJob.manual_points;
    }

    if (manualGradingJob?.manual_rubric_grading_id && aiGradingJob?.manual_rubric_grading_id) {
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
  }
  return results;
}

function rubricListIncludes(items: RubricItem[], itemToCheck: RubricItem): boolean {
  return items.some((item) => item.id === itemToCheck.id);
}

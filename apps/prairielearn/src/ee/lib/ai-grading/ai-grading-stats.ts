import assert from 'node:assert';

import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString } from '@prairielearn/zod';

import {
  type AssessmentQuestion,
  IdSchema,
  RubricGradingItemSchema,
  type RubricItem,
  RubricItemSchema,
} from '../../../lib/db-types.js';

import {
  selectInstanceQuestionsForAssessmentQuestion,
  selectRubricForGrading,
} from './ai-grading-util.js';
import type { WithAIGradingStats } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const RubricGradingToItemSchema = z.object({
  rubric_grading_id: RubricGradingItemSchema.shape.rubric_grading_id,
  ...RubricItemSchema.shape,
});

const GradingJobInfoSchema = z.object({
  grading_job_id: IdSchema,
  grading_method: z.enum(['Manual', 'AI']),
  graded_at: DateFromISOString.nullable(),
  manual_points: z.number().nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
  grader_name: z.string(),
  rubric_items: z.array(RubricGradingToItemSchema),
});
type GradingJobInfo = z.infer<typeof GradingJobInfoSchema>;

export interface AiGradingGeneralStats {
  submission_point_count: number;
  submission_rubric_count: number;
  mean_error: number | null;
  rubric_stats: {
    // Keeping all information for a rubric item
    // if we want to implement rubric modification here
    rubric_item: RubricItem;
    disagreement_count: number;
  }[];
}

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

  const gradingJobMapping = await selectGradingJobsInfo(instance_questions);

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

export async function calculateAiGradingStats(
  assessment_question: AssessmentQuestion,
): Promise<AiGradingGeneralStats> {
  const instance_questions = await selectInstanceQuestionsForAssessmentQuestion(
    assessment_question.id,
  );
  const rubric_items = await selectRubricForGrading(assessment_question.id);

  const gradingJobMapping = await selectGradingJobsInfo(instance_questions);

  const testRubricResults: {
    reference_items: Set<string>;
    ai_items: Set<string>;
  }[] = [];
  const testPointResults: {
    reference_points: number;
    ai_points: number;
  }[] = [];

  for (const instance_question of instance_questions) {
    const grading_jobs = gradingJobMapping[instance_question.id] ?? [];

    const manualGradingJob = grading_jobs.find((job) => job.grading_method === 'Manual');
    const aiGradingJob = grading_jobs.find((job) => job.grading_method === 'AI');

    if (manualGradingJob?.manual_points != null && aiGradingJob?.manual_points != null) {
      testPointResults.push({
        reference_points: manualGradingJob.manual_points,
        ai_points: aiGradingJob.manual_points,
      });
    }
    if (manualGradingJob?.rubric_items != null && aiGradingJob?.rubric_items != null) {
      testRubricResults.push({
        reference_items: new Set(manualGradingJob.rubric_items.map((item) => item.id)),
        ai_items: new Set(aiGradingJob.rubric_items.map((item) => item.id)),
      });
    }
  }

  const stats: AiGradingGeneralStats = {
    submission_point_count: testPointResults.length,
    submission_rubric_count: testRubricResults.length,
    mean_error: testPointResults.length
      ? meanError(
          testPointResults.map((item) => item.reference_points),
          testPointResults.map((item) => item.ai_points),
        )
      : null,
    rubric_stats: [],
  };
  for (const rubric_item of rubric_items) {
    const disagreement_count = rubricItemDisagreementCount(testRubricResults, rubric_item);
    stats.rubric_stats.push({
      rubric_item,
      disagreement_count,
    });
  }
  return stats;
}

async function selectGradingJobsInfo<T extends { id: string }>(
  instance_questions: T[],
): Promise<Record<string, GradingJobInfo[]>> {
  const grading_jobs = await queryRows(
    sql.select_ai_and_human_grading_jobs_and_rubric,
    { instance_question_ids: instance_questions.map((iq) => iq.id) },
    GradingJobInfoSchema.extend({ instance_question_id: IdSchema }),
  );
  // Construct mapping from instance question id to grading job info
  return grading_jobs.reduce(
    (acc, item) => {
      acc[item.instance_question_id] ??= [];
      acc[item.instance_question_id].push(item);
      return acc;
    },
    {} as Record<string, GradingJobInfo[]>,
  );
}

function rubricListIncludes(items: RubricItem[], itemToCheck: RubricItem): boolean {
  return items.some((item) => item.id === itemToCheck.id);
}

export function rubricItemDisagreementCount(
  testRubricResults: {
    reference_items: Set<string>;
    ai_items: Set<string>;
  }[],
  item: RubricItem,
): number {
  let disagreement = 0;
  testRubricResults.forEach((test) => {
    if (
      (test.ai_items.has(item.id) && !test.reference_items.has(item.id)) ||
      (!test.ai_items.has(item.id) && test.reference_items.has(item.id))
    ) {
      disagreement++;
    }
  });
  return disagreement;
}

export function meanError(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error('Both arrays must have the same nonzero length.');
  }

  const n = actual.length;
  const errors = actual.map((a, i) => Math.abs(a - predicted[i]));
  const mean = errors.reduce((acc, val) => acc + val, 0) / n;

  return Math.round(mean * 100) / 100;
}

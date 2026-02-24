import assert from 'node:assert';

import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { selectAssessmentQuestions } from '../../../lib/assessment-question.js';
import {
  type Assessment,
  type AssessmentQuestion,
  type RubricItem,
  RubricItemSchema,
} from '../../../lib/db-types.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import { selectInstanceQuestionGroups } from '../ai-instance-question-grouping/ai-instance-question-grouping-util.js';

import { selectInstanceQuestionsForAssessmentQuestion } from './ai-grading-util.js';
import type { AiGradingGeneralStats, WithAIGradingStats } from './types.js';

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

type FillInstanceQuestionColumnEntriesResultType<
  T extends {
    instance_question: {
      id: string;
      ai_instance_question_group_id: string | null;
      manual_instance_question_group_id: string | null;
    };
  },
> = Omit<T, 'instance_question'> & {
  instance_question: WithAIGradingStats<T['instance_question']>;
};

/**
 * Fills in missing columns for manual grading assessment question page.
 * This includes organizing information about past graders
 * and calculating point and/or rubric difference between human and AI.
 */
export async function fillInstanceQuestionColumnEntries<
  T extends {
    instance_question: {
      id: string;
      ai_instance_question_group_id: string | null;
      manual_instance_question_group_id: string | null;
    };
  },
>(
  rows: T[],
  assessment_question: AssessmentQuestion,
): Promise<FillInstanceQuestionColumnEntriesResultType<T>[]> {
  const rubric_modify_time = await queryOptionalRow(
    sql.select_rubric_time,
    { rubric_id: assessment_question.manual_rubric_id },
    DateFromISOString,
  );

  const gradingJobMapping = await selectGradingJobsInfo(rows.map((row) => row.instance_question));

  const instanceQuestionIdToGroupName = (
    await selectInstanceQuestionGroups({
      assessmentQuestionId: assessment_question.id,
    })
  ).reduce<Record<string, string>>((acc, curr) => {
    acc[curr.id] = curr.instance_question_group_name;
    return acc;
  }, {});

  const results: FillInstanceQuestionColumnEntriesResultType<T>[] = [];

  for (const row of rows) {
    const base_instance_question = row.instance_question;

    const instance_question: WithAIGradingStats<T['instance_question']> = {
      ...base_instance_question,
      last_human_grader: null,
      ai_grading_status: 'None',
      point_difference: null,
      rubric_difference: null,
      instance_question_group_name: null,
      rubric_similarity: null,
    };
    results.push({
      ...row,
      instance_question,
    });

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

      const { rubric_items: allRubricItems } = await selectCompleteRubric(assessment_question.id);

      const tpItems = manualItems
        .filter((item) => rubricListIncludes(aiItems, item))
        .map((item) => ({ ...item, true_positive: true }));
      const tnItems = allRubricItems
        .filter(
          (item) => !rubricListIncludes(manualItems, item) && !rubricListIncludes(aiItems, item),
        )
        .map((item) => ({ ...item, true_positive: false }));
      instance_question.rubric_similarity = tpItems.concat(tnItems);

      const fpItems = aiItems
        .filter((item) => !rubricListIncludes(manualItems, item))
        .map((item) => ({ ...item, false_positive: true }));
      const fnItems = manualItems
        .filter((item) => !rubricListIncludes(aiItems, item))
        .map((item) => ({ ...item, false_positive: false }));
      instance_question.rubric_difference = fnItems.concat(fpItems);
    }

    // Retrieve the current group of the instance question
    const selectedInstanceQuestionGroupId =
      instance_question.manual_instance_question_group_id ??
      instance_question.ai_instance_question_group_id ??
      null;

    instance_question.instance_question_group_name = selectedInstanceQuestionGroupId
      ? (instanceQuestionIdToGroupName[selectedInstanceQuestionGroupId] ?? null)
      : null;
  }
  return results;
}

export async function calculateAiGradingStats(
  assessment_question: AssessmentQuestion,
): Promise<AiGradingGeneralStats> {
  const instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });

  const { rubric_items } = await selectCompleteRubric(assessment_question.id);

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
    mean_error:
      testPointResults.length > 0
        ? meanError(
            testPointResults.map((item) => item.reference_points),
            testPointResults.map((item) => item.ai_points),
          )
        : null,
    rubric_stats: {},
  };
  for (const rubric_item of rubric_items) {
    const disagreement_count = rubricItemDisagreementCount(testRubricResults, rubric_item);
    stats.rubric_stats[rubric_item.id] = disagreement_count;
  }
  return stats;
}

/**
 * Select the latest human grading job and AI grading job
 * information, including rubric grading information for each input instance question.
 * @param instance_questions the array of instance questions (including their ids)
 * @returns a record mapping each id to its grading jobs
 */
export async function selectGradingJobsInfo<T extends { id: string }>(
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

function rubricItemDisagreementCount(
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

function meanError(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error('Both arrays must have the same nonzero length.');
  }

  const n = actual.length;
  const errors = actual.map((a, i) => Math.abs(a - predicted[i]));
  const mean = errors.reduce((acc, val) => acc + val, 0) / n;

  return Math.round(mean * 100) / 100;
}

interface AiGradingPerformanceStatsRow {
  assessmentQuestionId: string;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1score: number;
}

type AiGradingAQPerformanceStatsQuestionRow = {
  questionNumber: number;
} & AiGradingPerformanceStatsRow;

/**
 * Safely divide two numbers, returning 0 if the denominator is 0.
 */
function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Generate detailed AI grading classification performance statistics for an assessment, including confusion
 * matrix elements (TP, FP, TN, FN), accuracy, precision, recall, and F1 score per question and overall.
 */
export async function generateAssessmentAiGradingStats(assessment: Assessment): Promise<{
  perQuestion: AiGradingAQPerformanceStatsQuestionRow[];
  total: AiGradingPerformanceStatsRow;
}> {
  const assessmentQuestionRows = await selectAssessmentQuestions({
    assessment_id: assessment.id,
  });

  if (assessmentQuestionRows.length === 0) {
    return {
      perQuestion: [],
      total: {
        assessmentQuestionId: 'Totals',
        accuracy: 0,
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 0,
        recall: 0,
        f1score: 0,
      },
    };
  }

  const rows: AiGradingAQPerformanceStatsQuestionRow[] = [];

  const totals = {
    truePositives: 0,
    trueNegatives: 0,
    falsePositives: 0,
    falseNegatives: 0,
  };

  for (let i = 0; i < assessmentQuestionRows.length; i++) {
    const questionRow = assessmentQuestionRows[i];

    const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
      assessment_question_id: questionRow.assessment_question.id,
    });

    const instanceQuestionsTable = await fillInstanceQuestionColumnEntries(
      instanceQuestions.map((instanceQuestion) => ({
        instance_question: instanceQuestion,
      })),
      questionRow.assessment_question,
    );

    const confusionMatrix = {
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    };

    for (const { instance_question: row } of instanceQuestionsTable) {
      if (row.ai_grading_status === 'LatestRubric') {
        if (row.rubric_difference) {
          for (const difference of row.rubric_difference) {
            if (difference.false_positive) {
              confusionMatrix.falsePositives++;
            } else {
              confusionMatrix.falseNegatives++;
            }
          }
        }
        if (row.rubric_similarity) {
          for (const item of row.rubric_similarity) {
            if (item.true_positive) {
              confusionMatrix.truePositives++;
            } else {
              confusionMatrix.trueNegatives++;
            }
          }
        }
      }
    }

    totals.truePositives += confusionMatrix.truePositives;
    totals.trueNegatives += confusionMatrix.trueNegatives;
    totals.falsePositives += confusionMatrix.falsePositives;
    totals.falseNegatives += confusionMatrix.falseNegatives;

    const accuracy = safeDivide(
      confusionMatrix.truePositives + confusionMatrix.trueNegatives,
      confusionMatrix.truePositives +
        confusionMatrix.trueNegatives +
        confusionMatrix.falsePositives +
        confusionMatrix.falseNegatives,
    );

    const precision = safeDivide(
      confusionMatrix.truePositives,
      confusionMatrix.truePositives + confusionMatrix.falsePositives,
    );

    const recall = safeDivide(
      confusionMatrix.truePositives,
      confusionMatrix.truePositives + confusionMatrix.falseNegatives,
    );

    const f1score = safeDivide(2 * (precision * recall), precision + recall);

    rows.push({
      assessmentQuestionId: questionRow.assessment_question.id,
      questionNumber: i + 1,
      truePositives: confusionMatrix.truePositives,
      trueNegatives: confusionMatrix.trueNegatives,
      falsePositives: confusionMatrix.falsePositives,
      falseNegatives: confusionMatrix.falseNegatives,
      accuracy,
      precision,
      recall,
      f1score,
    });
  }

  const totalAccuracy = safeDivide(
    totals.truePositives + totals.trueNegatives,
    totals.truePositives + totals.trueNegatives + totals.falsePositives + totals.falseNegatives,
  );

  const totalPrecision = safeDivide(
    totals.truePositives,
    totals.truePositives + totals.falsePositives,
  );

  const totalRecall = safeDivide(
    totals.truePositives,
    totals.truePositives + totals.falseNegatives,
  );

  const totalF1Score = safeDivide(2 * (totalPrecision * totalRecall), totalPrecision + totalRecall);

  const total: AiGradingPerformanceStatsRow = {
    assessmentQuestionId: 'Totals',
    truePositives: totals.truePositives,
    trueNegatives: totals.trueNegatives,
    falsePositives: totals.falsePositives,
    falseNegatives: totals.falseNegatives,
    accuracy: totalAccuracy,
    precision: totalPrecision,
    recall: totalRecall,
    f1score: totalF1Score,
  };

  return {
    perQuestion: rows,
    total,
  };
}

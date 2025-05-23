import assert from 'node:assert';

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString } from '@prairielearn/zod';

import type { InstanceQuestionRow } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';

import {
  type AssessmentQuestion,
  IdSchema,
  type RubricItem,
  RubricItemSchema,
} from './db-types.js';
import { formatHtmlWithPrettier } from './prettier.js';

const sql = loadSqlEquiv(import.meta.url);
const GradingJobInfoSchema = z.object({
  grading_job_id: IdSchema,
  graded_at: DateFromISOString.nullable(),
  grading_method: z.enum(['Manual', 'AI']),
  manual_points: z.number().nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
  grader_name: z.string(),
});
type GradingJobInfo = z.infer<typeof GradingJobInfoSchema>;

/**
 * Processes rendered question HTML to make it suitable for AI grading.
 * This includes removing scripts/stylesheets and attributes that aren't
 * relevant to grading.
 */
export async function stripHtmlForAiGrading(html: string) {
  const $ = cheerio.load(html, null, false);

  // Remove elements that are guaranteed to be irrelevant to grading.
  $('script').remove();
  $('style').remove();
  $('link').remove();
  $('noscript').remove();
  $('svg').remove();

  // Filter out more irrelevant elements/attributes.
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;

    // Remove elements that are hidden from screen readers.
    if ($(el).attr('aria-hidden') === 'true') {
      $(el).remove();
      return;
    }

    $(el).removeAttr('id');
    $(el).removeAttr('class');
    $(el).removeAttr('style');
    for (const name of Object.keys(el.attribs)) {
      if (name.startsWith('data-bs-')) {
        $(el).removeAttr(name);
      }
    }
  });

  // Remove all elements that have no text content.
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    if ($(el).text().trim() === '') {
      $(el).remove();
    }
  });

  const result = $.html();
  if (result.length > 10000) {
    // Prevent denial of service attacks by skipping Prettier formatting
    // if the HTML is too large. 10,000 characters was chosen arbitrarily.
    return html.trim();
  }

  return (await formatHtmlWithPrettier(result)).trim();
}

/**
 * Selects the latest human and AI grading jobs for a given list of instance questions
 * Returns a mapping of instance question ids to grading jobs
 */
async function selectGradingJobsOfInstanceQuestions(
  instance_questions: InstanceQuestionRow[],
): Promise<Record<string, GradingJobInfo[]>> {
  const instance_question_ids = instance_questions.map((iq) => iq.id);
  const submission_instance_question_ids = await queryRows(
    sql.select_latest_submission_ids,
    { instance_question_ids },
    z.object({ submission_id: IdSchema, instance_question_id: IdSchema }),
  );

  const submission_ids = submission_instance_question_ids.map((item) => item.submission_id);
  const submission_grading_jobs = await queryRows(
    sql.select_ai_and_human_grading_jobs_batch,
    { submission_ids },
    GradingJobInfoSchema.extend({ submission_id: IdSchema }),
  );

  const submissionToGradingJobMapping: Record<string, GradingJobInfo[]> =
    submission_grading_jobs.reduce(
      (acc, item) => {
        if (!acc[item.submission_id]) acc[item.submission_id] = [];
        acc[item.submission_id].push(item);
        return acc;
      },
      {} as Record<string, GradingJobInfo[]>,
    );

  const mapping: Record<string, GradingJobInfo[]> = submission_instance_question_ids.reduce(
    (acc, item) => {
      acc[item.instance_question_id] = submissionToGradingJobMapping[item.submission_id] || [];
      return acc;
    },
    {} as Record<string, GradingJobInfo[]>,
  );
  return mapping;
}

/**
 * Fills in missing columns for manual grading assessment question page.
 * This includes organizing information about past graders
 * and calculating point and/or rubric difference between human and AI.
 */
export async function fillInstanceQuestionColumns(
  instance_questions: InstanceQuestionRow[],
  assessment_question: AssessmentQuestion,
): Promise<void> {
  const rubric_modify_time = await queryOptionalRow(
    sql.select_rubric_time,
    { manual_rubric_id: assessment_question.manual_rubric_id },
    DateFromISOString,
  );

  const gradingJobMapping = await selectGradingJobsOfInstanceQuestions(instance_questions);
  for (const instance_question of instance_questions) {
    const grading_jobs = gradingJobMapping[instance_question.id];

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
    const manualItems = await queryRows(
      sql.select_rubric_grading_items,
      { manual_rubric_grading_id: manualGradingJob.manual_rubric_grading_id },
      RubricItemSchema,
    );
    const aiItems = await queryRows(
      sql.select_rubric_grading_items,
      { manual_rubric_grading_id: aiGradingJob.manual_rubric_grading_id },
      RubricItemSchema,
    );
    const fpItems = aiItems
      .filter((item) => !rubricListIncludes(manualItems, item))
      .map((item) => ({ ...item, false_positive: true }));
    const fnItems = manualItems
      .filter((item) => !rubricListIncludes(aiItems, item))
      .map((item) => ({ ...item, false_positive: false }));
    instance_question.rubric_difference = fnItems.concat(fpItems);
  }
}

function rubricListIncludes(items: RubricItem[], itemToCheck: RubricItem): boolean {
  for (const item of items) {
    if (item.id === itemToCheck.id) {
      return true;
    }
  }
  return false;
}

import assert from 'node:assert';

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString } from '@prairielearn/zod';

import type { InstanceQuestionRow } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';

import { type AssessmentQuestion, IdSchema } from './db-types.js';
import { formatHtmlWithPrettier } from './prettier.js';

const sql = loadSqlEquiv(import.meta.url);
const GradingJobInfoSchema = z.object({
  grading_job_id: IdSchema,
  graded_at: DateFromISOString.nullable(),
  grading_method: z.enum(['Internal', 'External', 'Manual', 'AI']).nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
});

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

export async function fillInstanceQuestionColumns(
  instance_questions: InstanceQuestionRow[],
  assessment_question: AssessmentQuestion,
): Promise<void> {
  const rubric_time = await queryOptionalRow(
    sql.select_rubric_time,
    { manual_rubric_id: assessment_question.manual_rubric_id },
    DateFromISOString,
  );

  for (const instance_question of instance_questions) {
    // Only look at grading jobs for the last submission
    const submission_id = await queryRow(
      sql.select_last_submission_id,
      { instance_question_id: instance_question.id },
      IdSchema,
    );

    const grading_jobs = await queryRows(
      sql.select_ai_and_human_grading_jobs,
      {
        submission_id,
      },
      GradingJobInfoSchema,
    );

    for (const grading_job of grading_jobs) {
      assert(grading_job.graded_at);
      if (grading_job.grading_method === 'Manual') {
        instance_question.last_human_grader = 'Humannnn';
      } else {
        instance_question.ai_graded = true;
        instance_question.ai_graded_with_latest_rubric =
          rubric_time !== null && grading_job.graded_at > rubric_time;
      }
    }

    if (grading_jobs.length < 2) {
      continue;
    }
  }
}

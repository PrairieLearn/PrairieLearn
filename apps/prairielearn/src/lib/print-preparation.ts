import fs from 'node:fs/promises';
import path from 'node:path';

import { load } from 'cheerio';
import { z } from 'zod';

import { loadSqlEquiv, queryRows, queryScalar } from '@prairielearn/postgres';

import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from './chunks.js';
import type { PrintPreparationQuestion } from './client/print-preparation.js';
import {
  AssessmentQuestionSchema,
  CourseSchema,
  QuestionSchema,
  SprocQuestionOrderSchema,
} from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Only hide instance controls when the configuration guarantees a fixed selection and seed. */
export async function assessmentHasPrintRandomization(assessmentId: string): Promise<boolean> {
  return await queryScalar(
    sql.select_has_randomization,
    { assessment_id: assessmentId },
    z.boolean(),
  );
}

/** These are review suggestions, not a guarantee that a question will work on paper. */
export function findPaperConcerns(html: string): string[] {
  const $ = load(html);
  $('pl-answer-panel, pl-submission-panel').remove();
  const concerns: string[] = [];
  const checks = [
    [
      'pl-file-upload, pl-image-capture',
      'Requests a file or image upload. Check that students can give their answer on paper.',
    ],
    [
      'pl-file-editor, pl-code-editor',
      'Uses a code editor. Check the starter code and space for a handwritten solution.',
    ],
    ['pl-workspace', 'Requires an online workspace. Provide a paper alternative.'],
    [
      'audio, video, iframe, pl-video, pl-audio',
      'Uses media or embedded content that cannot play on paper.',
    ],
    [
      'pl-file-download, pl-file-preview, a[download]',
      'Uses a downloadable file. Supply any required data with the paper exam.',
    ],
    [
      'a[href^="http://"], a[href^="https://"]',
      'Links to an online resource. Check whether students need it to answer.',
    ],
    [
      'pl-drawing, pl-excalidraw',
      'Uses interactive drawing tools. Check that the task can be completed with a pencil.',
    ],
  ];
  for (const [selector, message] of checks) {
    if ($(selector).length > 0) concerns.push(message);
  }
  return concerns;
}

export async function inspectPrintPreparationQuestions(
  assessmentInstanceId: string,
): Promise<PrintPreparationQuestion[]> {
  const rows = await queryRows(
    sql.select_questions,
    { assessment_instance_id: assessmentInstanceId },
    z.object({
      question: QuestionSchema,
      course: CourseSchema,
      assessment_question: AssessmentQuestionSchema,
      question_number: SprocQuestionOrderSchema.shape.question_number,
    }),
  );
  return await Promise.all(
    rows.map(async ({ question, course, assessment_question, question_number }) => {
      const concerns: string[] = [];
      if (question.workspace_image) {
        concerns.push('Requires an online workspace. Provide a paper alternative.');
      }
      if (question.type === 'Freeform' && question.directory) {
        try {
          await ensureChunksForCourseAsync(course.id, {
            type: 'question',
            questionId: question.id,
          });
          const html = await fs.readFile(
            path.join(
              getRuntimeDirectoryForCourse(course),
              'questions',
              question.directory,
              'question.html',
            ),
            'utf8',
          );
          concerns.push(...findPaperConcerns(html));
        } catch {
          // Inspection must not hide the rest of the exam when one question has missing files.
          concerns.push(
            'Could not inspect this question’s source. Review its preview before printing.',
          );
        }
      } else {
        concerns.push('Uses a legacy question format. Review its layout and answer space.');
      }
      return {
        number: question_number,
        title: question.title ?? question.qid ?? `Question ${question_number}`,
        questionId: question.id,
        points: assessment_question.max_points ?? 0,
        concerns: [...new Set(concerns)],
      };
    }),
  );
}

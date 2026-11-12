import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { selectQuestionCopyAdoption } from '../models/question.js';

import {
  type QuestionAuthorshipReport,
  QuestionAuthorshipReportQuestionSchema,
  QuestionAuthorshipReportSchema,
} from './client/question-authorship-report.js';
import type { Course } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const AuthoredQuestionRowSchema = QuestionAuthorshipReportQuestionSchema.omit({
  downstream_course_count: true,
  downstream_institution_count: true,
}).extend({
  author_uid: z.string(),
  display_name: z.string(),
});

/** Caller must authorize report access to the course before calling. */
export async function getCourseQuestionAuthorshipReport(
  course: Course,
): Promise<QuestionAuthorshipReport> {
  const rows = await queryRows(
    sql.select_authored_questions,
    { course_id: course.id },
    AuthoredQuestionRowSchema,
  );
  const questionIds = [...new Set(rows.map((row) => row.id))];
  const adoption = await selectQuestionCopyAdoption(questionIds);
  const counts = new Map(adoption.map((row) => [row.question_id, row]));
  const authors = new Map<string, QuestionAuthorshipReport[number]>();

  for (const { author_uid, display_name, ...question } of rows) {
    let author = authors.get(author_uid);
    if (!author) {
      author = { uid: author_uid, display_name, questions: [] };
      authors.set(author_uid, author);
    }
    const questionCounts = counts.get(question.id);
    author.questions.push({
      ...question,
      downstream_course_count: questionCounts?.downstream_course_count ?? 0,
      downstream_institution_count: questionCounts?.downstream_institution_count ?? 0,
    });
  }

  return QuestionAuthorshipReportSchema.parse([...authors.values()]);
}

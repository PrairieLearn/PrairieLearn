import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { selectQuestionCopyAdoption } from '../models/question.js';

import {
  type QuestionAuthorshipReport,
  QuestionAuthorshipReportQuestionSchema,
  QuestionAuthorshipReportSchema,
} from './client/question-authorship-report.js';

const sql = loadSqlEquiv(import.meta.url);

const AuthoredQuestionRowSchema = QuestionAuthorshipReportQuestionSchema.omit({
  downstream_course_count: true,
}).extend({
  author_uid: z.string(),
  display_name: z.string(),
});

/** Caller must authorize report access to the course before calling. */
export async function getCourseQuestionAuthorshipReport(
  course_id: string,
): Promise<QuestionAuthorshipReport> {
  const rows = await queryRows(
    sql.select_authored_questions,
    { course_id },
    AuthoredQuestionRowSchema,
  );
  const questionIds = [...new Set(rows.map((row) => row.id))];
  const adoption = await selectQuestionCopyAdoption(questionIds);
  const counts = new Map(adoption.map((row) => [row.question_id, row.downstream_course_count]));
  const authors = new Map<string, QuestionAuthorshipReport[number]>();

  for (const { author_uid, display_name, ...question } of rows) {
    let author = authors.get(author_uid);
    if (!author) {
      author = { uid: author_uid, display_name, questions: [] };
      authors.set(author_uid, author);
    }
    author.questions.push({
      ...question,
      downstream_course_count: counts.get(question.id) ?? 0,
    });
  }

  return QuestionAuthorshipReportSchema.parse([...authors.values()]);
}

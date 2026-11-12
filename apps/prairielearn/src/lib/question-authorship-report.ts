import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { selectQuestionCopyAdoption } from '../models/question.js';

import {
  type QuestionAuthorshipReport,
  QuestionAuthorshipReportQuestionSchema,
  QuestionAuthorshipReportSchema,
} from './client/question-authorship-report.js';
import type { StaffCourse } from './client/safe-db-types.js';
import type { Course } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Caller must authorize report access to the course before calling. */
export async function getCourseQuestionAuthorshipReport(
  course: Course | StaffCourse,
  { authorUid, page: requestedPage = 1 }: { authorUid?: string; page?: number } = {},
): Promise<QuestionAuthorshipReport> {
  const authors = await queryRows(
    sql.select_authors,
    { course_id: course.id },
    QuestionAuthorshipReportSchema.shape.authors.element,
  );
  const author =
    (authorUid === undefined ? authors[0] : authors.find((a) => a.uid === authorUid)) ?? null;
  const pageSize = 50;
  const lastPage = Math.max(1, Math.ceil((author?.question_count ?? 0) / pageSize));
  const page = Math.max(1, Math.min(requestedPage, lastPage));
  // Limit questions before traversing copies, rather than slicing a complete report in memory.
  const questions = author
    ? await queryRows(
        sql.select_authored_questions,
        {
          course_id: course.id,
          author_uid: author.uid,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        QuestionAuthorshipReportQuestionSchema.omit({
          downstream_course_count: true,
          downstream_institution_count: true,
        }),
      )
    : [];
  const adoption = questions.length
    ? await selectQuestionCopyAdoption(questions.map((q) => q.id))
    : [];
  const counts = new Map(adoption.map((row) => [row.question_id, row]));

  return QuestionAuthorshipReportSchema.parse({
    authors,
    author,
    questions: questions.map((question) => ({
      ...question,
      downstream_course_count: counts.get(question.id)?.downstream_course_count ?? 0,
      downstream_institution_count: counts.get(question.id)?.downstream_institution_count ?? 0,
    })),
    page,
    page_size: pageSize,
  });
}

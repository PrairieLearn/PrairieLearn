import * as sqldb from '@prairielearn/postgres';

import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, string>,
) {
  if (infofile.hasErrors(courseData.course)) {
    return;
  }

  // Collect all unique authors from all questions
  const uniqueAuthors = new Set<string>();
  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const authors = question.data?.authors ?? [];
    for (const author of authors) {
      uniqueAuthors.add(author);
    }
  }

  // Insert all unique authors
  await sqldb.queryAsync(sql.sync_authors, {
    course_id: courseId,
    author_names: Array.from(uniqueAuthors),
  });

  // Get the mapping of author names to their IDs
  const authors = await sqldb.queryAsync(sql.select_authors, {
    course_id: courseId,
  });

  // Create question-author relationships
  const questionAuthorRelationships: { question_id: string; author_id: string }[] = [];
  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const questionId = questionIds[qid];
    const questionAuthors = question.data?.authors ?? [];
    for (const authorName of questionAuthors) {
      const author = authors.rows.find((a) => a.name === authorName);
      if (author) {
        questionAuthorRelationships.push({
          question_id: questionId,
          author_id: author.id,
        });
      }
    }
  }

  // Sync the question-author relationships
  await sqldb.queryAsync(sql.sync_question_authors, {
    question_author_relationships: questionAuthorRelationships,
  });
}

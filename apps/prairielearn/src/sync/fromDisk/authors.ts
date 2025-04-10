import * as sqldb from '@prairielearn/postgres';
import { callAsync } from '@prairielearn/postgres';

import { type Author, AuthorSchema } from '../../lib/db-types.js';
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
  await sqldb.queryAsync(sql.insert_authors, {
    authors: Array.from(uniqueAuthors).map((authorString) => JSON.stringify([authorString])),
  });

  // Get the mapping of author names to their IDs
  const authors = await sqldb.queryRows(sql.select_authors, {}, AuthorSchema);

  const authorIdsByString = new Map<string, Author>();
  for (const author of authors) {
    authorIdsByString.set(author.author_string, author);
  }

  // Create question-author relationships
  const questionAuthorsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionAuthorStrings = new Set<string>();
    (question.data?.authors ?? []).forEach((a) => dedupedQuestionAuthorStrings.add(a));
    const questionTagIds = [...dedupedQuestionAuthorStrings].map((a) => {
      const author = authorIdsByString.get(a);

      // This should never happen in practice, but this keeps the type checker
      // happy, and if it does happen, we want it to fail obviously and loudly.
      if (!author) throw new Error(`Author ${a} not found`);

      return author.id;
    });
    questionAuthorsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await callAsync('sync_question_authors', [questionAuthorsParam]);
}

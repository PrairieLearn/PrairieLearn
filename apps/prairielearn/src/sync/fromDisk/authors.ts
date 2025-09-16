import * as sqldb from '@prairielearn/postgres';
import { callAsync } from '@prairielearn/postgres';

import { AuthorSchema } from '../../lib/db-types.js';
import { findCourseBySharingName } from '../../models/course.js';
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

  interface JSONAuthor {
    name?: string;
    email?: string;
    orcid?: string;
    originCourse?: string;
  }

  interface NormalizedAuthor {
    name: string | null;
    email: string | null;
    orcid: string | null;
    originCourse: string | null;
    id: string | null;
  }

  // Collect all unique authors from all questions
  // Also setting up reverse lookup of resolved authors from database back to JSON
  const uniqueAuthors = new Map<string, JSONAuthor>();
  // Cache sharing name -> course ID mappings
  const sharingNameCache = new Map<string, string>();

  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const authors = question.data?.authors ?? [];
    for (const author of authors) {
      const normalizedOrcid = author.orcid?.replaceAll('-', '');
      const normalizedAuthor: NormalizedAuthor = {
        name: author.name ?? null,
        email: author.email ?? null,
        orcid: normalizedOrcid ?? null,
        originCourse: null,
        id: null,
      };

      if (author.originCourse) {
        let originCourseID = sharingNameCache.get(author.originCourse) ?? null;
        if (originCourseID == null) {
          const originCourse = await findCourseBySharingName(author.originCourse);
          originCourseID = originCourse?.id ?? null;
        }
        if (originCourseID == null) {
          // This should never happen in practice since we already verified the existence when validating the question
          throw new Error(`Course with sharing name ${author.originCourse} not found!`);
        }
        normalizedAuthor.originCourse = originCourseID;
        sharingNameCache.set(author.originCourse, originCourseID);
      }

      uniqueAuthors.set(JSON.stringify(normalizedAuthor), author);
    }
  }

  const authorsForDB = {
    authors: JSON.stringify(Array.from(uniqueAuthors.keys()).map((a) => JSON.parse(a))),
  };
  // Insert all unique authors
  await sqldb.execute(sql.insert_authors, authorsForDB);

  // Re-load authors from DB (including IDs) and build new map directly from JSONAuthor to ID
  const authors = await sqldb.queryRows(sql.select_authors, authorsForDB, AuthorSchema);
  const authorIdMap = new Map<string, string>();
  for (const author of authors) {
    // Reconstructing normalized author from DB author to then lookup JSON author
    const normalizedAuthor: NormalizedAuthor = {
      name: author.author_name ?? null,
      email: author.email ?? null,
      orcid: author.orcid ?? null,
      originCourse: author.origin_course ?? null,
      id: null,
    };
    const jsonAuthor = uniqueAuthors.get(JSON.stringify(normalizedAuthor));

    // This should never happen in practice, but this keeps the type checker
    // happy, and if it does happen, we want it to fail obviously and loudly.
    if (!jsonAuthor) throw new Error(`Author ${JSON.stringify(author)} database lookup failed`);

    authorIdMap.set(JSON.stringify(jsonAuthor), author.id);
  }

  // Create question-author relationships
  const questionAuthorsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionAuthors = new Set<string>();
    (question.data?.authors ?? []).forEach((a) => dedupedQuestionAuthors.add(JSON.stringify(a)));
    const questionTagIds = [...dedupedQuestionAuthors]
      .map((a) => {
        const author = authorIdMap.get(a) ?? null;
        return author;
      })
      // Authors that were skipped earlier will not be in the map and should be skipped again
      .filter((a) => a !== null);
    questionAuthorsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await callAsync('sync_question_authors', [questionAuthorsParam]);
}

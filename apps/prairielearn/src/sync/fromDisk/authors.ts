import * as sqldb from '@prairielearn/postgres';

import { AuthorSchema } from '../../lib/db-types.js';
import { findCoursesBySharingNames } from '../../models/course.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function resolveSharingNames(courseData: CourseData) {
  // Collect all sharing names to resolve
  const sharingNamesToResolve = new Set<string>();
  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const authors = question.data?.authors ?? [];
    for (const author of authors) {
      if (author.originCourse) sharingNamesToResolve.add(author.originCourse);
    }
  }

  // Resolve sharing names in batch
  const sharingNameLookupTable = new Map<string, string>();
  if (sharingNamesToResolve.size > 0) {
    const resolved = await findCoursesBySharingNames([...sharingNamesToResolve]);
    resolved.forEach((course, sharingName) => {
      if (course) {
        sharingNameLookupTable.set(sharingName, course.id);
      } else {
        // This should never happen since all sharing names should have been validated before
        throw new Error(`Course with sharing name ${sharingName} not found!`);
      }
    });
  }
  return sharingNameLookupTable;
}

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
    origin_course: string | null;
    id: string | null;
  }

  // Collect all unique authors from all questions
  // Also setting up reverse lookup of resolved authors from database back to JSON
  const uniqueAuthors = new Map<string, JSONAuthor>();
  // Sharing name -> course ID mappings (resolved in bulk)
  const sharingNameLookupTable = await resolveSharingNames(courseData);

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
        origin_course: author.originCourse
          ? (sharingNameLookupTable.get(author.originCourse) ?? null)
          : null,
        id: null,
      };

      uniqueAuthors.set(JSON.stringify(normalizedAuthor), author);
    }
  }

  const authorsForDB = {
    authors: JSON.stringify(Array.from(uniqueAuthors.keys()).map((a) => JSON.parse(a))),
  };

  // Insert all unique authors
  // In the SQL, we ensure that only non-existing authors are actually, so keeping the entire list is fine here
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
      origin_course: author.origin_course ?? null,
      id: null,
    };
    const jsonAuthor = uniqueAuthors.get(JSON.stringify(normalizedAuthor));

    // This should never happen in practice, but this keeps the type checker
    // happy, and if it does happen, we want it to fail obviously and loudly.
    if (!jsonAuthor) throw new Error(`Author ${JSON.stringify(author)} database lookup failed`);

    authorIdMap.set(JSON.stringify(jsonAuthor), author.id);
  }

  // Create question-author relationships
  const qaPairs: { question_id: string; author_id: string | null }[] = [];

  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    // De-duplicate repeated authors in the same question info file
    const dedupedQuestionAuthors = new Set<string>();
    (question.data?.authors ?? []).forEach((a) => dedupedQuestionAuthors.add(JSON.stringify(a)));

    // Lookup author IDs and set up data structure for DB
    const authorIds = [...dedupedQuestionAuthors]
      .map((a) => authorIdMap.get(a) ?? null)
      .filter((id) => id !== null);
    // Include questions with empty author lists to ensure deletion of existing authors
    if (authorIds.length === 0) {
      qaPairs.push({ question_id: questionIds[qid], author_id: null });
    } else {
      for (const authorId of authorIds) {
        qaPairs.push({ question_id: questionIds[qid], author_id: authorId });
      }
    }
  });

  await sqldb.execute(sql.insert_question_authors, [JSON.stringify(qaPairs)]);
}

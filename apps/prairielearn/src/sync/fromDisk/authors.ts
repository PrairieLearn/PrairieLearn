import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { callAsync } from '@prairielearn/postgres';

import { AuthorSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/** Validate ORCiD and return normalized (16 chars, no dashes) if valid. */
function normalizeOrcid(orcid: string): string | null {
  if (!orcid) return null;

  const digits = orcid.replaceAll(/[-\s]/g, '');
  if (!/^\d{15}[\dX]$/.test(digits)) {
    return null;
  }

  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number.parseInt(digits[i])) * 2;
  }

  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const checkDigit = result === 10 ? 'X' : String(result);

  return digits[15] === checkDigit ? digits : null;
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
    name?: string;
    email?: string;
    orcid?: string;
    originCourse?: string;
    id?: string;
  }

  // Collect all unique authors from all questions (mapping JSON authors to normalized ones)
  const uniqueAuthors = new Map<JSONAuthor, NormalizedAuthor>();

  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const authors = question.data?.authors ?? [];
    for (const author of authors) {
      if (!author.email && !author.orcid && !author.originCourse) {
        throw new Error(
          'Either email, orcid, or originCourse must be provided for each question author',
        );
      }

      const resolvedAuthor: NormalizedAuthor = { name: author.name, email: author.email };

      // Not making any attempt to validate email or author name

      if (author.orcid) {
        const orcidNormalized = normalizeOrcid(author.orcid);
        if (!orcidNormalized) {
          throw new Error(
            `The provided ORCiD ${author.orcid} is invalid. ORCiDs must be 16 characters long (excluding dashes) and have a valid checksum`,
          );
        }
        resolvedAuthor.orcid = orcidNormalized;
      }
      if (author.originCourse) {
        const originCourseID = await sqldb.queryRow(
          sql.select_sharing_name,
          { origin_course: author.originCourse },
          z.string(),
        );
        if (originCourseID == null) {
          throw new Error(`Unable to find course with sharing name ${author.originCourse}`);
        }
        resolvedAuthor.originCourse = originCourseID;
      }

      uniqueAuthors.set(resolvedAuthor, author);
    }
  }

  // Insert all unique authors
  await sqldb.execute(sql.insert_authors, {
    authors: JSON.stringify(Array.from(uniqueAuthors.keys())),
  });

  // Get the mapping of author names to their IDs
  const authors = await sqldb.queryRows(sql.select_authors, {}, AuthorSchema);
  const authorIdMap = new Map<NormalizedAuthor, string>();
  for (const author of authors) {
    authorIdMap.set(
      {
        name: author.author_name ?? undefined,
        email: author.email ?? undefined,
        orcid: author.orcid ?? undefined,
        originCourse: author.origin_course ?? undefined,
      },
      author.id,
    );
  }

  // Create question-author relationships
  const questionAuthorsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionAuthors = new Set<JSONAuthor>();
    (question.data?.authors ?? []).forEach((a) => dedupedQuestionAuthors.add(a));
    const questionTagIds = [...dedupedQuestionAuthors].map((a) => {
      const author = authorIdMap.get(a);

      // This should never happen in practice, but this keeps the type checker
      // happy, and if it does happen, we want it to fail obviously and loudly.
      if (!author) throw new Error(`Author ${JSON.stringify(a)} not found`);

      return author;
    });
    questionAuthorsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await callAsync('sync_question_authors', [questionAuthorsParam]);
}

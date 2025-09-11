import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { callAsync } from '@prairielearn/postgres';

import { AuthorSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/** Validate ORCID identifier and return normalized (16 chars, no dashes) if valid. */
function normalizeOrcid(orcid: string): string | null {
  if (!orcid) return null;

  // Drop any dashes
  const digits = orcid.replaceAll('-', '');

  // Sanity check that should not fail since the ORCID identifier format is baked into the JSON schema
  if (!/^\d{15}[\dX]$/.test(digits)) {
    return null;
  }

  // Calculate and verify checksum
  // (adapted from Java code provided here: https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier)
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

  // Collect all unique authors from all questions
  // Also setting up reverse lookup of resolved authors from database back to JSON
  const uniqueAuthors = new Map<string, JSONAuthor>();
  const newWarnings: Record<string, string> = {};

  for (const qid of Object.keys(courseData.questions)) {
    const question = courseData.questions[qid];
    if (infofile.hasErrors(question)) continue;
    const authors = question.data?.authors ?? [];
    for (const author of authors) {
      if (!author.email && !author.orcid && !author.originCourse) {
        infofile.addWarning(
          question,
          'Either email, orcid, or originCourse must be provided for each question author',
        );
        newWarnings[questionIds[qid]] = infofile.stringifyWarnings(question);
        continue;
      }

      const resolvedAuthor: NormalizedAuthor = {};

      if (author.name) {
        if (author.name.length < 3 || author.name.length > 255) {
          infofile.addWarning(
            question,
            `The provided author name ${author.name} is invalid. Author names must be 3-255 characters long`,
          );
          newWarnings[questionIds[qid]] = infofile.stringifyWarnings(question);
          continue;
        }
        resolvedAuthor.name = author.name;
      }

      if (author.email) {
        const parsedEmail = z.string().max(255).email().safeParse(author.email);

        if (!parsedEmail.success) {
          infofile.addWarning(
            question,
            `The provided author email address ${author.email} is invalid. Author email addresses must be valid and at most 255 characters long`,
          );
          newWarnings[questionIds[qid]] = infofile.stringifyWarnings(question);
          continue;
        }
        resolvedAuthor.email = parsedEmail.data;
      }

      if (author.orcid) {
        const orcidNormalized = normalizeOrcid(author.orcid);
        if (!orcidNormalized) {
          infofile.addWarning(
            question,
            `The provided author ORCID identifier ${author.orcid} has an invalid format or checksum. See the official website (https://orcid.org) for info on how to create or look up an identifier`,
          );
          newWarnings[questionIds[qid]] = infofile.stringifyWarnings(question);
          continue;
        }
        resolvedAuthor.orcid = orcidNormalized;
      }
      if (author.originCourse) {
        const originCourseID = await sqldb.queryOptionalRow(
          sql.select_sharing_name,
          { origin_course: author.originCourse },
          z.string(),
        );
        if (originCourseID == null) {
          infofile.addWarning(
            question,
            `Unable to find course with sharing name ${author.originCourse}`,
          );
          newWarnings[questionIds[qid]] = infofile.stringifyWarnings(question);
          continue;
        }
        resolvedAuthor.originCourse = originCourseID;
      }

      uniqueAuthors.set(JSON.stringify(resolvedAuthor), author);
    }
  }

  // If there were warnings, add them to the database
  await sqldb.execute(sql.insert_author_warnings, { warnings: JSON.stringify(newWarnings) });

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
      name: author.author_name ?? undefined,
      email: author.email ?? undefined,
      orcid: author.orcid ?? undefined,
      originCourse: author.origin_course ?? undefined,
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
        const author = authorIdMap.get(a);
        return author;
      })
      // Authors that were skipped earlier will not be in the map and should be skipped again
      .filter((a) => a != undefined);
    questionAuthorsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await callAsync('sync_question_authors', [questionAuthorsParam]);
}

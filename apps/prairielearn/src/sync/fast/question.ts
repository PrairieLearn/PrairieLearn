import fs from 'node:fs/promises';
import path from 'node:path';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { type Course, QuestionSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectInstitutionForCourse } from '../../models/institution.js';
import * as schemas from '../../schemas/index.js';
import type { QuestionJson } from '../../schemas/index.js';
import { DEFAULT_QUESTION_INFO, loadAndValidateJson, validateQuestion } from '../course-db.js';

import type { QuestionFastSync } from './index.js';

const sql = loadSqlEquiv(import.meta.url);

async function selectMatchingQuestion(pathPrefix: string) {
  // Get all path components; exclude the first one since it's just "questions".
  const pathComponents = pathPrefix.split('/').slice(1);

  // Construct a list of all possible QIDs that this file could correspond to.
  const candidateQids: string[] = [];
  for (let i = 0; i < pathComponents.length; i++) {
    // Join the components up to this point to get the QID.
    const qid = pathComponents.slice(0, i + 1).join('/');
    candidateQids.push(qid);
  }

  // Fetch all matching questions from the database; there should be at most one.
  return await queryOptionalRow(
    sql.select_matching_question,
    { qids: candidateQids },
    QuestionSchema,
  );
}

// TODO: this is copied from `course-db.ts`; switch to a shared version?
async function isSharingEnabled(course: Course): Promise<boolean> {
  const institution = await selectInstitutionForCourse({ course_id: course.id });
  return await features.enabled('question-sharing', {
    institution_id: institution.id,
    course_id: course.id,
  });
}

export async function fastSyncQuestion(
  course: Course,
  strategy: QuestionFastSync,
): Promise<boolean> {
  // We do need to consider deletion here; it's possible that a question may
  // consist just of a JSON file, and that deleting the file could delete the
  // question. It's also possible that someone might delete a JSON file that's
  // not actually part of a question. It's ALSO possible that someone might
  // delete a JSON file that would cause another directory to start being treated
  // as a question. For instance, if `foo/info.json` and `foo/bar/info.json` exist
  // and `foo/info.json` is deleted, `foo/bar/info.json` would become a question's
  // JSON file.
  //
  // To keep things simple, if a JSON file was deleted, we'll require that the
  // entire containing directory was also deleted. If not, we'll fall back to slow
  // sync.

  const existingQuestion = await selectMatchingQuestion(strategy.pathPrefix);

  if (existingQuestion) {
    // These files all correspond to an existing question. This is the easy case.
    // Update the `questions` row from the JSON file (if relevant) and upload any
    // new chunks (if relevant).
  } else {
    // One of several things could be true:
    // - These could be files in the questions directory but not part of a question,
    //   e.g. a bare `README.md` file in some intermediate directory.
    // - These could be files that are part of a newly-created question. This will
    //   probably be the case if there's a new `info.json` file present.

    // Either there's a single JSON file that was added, in which case the path
    // prefix should be the JSON file itself, or there are multiple files, in
    // which case we'd expect to find a JSON file directly under the path prefix.
    const jsonFilePath = await run(async () => {
      if (strategy.pathPrefix.endsWith('.json')) {
        // The path prefix is the JSON file itself.
        return strategy.pathPrefix;
      }

      // The path prefix is a directory, so look for an `info.json` file in it.
      const jsonFilePath = path.join(course.path, strategy.pathPrefix, 'info.json');
      const jsonFileStat = await fs.stat(jsonFilePath).catch(() => null);

      // Handle when the file doesn't exist or isn't actually a file.
      if (!jsonFileStat?.isFile()) return null;

      return path.join(strategy.pathPrefix, 'info.json');
    });

    if (!jsonFilePath) {
      // We couldn't find a JSON file, and the files don't belong to an existing
      // question. For now, we'll just bail and do a full sync.
      //
      // TODO: it's in theory possible to have a fast case here. For instance, if
      // `questions/foo/bar/info.json` exists and we add `questions/foo/README.md`,
      // that would be totally safe and in fact wouldn't require anything to sync at
      // all. It would be ideal if we could handle this on the fast path, but this
      // is also unlikely to frequently occur, so it's not a priority for now.
      return false;
    }

    const sharingEnabled = await isSharingEnabled(course);
    const jsonContents = await loadAndValidateJson({
      coursePath: course.path,
      filePath: jsonFilePath,
      defaults: DEFAULT_QUESTION_INFO,
      schema: schemas.infoQuestion,
      validate: (question: QuestionJson) => validateQuestion({ question, sharingEnabled }),
      // This shouldn't matter, as we've already guaranteed that the file exists.
      tolerateMissing: false,
    });

    // Create a new question in the database.
    //
    // TODO: there's probably some stuff we have to handle for UUIDs here. That
    // is, we probably need a case to handle undeletion? Or deletions + renames?
  }

  // Non-JSON file syncing here!
  // If we're not configured to generate chunks, there's nothing for us to do
  // here. Getting the files onto disk was enough.
  if (!config.chunksGenerator) return true;

  return false;
}

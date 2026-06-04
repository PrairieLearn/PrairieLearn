import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  type Course,
  type Question,
  QuestionSchema,
  type Tag,
  type Topic,
} from '../../lib/db-types.js';
import { selectOptionalQuestionByUuid } from '../../models/question.js';
import { selectTagsByCourseId } from '../../models/tags.js';
import { selectOptionalTopicByName } from '../../models/topics.js';
import * as schemas from '../../schemas/index.js';
import type { QuestionJson } from '../../schemas/index.js';
import { isSharingEnabledForCourse, loadAndValidateJson, validateQuestion } from '../course-db.js';
import { sync as syncAuthors } from '../fromDisk/authors.js';
import { getParamsForQuestion } from '../fromDisk/questions.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectMatchingQuestion(pathPrefix: string) {
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

export function qidFromFilePath(filePath: string): string {
  const relativePath = path.relative('questions', filePath);
  return relativePath.replace(/\/info\.json$/, '');
}

async function loadAndValidateQuestionJson(
  course: Course,
  jsonFilePath: string,
): Promise<infofile.InfoFile<QuestionJson> | null> {
  const sharingEnabled = await isSharingEnabledForCourse({ course_id: course.id });
  return await loadAndValidateJson({
    coursePath: course.path,
    filePath: jsonFilePath,
    schema: schemas.infoQuestion,
    zodSchema: schemas.QuestionJsonSchema,
    validate: (question: QuestionJson) => validateQuestion({ question, sharingEnabled }),
    // This shouldn't matter, as we've already guaranteed that the file exists.
    tolerateMissing: false,
  });
}

/**
 * Validates and retrieves the topic for a question.
 * Returns the topic if it exists, null if no topic is specified or if the topic doesn't exist.
 */
async function validateAndGetTopic(
  course: Course,
  jsonData: infofile.InfoFile<QuestionJson>,
): Promise<Topic | null> {
  // If the question has data, it's guaranteed to have a non-null `topic` property.
  // The only time there's no topic is if the file has errors and thus no data.
  if (!jsonData.data) return null;

  return await selectOptionalTopicByName({
    course_id: course.id,
    name: jsonData.data.topic,
  });
}

/**
 * Validates and retrieves the tags for a question. Returns `null` if any tags
 * don't exist.
 */
async function validateAndGetTags(
  course: Course,
  jsonData: infofile.InfoFile<QuestionJson>,
): Promise<Tag[] | null> {
  if (!jsonData.data?.tags.length) return [];

  const courseTags = await selectTagsByCourseId(course.id);
  const courseTagsMap = new Map(courseTags.map((tag) => [tag.name, tag]));
  const questionTags = new Map(
    jsonData.data.tags
      .map((tagName) => [tagName, courseTagsMap.get(tagName)] as const)
      .filter((entry): entry is [string, Tag] => entry[1] !== undefined),
  );

  // All tags must already exist. If any of them don't, we can't do a fast sync.
  //
  // We could theoretically add a fast path for this and insert any missing tags.
  // That's not yet worth the effort.
  const questionTagNames = new Set(jsonData.data.tags);
  const allTagsExist =
    questionTags.size === questionTagNames.size &&
    [...questionTagNames].every((tagName) => questionTags.has(tagName));
  if (!allTagsExist) return null;

  return Array.from(questionTags.values());
}

async function updateQuestion(
  question: Question,
  infoFile: infofile.InfoFile<QuestionJson>,
  topic: Topic | null,
  tags: Tag[],
): Promise<Question> {
  if (infofile.hasErrors(infoFile)) {
    // Write the errors to the question.
    return await queryRow(
      sql.update_question_errors_and_warnings,
      {
        id: question.id,
        errors: infofile.stringifyErrors(infoFile),
        warnings: infofile.stringifyWarnings(infoFile),
      },
      QuestionSchema,
    );
  }

  return await runInTransactionAsync(async () => {
    assert(question.qid, 'Question must have a QID');
    assert(topic?.id, 'Topic must be defined');

    // Update the question's properties.
    const updatedQuestion = await queryRow(
      sql.update_question,
      {
        id: question.id,
        qid: question.qid,
        data: getParamsForQuestion(question.qid, infoFile.data),
        topic_id: topic.id,
        warnings: infofile.stringifyWarnings(infoFile),
      },
      QuestionSchema,
    );

    // Update the question's tags.
    const tagIds = tags.map((tag) => tag.id);
    await execute(sql.sync_question_tags, {
      new_question_tags: [JSON.stringify([updatedQuestion.id, tagIds])],
    });

    // Sync the authors.
    await syncAuthors({ [question.qid]: infoFile }, { [question.qid]: question.id });

    return updatedQuestion;
  });
}

/**
 * Attempts to sync a question's JSON file. Returns the question if the question
 * was able to be fast synced, `null` otherwise. If `null`, one should fall back to
 * a full, slow sync.
 */
export async function syncQuestionJson(
  course: Course,
  pathPrefix: string,
  { skipGradingMethodBail = false }: { skipGradingMethodBail?: boolean } = {},
): Promise<Question | null> {
  const existingQuestion = await selectMatchingQuestion(pathPrefix);

  if (existingQuestion) {
    // These files all correspond to an existing question. This is the easy case.
    // Update the `questions` row from the JSON file (if relevant) and upload any
    // new chunks (if relevant).

    // We can't handle these cases.
    if (!existingQuestion.qid || !existingQuestion.uuid) return null;

    const jsonData = await loadAndValidateQuestionJson(
      course,
      path.join('questions', existingQuestion.qid, 'info.json'),
    );

    // If we're missing JSON data or the UUID, we can't do a fast sync.
    //
    // This implicitly handles the case of question deletion, since that's the
    // case in which the `info.json` file would be missing. We could have a
    // fast case for this too, e.g. we could safely delete draft questions, or
    // non-shared questions that aren't used on any assessments. But question
    // deletion isn't that common, so we can handle that with full syncing for now.
    if (!jsonData?.uuid) return null;

    // If the UUIDs don't match, we can't do a fast sync.
    if (jsonData.uuid !== existingQuestion.uuid) return null;

    // If we're changing either to or from the Manual grading method, point
    // allocations in dependent assessments change. The per-case path can't
    // handle that, so it bails to a full sync. Callers that resync those
    // assessments themselves (e.g. the graph engine) pass `skipGradingMethodBail`.
    if (
      !skipGradingMethodBail &&
      jsonData.data?.gradingMethod !== existingQuestion.grading_method &&
      (jsonData.data?.gradingMethod === 'Manual' || existingQuestion.grading_method === 'Manual')
    ) {
      return null;
    }

    // The topic must already exist. If it doesn't, we can't do a fast sync.
    // The exception is when there's an error in the file, in which case we
    // don't care about syncing the topic (and in fact we don't know what it
    // is from the file anyways).
    const topic = await validateAndGetTopic(course, jsonData);
    if (!topic && !infofile.hasErrors(jsonData)) return null;

    const tags = await validateAndGetTags(course, jsonData);
    if (tags === null) return null;

    return await updateQuestion(existingQuestion, jsonData, topic, tags);
  }

  // One of several things could be true:
  // - These could be files in the questions directory but not part of a question,
  //   e.g. a bare `README.md` file in some intermediate directory.
  // - These could be files that are part of a newly-created question. This will
  //   probably be the case if there's a new `info.json` file present.

  // Either there's a single JSON file that was added, in which case the path
  // prefix should be the JSON file itself, or there are multiple files, in
  // which case we'd expect to find a JSON file directly under the path prefix.
  const jsonFilePath = await run(async () => {
    if (pathPrefix.endsWith('.json')) {
      // The path prefix is the JSON file itself.
      return pathPrefix;
    }

    // The path prefix is a directory, so look for an `info.json` file in it.
    const jsonFilePath = path.join(course.path, pathPrefix, 'info.json');
    const jsonFileStat = await fs.stat(jsonFilePath).catch(() => null);

    // Handle when the file doesn't exist or isn't actually a file.
    if (!jsonFileStat?.isFile()) return null;

    return path.join(pathPrefix, 'info.json');
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
    return null;
  }

  const jsonData = await loadAndValidateQuestionJson(course, jsonFilePath);

  // If we're missing JSON data or the UUID, we can't do a fast sync.
  if (!jsonData?.uuid) return null;

  // Get the existing question by UUID, if it exists.
  const existingQuestionByUuid = await selectOptionalQuestionByUuid({
    course_id: course.id,
    uuid: jsonData.uuid,
  });

  // If there is an existing question with this UUID, we'll fall back to slow
  // sync.
  //
  // TODO: we could in theory handle this case in the future. Skipping for now
  // as it's not a common scenario and would require more complex logic.
  if (existingQuestionByUuid) return null;

  // The topic must already exist. If it doesn't, we can't do a fast sync.
  // The exception is when there's an error in the file, in which case we
  // don't care about syncing the topic (and in fact we don't know what it
  // is from the file anyways).
  const topic = await validateAndGetTopic(course, jsonData);
  if (!topic && !infofile.hasErrors(jsonData)) return null;

  const tags = await validateAndGetTags(course, jsonData);
  if (tags === null) return null;

  // Create a new question in the database.
  const qid = qidFromFilePath(jsonFilePath);
  return await runInTransactionAsync(async () => {
    const initialQuestion = await queryRow(
      sql.insert_question,
      {
        course_id: course.id,
        qid,
        uuid: jsonData.uuid,
      },
      QuestionSchema,
    );

    return await updateQuestion(initialQuestion, jsonData, topic, tags);
  });
}

/**
 * Fast-syncs a question rename: the question directory moved from `oldQid` to
 * `newQid` (same UUID). Updates the `questions` row's `qid`/`directory` and
 * re-syncs its fields from the new `info.json`. Returns the updated question, or
 * `null` to fall back to a full sync.
 */
export async function syncQuestionRename(
  course: Course,
  oldQid: string,
  newQid: string,
): Promise<Question | null> {
  const jsonData = await loadAndValidateQuestionJson(
    course,
    path.join('questions', newQid, 'info.json'),
  );
  // Need valid JSON with a UUID to safely rename.
  if (!jsonData?.uuid || infofile.hasErrors(jsonData)) return null;

  const existingQuestion = await selectOptionalQuestionByUuid({
    course_id: course.id,
    uuid: jsonData.uuid,
  });
  // For this to be a rename, the question must already exist under the old QID.
  if (!existingQuestion || existingQuestion.qid !== oldQid) return null;

  const topic = await validateAndGetTopic(course, jsonData);
  if (!topic) return null;

  const tags = await validateAndGetTags(course, jsonData);
  if (tags === null) return null;

  return await runInTransactionAsync(async () => {
    await execute(sql.update_question_qid, { id: existingQuestion.id, qid: newQid });
    return await updateQuestion({ ...existingQuestion, qid: newQid }, jsonData, topic, tags);
  });
}

import { z } from 'zod';

import {
  callAsync,
  loadSqlEquiv,
  queryAsync,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { TagSchema, type Tag } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

import { determineOperationsForEntities } from './entity-list.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredTag {
  // TODO: this must be non-null in the database schema.
  name: string | null;
  // TODO: make these all non-nullable once we make them non-null in the database schema.
  color: string | null;
  description: string | null;
  number: number | null;
}

export async function sync(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, any>,
) {
  // We can only safely remove unused tags if both `infoCourse.json` and all
  // question `info.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoQuestionsValid = Object.values(courseData.questions).every(
    (q) => !infofile.hasErrors(q),
  );
  const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

  const knownQuestionTagsNames = new Set<string>();
  Object.values(courseData.questions).forEach((q) => {
    if (!infofile.hasErrors(q)) {
      (q.data?.tags ?? []).forEach((t) => knownQuestionTagsNames.add(t));
    }
  });
  const questionTagNames = [...knownQuestionTagsNames];

  const existingTags = await queryRows(sql.select_tags, { course_id: courseId }, TagSchema);

  // Based on the set of desired tags, determine which ones must be
  // added, updated, or deleted.
  const {
    entitiesToCreate: tagsToCreate,
    entitiesToUpdate: tagsToUpdate,
    entitiesToDelete: tagsToDelete,
  } = determineOperationsForEntities<DesiredTag>({
    courseEntities: courseData.course.data?.tags ?? [],
    existingEntities: existingTags,
    knownNames: knownQuestionTagsNames,
    // TODO: add missing tests; confirm behavior for topics too.
    makeImplicitEntity: (name) => ({
      name,
    }),
    isInfoCourseValid,
    deleteUnused,
  });

  const newTags = await runInTransactionAsync(async () => {
    const insertedTags = await run(async () => {
      if (tagsToCreate.length === 0) return [];

      return queryRows(
        sql.insert_tags,
        {
          course_id: courseId,
          tags: tagsToCreate.map((t) =>
            JSON.stringify([t.name, t.description, t.color, t.number, t.implicit]),
          ),
        },
        TagSchema,
      );
    });

    if (tagsToUpdate.length > 0) {
      await queryAsync(sql.update_tags, {
        course_id: courseId,
        tags: tagsToUpdate.map((t) =>
          JSON.stringify([t.name, t.description, t.color, t.number, t.implicit]),
        ),
      });
    }

    if (tagsToDelete.length > 0) {
      await queryAsync(sql.delete_tags, {
        course_id: courseId,
        tags: tagsToDelete,
      });
    }

    return insertedTags;
  });

  const tagIdsByName = new Map<string, Tag>();

  for (const tag of existingTags) {
    tagIdsByName.set(tag.name, tag);
  }

  for (const tag of newTags) {
    tagIdsByName.set(tag.name, tag);
  }

  const questionTagsParam: string[] = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    const dedupedQuestionTagNames = new Set<string>();
    (question.data?.tags ?? []).forEach((t) => dedupedQuestionTagNames.add(t));
    const questionTagIds = [...dedupedQuestionTagNames].map((t) => tagIdsByName.get(t)?.id);
    questionTagsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  await callAsync('sync_question_tags', [questionTagsParam]);
}

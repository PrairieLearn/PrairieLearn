import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { type Tag, TagSchema } from '../../lib/db-types.js';
import type { CommentJson } from '../../schemas/comment.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

import { determineOperationsForEntities } from './entity-list.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredTag {
  name: string;
  color: string;
  description?: string | null;
  comment?: CommentJson;
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
    makeImplicitEntity: (name) => ({
      name,
      color: 'gray1',
      description: name,
    }),
    comparisonProperties: ['color', 'description'],
    isInfoCourseValid,
    deleteUnused,
  });

  const newTags = await run(async () => {
    if (tagsToCreate.length === 0 && tagsToUpdate.length === 0 && tagsToDelete.length === 0) {
      return [];
    }

    return await runInTransactionAsync(async () => {
      const insertedTags = await run(async () => {
        if (tagsToCreate.length === 0) return [];

        return queryRows(
          sql.insert_tags,
          {
            course_id: courseId,
            tags: tagsToCreate.map((t) =>
              JSON.stringify([t.name, t.description, t.color, t.number, t.implicit, t.comment]),
            ),
          },
          TagSchema,
        );
      });

      if (tagsToUpdate.length > 0) {
        await execute(sql.update_tags, {
          course_id: courseId,
          tags: tagsToUpdate.map((t) =>
            JSON.stringify([t.name, t.description, t.color, t.number, t.implicit, t.comment]),
          ),
        });
      }

      if (tagsToDelete.length > 0) {
        await execute(sql.delete_tags, {
          course_id: courseId,
          tags: tagsToDelete,
        });
      }

      return insertedTags;
    });
  });

  const tagIdsByName = new Map<string, Tag>();

  for (const tag of existingTags) {
    tagIdsByName.set(tag.name, tag);
  }

  for (const tag of newTags) {
    tagIdsByName.set(tag.name, tag);
  }

  const new_question_tags = Object.entries(courseData.questions)
    .filter(([_qid, question]) => !infofile.hasErrors(question))
    .map(([qid, question]) => {
      const dedupedQuestionTagNames = new Set<string>(question.data?.tags);
      const questionTagIds = [...dedupedQuestionTagNames].map((t) => {
        const tag = tagIdsByName.get(t);

        // This should never happen in practice, but this keeps the type checker
        // happy, and if it does happen, we want it to fail obviously and loudly.
        if (!tag) throw new Error(`Tag ${t} not found`);

        return tag.id;
      });
      return JSON.stringify([questionIds[qid], questionTagIds]);
    });

  await execute(sql.sync_question_tags, { new_question_tags });
}

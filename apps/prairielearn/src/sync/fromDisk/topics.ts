import { loadSqlEquiv, queryAsync, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { TopicSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

import { determineOperationsForEntities } from './entity-list.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredTopic {
  name: string;
  color: string;
  description?: string | null;
}

export async function sync(courseId: string, courseData: CourseData) {
  // We can only safely remove unused topics if both `infoCourse.json` and all
  // question `info.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoQuestionsValid = Object.values(courseData.questions).every(
    (q) => !infofile.hasErrors(q),
  );
  const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

  const knownQuestionTopicNames = new Set<string>();
  Object.values(courseData.questions).forEach((q) => {
    // We technically allow courses to define an "empty string" topic, so we'll
    // support that for implicit topics as well by checking if the topic is
    // nullish, rather than falsy (which wouldn't handle empty strings).
    //
    // TODO: consider requiring that all topics have a non-empty name.
    if (!infofile.hasErrors(q) && q.data?.topic != null) {
      knownQuestionTopicNames.add(q.data.topic);
    }
  });

  const existingTopics = await queryRows(sql.select_topics, { course_id: courseId }, TopicSchema);

  // Based on the set of desired topics, determine which ones must be
  // added, updated, or deleted.
  const {
    entitiesToCreate: topicsToCreate,
    entitiesToUpdate: topicsToUpdate,
    entitiesToDelete: topicsToDelete,
  } = determineOperationsForEntities<DesiredTopic>({
    courseEntities: courseData.course.data?.topics ?? [],
    existingEntities: existingTopics,
    knownNames: knownQuestionTopicNames,
    makeImplicitEntity: (name) => ({
      name,
      color: 'gray1',
      description:
        'Auto-generated from use in a question; add this topic to your infoCourse.json file to customize',
    }),
    comparisonProperties: ['color', 'description'],
    isInfoCourseValid,
    deleteUnused,
  });

  if (topicsToCreate.length || topicsToUpdate.length || topicsToDelete.length) {
    await runInTransactionAsync(async () => {
      if (topicsToCreate.length > 0) {
        await queryAsync(sql.insert_topics, {
          course_id: courseId,
          topics: topicsToCreate.map((t) =>
            JSON.stringify([t.name, t.description, t.color, t.number, t.implicit]),
          ),
        });
      }

      if (topicsToUpdate.length > 0) {
        await queryAsync(sql.update_topics, {
          course_id: courseId,
          topics: topicsToUpdate.map((t) =>
            JSON.stringify([t.name, t.description, t.color, t.number, t.implicit]),
          ),
        });
      }

      if (topicsToDelete.length > 0) {
        await queryAsync(sql.delete_topics, { course_id: courseId, topics: topicsToDelete });
      }
    });
  }
}

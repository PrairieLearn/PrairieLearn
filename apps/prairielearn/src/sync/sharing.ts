import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type ServerJobLogger } from '../lib/server-jobs.js';

import { type CourseData } from './course-db.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface SharedQuestion {
  id: string;
  qid: string;
  share_publicly: boolean;
}

export async function selectSharedQuestions(courseId: string): Promise<SharedQuestion[]> {
  return await sqldb.queryRows(
    sql.select_shared_questions,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
      share_publicly: z.boolean(),
    }),
  );
}

export function getInvalidRenames(
  sharedQuestions: SharedQuestion[],
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidRenames: string[] = [];
  sharedQuestions.forEach((question) => {
    if (!(question.qid in courseData.questions)) {
      invalidRenames.push(question.qid);
    }
  });

  const existInvalidRenames = invalidRenames.length > 0;
  if (existInvalidRenames) {
    logger.error(
      `✖ Course sync completely failed. The following questions are shared and cannot be renamed or deleted: ${invalidRenames.join(', ')}`,
    );
  }
  return existInvalidRenames;
}

export async function checkInvalidPublicSharingRemovals(
  courseId: string,
  sharedQuestions: SharedQuestion[],
  courseData: CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  const unsharingQuestionIds: string[] = [];
  for (const question of sharedQuestions) {
    if (!question.share_publicly) continue;
    const questionData = courseData.questions[question.qid]?.data;
    if (!questionData?.sharePublicly) {
      unsharingQuestionIds.push(question.id);
    }
  }

  if (unsharingQuestionIds.length === 0) return false;

  const blockedQuestions = await sqldb.queryRows(
    sql.select_questions_blocking_unshare,
    { course_id: courseId, question_ids: unsharingQuestionIds },
    z.object({
      id: IdSchema,
      qid: z.string(),
      used_in_other_course: z.boolean(),
      used_in_public_assessment: z.boolean(),
    }),
  );

  if (blockedQuestions.length === 0) return false;

  const usedInOtherCourse = blockedQuestions.filter((q) => q.used_in_other_course).map((q) => q.qid);
  const usedInPublicAssessment = blockedQuestions
    .filter((q) => q.used_in_public_assessment)
    .map((q) => q.qid);

  const messages: string[] = ['✖ Course sync completely failed.'];
  if (usedInOtherCourse.length > 0) {
    messages.push(
      `The following publicly shared questions cannot be unshared because they are used in other courses' assessments: ${usedInOtherCourse.join(', ')}.`,
    );
  }
  if (usedInPublicAssessment.length > 0) {
    messages.push(
      `The following publicly shared questions cannot be unshared because they are used in publicly shared assessments in this course: ${usedInPublicAssessment.join(', ')}.`,
    );
  }
  logger.error(messages.join(' '));

  return true;
}

export async function checkInvalidSharingSetDeletions(
  courseId: string,
  courseData: CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  const sharingSets = await sqldb.queryScalars(
    sql.select_sharing_sets,
    { course_id: courseId },
    z.string(),
  );

  const invalidSharingSetDeletions: string[] = [];
  const sharingSetNames = new Set((courseData.course.data?.sharingSets || []).map((ss) => ss.name));
  sharingSets.forEach((sharingSet) => {
    if (!sharingSetNames.has(sharingSet)) {
      invalidSharingSetDeletions.push(sharingSet);
    }
  });

  const existInvalidSharingSetDeletions = invalidSharingSetDeletions.length > 0;
  if (existInvalidSharingSetDeletions) {
    logger.error(
      `✖ Course sync completely failed. The following sharing sets cannot be removed from 'infoCourse.json': ${invalidSharingSetDeletions.join(', ')}`,
    );
  }
  return existInvalidSharingSetDeletions;
}

export async function checkInvalidSharingSetRemovals(
  courseId: string,
  courseData: CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  const sharedQuestions = await sqldb.queryRows(
    sql.select_question_sharing_sets,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
      sharing_sets: z.string().array(),
    }),
  );

  const invalidSharingSetRemovals: Record<string, string[]> = {};
  sharedQuestions.forEach((question) => {
    if (!(question.qid in courseData.questions)) {
      // this case is handled by the checks for shared questions being
      // renamed or deleted
      return;
    }
    if (!courseData.questions[question.qid].data?.sharingSets) {
      invalidSharingSetRemovals[question.qid] = question.sharing_sets;
      return;
    }

    question.sharing_sets.forEach((sharingSet) => {
      // TODO: allow if the sharing set hasn't been shared to a course
      if (!courseData.questions[question.qid].data?.sharingSets?.includes(sharingSet)) {
        if (!(question.qid in invalidSharingSetRemovals)) {
          invalidSharingSetRemovals[question.qid] = [];
        }
        invalidSharingSetRemovals[question.qid].push(sharingSet);
      }
    });
  });

  const existInvalidSharingSetRemovals = Object.keys(invalidSharingSetRemovals).length > 0;
  if (existInvalidSharingSetRemovals) {
    logger.error(
      `✖ Course sync completely failed. The following questions are not allowed to be removed from the listed sharing sets: ${Object.keys(
        invalidSharingSetRemovals,
      )
        .map((key) => `${key}: ${JSON.stringify(invalidSharingSetRemovals[key])}`)
        .join(', ')}`,
    );
  }

  return existInvalidSharingSetRemovals;
}

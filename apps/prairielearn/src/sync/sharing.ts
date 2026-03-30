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

export function checkInvalidPublicSharingRemovals(
  sharedQuestions: SharedQuestion[],
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidUnshares: string[] = [];
  sharedQuestions.forEach((question) => {
    if (!question.share_publicly) {
      return;
    }

    // TODO: allow if question is not used in anyone else's assessments
    const questionData = courseData.questions[question.qid].data;
    if (!questionData?.sharePublicly) {
      invalidUnshares.push(question.qid);
    }
  });

  const existInvalidUnshares = invalidUnshares.length > 0;
  if (existInvalidUnshares) {
    logger.error(
      `✖ Course sync completely failed. The following questions are are publicly shared and cannot be unshared: ${invalidUnshares.join(', ')}`,
    );
  }
  return existInvalidUnshares;
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

import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';
import { type ServerJobLogger } from '../lib/server-jobs.js';

import { type CourseData } from './course-db.js';
const sql = sqldb.loadSqlEquiv(import.meta.url);

interface SharedQuestion {
  id: string;
  qid: string;
  shared_publicly: boolean;
}

export async function selectSharedQuestions(courseId: string): Promise<SharedQuestion[]> {
  return await sqldb.queryRows(
    sql.select_shared_questions,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
      shared_publicly: z.boolean(),
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
    if (!courseData.questions[question.qid]) {
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
    if (!question.shared_publicly) {
      return;
    }

    // TODO: allow if question is not used in anyone else's assessments
    const questionData = courseData.questions[question.qid].data;
    if (!(questionData?.sharePublicly || questionData?.sharedPublicly)) {
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
  const sharingSets = await sqldb.queryRows(
    sql.select_sharing_sets,
    { course_id: courseId },
    z.string(),
  );

  const invalidSharingSetDeletions: string[] = [];
  const sharingSetNames = (courseData.course.data?.sharingSets || []).map((ss) => ss.name);
  sharingSets.forEach((sharingSet) => {
    if (!sharingSetNames.includes(sharingSet)) {
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

export function checkInvalidSharingSetAdditions(
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidSharingSetAdditions: Record<string, string[]> = {};
  const sharingSetNames = (courseData.course.data?.sharingSets || []).map((ss) => ss.name);

  for (const qid in courseData.questions) {
    const question = courseData.questions[qid];
    const questionSharingSets = question.data?.sharingSets || [];
    questionSharingSets.forEach((sharingSet) => {
      if (!sharingSetNames.includes(sharingSet)) {
        if (!invalidSharingSetAdditions[qid]) {
          invalidSharingSetAdditions[qid] = [];
        }
        invalidSharingSetAdditions[qid].push(sharingSet);
      }
    });
  }

  const existInvalidSharingSetAdditions = Object.keys(invalidSharingSetAdditions).length > 0;
  if (existInvalidSharingSetAdditions) {
    logger.error(
      `✖ Course sync completely failed. The following questions are being added to sharing sets which do not exist: ${Object.keys(
        invalidSharingSetAdditions,
      )
        .map((key) => `${key}: ${JSON.stringify(invalidSharingSetAdditions[key])}`)
        .join(', ')}`,
    );
  }
  return existInvalidSharingSetAdditions;
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
    if (!courseData.questions[question.qid]) {
      // this case is handled by the checks for shared questions being
      // renamed or deleted
      return;
    }
    if (!courseData.questions[question.qid].data?.sharingSets) {
      invalidSharingSetRemovals[question.qid] = question.sharing_sets;
    }

    question.sharing_sets.forEach((sharingSet) => {
      // TODO: allow if the sharing set hasn't been shared to a course
      if (!courseData.questions[question.qid].data?.sharingSets.includes(sharingSet)) {
        if (!invalidSharingSetRemovals[question.qid]) {
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

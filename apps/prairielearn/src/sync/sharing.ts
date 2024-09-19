import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';

import { CourseData } from './course-db.js';
const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function getInvalidRenames(
  courseId: string,
  courseData: CourseData,
): Promise<string[]> {
  const sharedQuestions = await sqldb.queryRows(
    sql.select_shared_questions,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
    }),
  );
  const invalidRenames: string[] = [];
  sharedQuestions.forEach((question) => {
    // TODO: allow if question is not in a sharing set or publicly shared
    if (!courseData.questions[question.qid]) {
      invalidRenames.push(question.qid);
    }
  });
  return invalidRenames;
}

export async function getInvalidPublicSharingRemovals(
  courseId: string,
  courseData: CourseData,
): Promise<string[]> {
  const sharedQuestions = await sqldb.queryRows(
    sql.select_shared_questions,
    { course_id: courseId },
    z.object({
      id: IdSchema,
      qid: z.string(),
      shared_publicly: z.boolean(),
    }),
  );
  const invalidUnshares: string[] = [];
  sharedQuestions.forEach((question) => {
    if (!question.shared_publicly) {
      return;
    }

    // TODO: allow if question is not used in anyone else's assessments
    const questionData = courseData.questions[question.qid].data;
    if (!(questionData?.sharedPublicly || questionData?.sharedPubliclyWithSource)) {
      invalidUnshares.push(question.qid);
    }
  });
  return invalidUnshares;
}

export async function getInvalidSharingSetRemovals(
  courseId: string,
  courseData: CourseData,
): Promise<Record<string, string[]>> {
  const sharedQuestions = await sqldb.queryRows(
    sql.select_sharing_set_questions,
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
        if (!(question.qid in invalidSharingSetRemovals)) {
          invalidSharingSetRemovals[question.qid] = [];
        }
        invalidSharingSetRemovals[question.qid].push(sharingSet);
      }
    });
  });
  return invalidSharingSetRemovals;
}

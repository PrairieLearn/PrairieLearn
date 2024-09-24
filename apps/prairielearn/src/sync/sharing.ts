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

export async function getInvalidSharingSetDeletions(
  courseId: string,
  courseData: CourseData,
): Promise<string[]> {
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
  return invalidSharingSetDeletions;
}

export async function getInvalidSharingSetAdditions(
  courseData: CourseData,
): Promise<Record<string, string[]>> {
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
  return invalidSharingSetAdditions;
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
        if (!invalidSharingSetRemovals[question.qid]) {
          invalidSharingSetRemovals[question.qid] = [];
        }
        invalidSharingSetRemovals[question.qid].push(sharingSet);
      }
    });
  });
  return invalidSharingSetRemovals;
}

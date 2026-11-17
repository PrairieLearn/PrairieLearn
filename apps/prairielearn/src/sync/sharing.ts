import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type ServerJobLogger } from '../lib/server-jobs.js';
import { selectQuestionsUsedInOtherCourses } from '../models/question.js';

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

export async function getInvalidRenames(
  courseId: string,
  sharedQuestions: SharedQuestion[],
  courseData: CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  const renamedQuestions = sharedQuestions.filter(
    (question) => !(question.qid in courseData.questions),
  );

  if (renamedQuestions.length === 0) return false;

  const blockedQuestions = await selectQuestionsUsedInOtherCourses({
    course_id: courseId,
    question_ids: renamedQuestions.map((q) => q.id),
  });

  if (blockedQuestions.length === 0) return false;

  logger.error(
    `✖ Course sync completely failed. The following questions are shared and used in other courses, so they cannot be renamed or deleted: ${blockedQuestions.map((q) => q.qid).join(', ')}`,
  );
  return true;
}

export async function checkInvalidPublicSharingRemovals(
  courseId: string,
  sharedQuestions: SharedQuestion[],
  courseData: CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  const unsharingQuestionIds: string[] = [];
  // Questions that remain source-public are still valid in same-course public assessments, but
  // they are not valid for other-course imports that require full public sharing.
  const sourcePublicQuestionIds = new Set<string>();
  for (const question of sharedQuestions) {
    if (!question.share_publicly) continue;
    if (!(question.qid in courseData.questions)) {
      // Renamed or deleted questions are handled by getInvalidRenames.
      continue;
    }
    const questionData = courseData.questions[question.qid].data;
    if (!questionData?.sharePublicly) {
      unsharingQuestionIds.push(question.id);
      if (questionData?.shareSourcePublicly) {
        sourcePublicQuestionIds.add(question.id);
      }
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

  const usedInOtherCourse = blockedQuestions
    .filter((q) => q.used_in_other_course)
    .map((q) => q.qid);
  const usedInPublicAssessment = blockedQuestions
    .filter((q) => q.used_in_public_assessment && !sourcePublicQuestionIds.has(q.id))
    .map((q) => q.qid);

  if (usedInOtherCourse.length === 0 && usedInPublicAssessment.length === 0) return false;

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
  const sharingSetNames = (courseData.course.data?.sharingSets ?? []).map((ss) => ss.name);
  const invalidSharingSetDeletions = await sqldb.queryScalars(
    sql.select_blocked_sharing_set_deletions,
    { course_id: courseId, sharing_set_names: sharingSetNames },
    z.string(),
  );

  const existInvalidSharingSetDeletions = invalidSharingSetDeletions.length > 0;
  if (existInvalidSharingSetDeletions) {
    logger.error(
      `✖ Course sync completely failed. The following sharing sets are still in use and cannot be removed from 'infoCourse.json': ${invalidSharingSetDeletions.join(', ')}`,
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

  const removedQuestionSharingSets: { question_id: string; sharing_set_name: string }[] = [];
  sharedQuestions.forEach((question) => {
    if (!(question.qid in courseData.questions)) {
      // this case is handled by the checks for shared questions being
      // renamed or deleted
      return;
    }
    const diskSharingSets = courseData.questions[question.qid].data?.sharingSets ?? [];
    question.sharing_sets.forEach((sharingSet) => {
      if (!diskSharingSets.includes(sharingSet)) {
        removedQuestionSharingSets.push({
          question_id: question.id,
          sharing_set_name: sharingSet,
        });
      }
    });
  });

  if (removedQuestionSharingSets.length === 0) return false;

  // This check intentionally ignores `questions.share_publicly`: a publicly
  // shared question still gets blocked if a consumer with access via the set
  // uses it. To loosen this so public sharing acts as a fallback path, add
  // `AND NOT q.share_publicly` to `select_in_use_question_sharing_set_removals`.
  const blockedPairs = await sqldb.queryRows(
    sql.select_in_use_question_sharing_set_removals,
    {
      course_id: courseId,
      removed_question_sharing_sets: JSON.stringify(removedQuestionSharingSets),
    },
    z.object({ qid: z.string(), sharing_set_name: z.string() }),
  );

  if (blockedPairs.length === 0) return false;

  const invalidSharingSetRemovals: Record<string, string[]> = {};
  for (const { qid, sharing_set_name } of blockedPairs) {
    if (!(qid in invalidSharingSetRemovals)) {
      invalidSharingSetRemovals[qid] = [];
    }
    invalidSharingSetRemovals[qid].push(sharing_set_name);
  }

  const blockedLines = Object.entries(invalidSharingSetRemovals).map(
    ([qid, sharingSets]) => `  - ${qid}: ${sharingSets.join(', ')}`,
  );
  logger.error(
    `✖ Course sync completely failed. The following questions cannot be removed from these sharing sets because at least one consuming course with access to the sharing set uses the question:\n${blockedLines.join('\n')}`,
  );

  return true;
}

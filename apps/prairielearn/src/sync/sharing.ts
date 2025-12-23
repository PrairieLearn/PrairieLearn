import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '@prairielearn/zod';
import { type ServerJobLogger } from '../lib/server-jobs.js';

import { type CourseData } from './course-db.js';
import { isDraftQid } from './question.js';

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
  const sharingSets = await sqldb.queryRows(
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

export function checkInvalidSharingSetAdditions(
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidSharingSetAdditions: Record<string, string[]> = {};
  const sharingSetNames = new Set((courseData.course.data?.sharingSets || []).map((ss) => ss.name));

  for (const qid in courseData.questions) {
    const question = courseData.questions[qid];
    const questionSharingSets = question.data?.sharingSets || [];
    questionSharingSets.forEach((sharingSet) => {
      if (!sharingSetNames.has(sharingSet)) {
        if (!(qid in invalidSharingSetAdditions)) {
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

export function checkInvalidSharedAssessments(
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidSharedAssessments = new Set<string>();
  for (const courseInstanceKey in courseData.courseInstances) {
    const courseInstance = courseData.courseInstances[courseInstanceKey];
    for (const tid in courseInstance.assessments) {
      const assessment = courseInstance.assessments[tid];
      if (!assessment.data?.shareSourcePublicly) {
        continue;
      }
      for (const zone of assessment.data.zones) {
        for (const question of zone.questions) {
          if (!question.id) {
            continue;
          }
          const infoJson = courseData.questions[question.id];
          if (!infoJson.data?.sharePublicly && !infoJson.data?.shareSourcePublicly) {
            invalidSharedAssessments.add(tid);
          }
        }
      }
    }
  }

  const existInvalidSharedAssessment = invalidSharedAssessments.size > 0;
  if (existInvalidSharedAssessment) {
    logger.error(
      `✖ Course sync completely failed. The following assessments have their source publicly shared, but contain questions which are not publicly shared: ${Array.from(invalidSharedAssessments).join(', ')}`,
    );
  }
  return existInvalidSharedAssessment;
}

export function checkInvalidSharedCourseInstances(
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const invalidSharedCourseInstances = new Set<string>();

  for (const courseInstanceKey in courseData.courseInstances) {
    const courseInstance = courseData.courseInstances[courseInstanceKey];
    if (!courseInstance.courseInstance.data?.shareSourcePublicly) continue;

    for (const tid in courseInstance.assessments) {
      const assessment = courseInstance.assessments[tid];
      if (!assessment.data?.shareSourcePublicly) {
        invalidSharedCourseInstances.add(courseInstance.courseInstance.data.longName);
      }
    }
  }

  const existInvalidSharedCourseInstance = invalidSharedCourseInstances.size > 0;
  if (existInvalidSharedCourseInstance) {
    logger.error(
      `✖ Course sync completely failed. The following course instances are publicly shared but contain assessments which are not shared: ${Array.from(invalidSharedCourseInstances).join(', ')}`,
    );
  }
  return existInvalidSharedCourseInstance;
}

export function checkInvalidDraftQuestionSharing(
  courseData: CourseData,
  logger: ServerJobLogger,
): boolean {
  const draftQuestionsWithSharingSets: string[] = [];
  const draftQuestionsWithPublicSharing: string[] = [];
  for (const qid in courseData.questions) {
    const question = courseData.questions[qid];

    const isDraft = isDraftQid(qid);
    const questionSharingSets = question.data?.sharingSets || [];

    if (isDraft && questionSharingSets.length > 0) {
      draftQuestionsWithSharingSets.push(qid);
    }

    if (isDraft && (question.data?.sharePublicly || question.data?.shareSourcePublicly)) {
      draftQuestionsWithPublicSharing.push(qid);
    }
  }

  if (draftQuestionsWithSharingSets.length > 0) {
    logger.error(
      `✖ Course sync completely failed. The following draft questions cannot be added to sharing sets: ${draftQuestionsWithSharingSets.join(', ')}`,
    );
  }

  if (draftQuestionsWithPublicSharing.length > 0) {
    logger.error(
      `✖ Course sync completely failed. The following draft questions cannot be publicly shared: ${draftQuestionsWithPublicSharing.join(', ')}`,
    );
  }

  return draftQuestionsWithSharingSets.length > 0 || draftQuestionsWithPublicSharing.length > 0;
}

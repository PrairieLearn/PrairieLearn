import * as path from 'path';

import fs from 'fs-extra';

import { selectAssessmentsReferencingQuestions } from '../models/assessment.js';
import { selectQuestionsUsedInOtherCourses } from '../models/question.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';

import { type Course, type Question } from './db-types.js';
import {
  type BlockedAssessment,
  blockerDescription,
  removeQidsFromAssessment,
} from './infoAssessment-edits.js';

/** Derives the set of QIDs to remove from assessment files when `questions` are deleted. */
export function qidsToRemoveForQuestions(questions: Pick<Question, 'qid'>[]): Set<string> {
  return new Set(questions.flatMap((question) => (question.qid ? [question.qid] : [])));
}

/**
 * Returns the assessments referencing `questionIds` whose `infoAssessment.json`
 * would become invalid after the deletion (e.g. losing all zones, or promoting
 * a lockpoint zone to first). Unreadable files are skipped — sync surfaces that
 * error separately if the deletion proceeds.
 */
async function selectAssessmentsBlockingDeletion({
  course,
  questionIds,
  qidsToRemove,
}: {
  course: Pick<Course, 'id' | 'path'>;
  questionIds: string[];
  qidsToRemove: Set<string>;
}): Promise<BlockedAssessment[]> {
  if (qidsToRemove.size === 0) return [];

  const refs = await selectAssessmentsReferencingQuestions({
    course_id: course.id,
    question_ids: questionIds,
  });

  const blocked: BlockedAssessment[] = [];
  for (const ref of refs) {
    const jsonPath = path.join(
      course.path,
      'courseInstances',
      ref.course_instance_short_name,
      'assessments',
      ref.assessment_directory,
      'infoAssessment.json',
    );
    let blockers: BlockedAssessment['blockers'];
    let matchedQids: string[];
    try {
      const parsed = (await fs.readJson(jsonPath)) as AssessmentJsonInput;
      ({ blockers, matchedQids } = removeQidsFromAssessment(parsed, qidsToRemove));
    } catch {
      continue;
    }
    if (blockers.length > 0) {
      blocked.push({
        assessmentId: ref.assessment_id,
        assessmentLabel: ref.assessment_label,
        assessmentColor: ref.assessment_color,
        courseInstanceId: ref.course_instance_id,
        courseInstanceShortName: ref.course_instance_short_name,
        blockers,
        affectedQids: matchedQids,
      });
    }
  }
  return blocked;
}

interface QuestionDeletionBlockers {
  /** Questions referenced by other courses' assessments. Empty when `checkOtherCourses` is false. */
  usedInOtherCourses: { id: string; qid: string }[];
  /** Assessments whose `infoAssessment.json` would become invalid. */
  blockedAssessments: BlockedAssessment[];
}

/**
 * Computes everything that should block deleting `questions` from `course`.
 * Callers decide how to surface each category (server-job failure, flash, tRPC
 * error) and in what precedence. `checkOtherCourses` lets callers skip the
 * cross-course check when sharing isn't validated at sync time (see
 * `deleteQuestions` in `trpc/course/questions.ts`).
 */
export async function getQuestionDeletionBlockers({
  course,
  questions,
  checkOtherCourses = true,
}: {
  course: Pick<Course, 'id' | 'path'>;
  questions: Pick<Question, 'id' | 'qid'>[];
  checkOtherCourses?: boolean;
}): Promise<QuestionDeletionBlockers> {
  const questionIds = questions.map((question) => question.id);

  const usedInOtherCourses = checkOtherCourses
    ? await selectQuestionsUsedInOtherCourses({ question_ids: questionIds, course_id: course.id })
    : [];

  const blockedAssessments = await selectAssessmentsBlockingDeletion({
    course,
    questionIds,
    qidsToRemove: qidsToRemoveForQuestions(questions),
  });

  return { usedInOtherCourses, blockedAssessments };
}

export function formatBlockedAssessments(blocked: BlockedAssessment[]): string {
  return blocked
    .map((a) => {
      const reasons = a.blockers.map(blockerDescription).join('; ');
      return `${a.courseInstanceShortName}: ${a.assessmentLabel} (${reasons})`;
    })
    .join(', ');
}

import * as path from 'path';

import fs from 'fs-extra';

import { type Course } from './db-types.js';
import {
  type BlockedAssessment,
  blockerDescription,
  removeQidsFromAssessment,
} from './infoAssessment-edits.js';
import { selectAssessmentDirectoriesForQuestions } from '../models/assessment.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';

/**
 * For each assessment in `course` that references one of `questionIds`, returns
 * the assessments whose `infoAssessment.json` would become invalid after the
 * deletion (e.g. losing all zones, or promoting a lockpoint zone to first).
 * Assessments whose files are unreadable are skipped — sync will surface that
 * error separately if the deletion proceeds.
 */
export async function selectAssessmentsBlockingDeletion({
  course,
  questionIds,
  qidsToRemove,
}: {
  course: Pick<Course, 'id' | 'path'>;
  questionIds: string[];
  qidsToRemove: Set<string>;
}): Promise<BlockedAssessment[]> {
  if (qidsToRemove.size === 0) return [];

  const refs = await selectAssessmentDirectoriesForQuestions({
    course_id: course.id,
    question_ids: questionIds,
  });

  const blocked: BlockedAssessment[] = [];
  for (const ref of refs) {
    const jsonPath = path.join(
      course.path,
      'courseInstances',
      ref.course_instance_directory,
      'assessments',
      ref.assessment_directory,
      'infoAssessment.json',
    );
    let parsed: AssessmentJsonInput;
    try {
      parsed = (await fs.readJson(jsonPath)) as AssessmentJsonInput;
    } catch {
      continue;
    }
    const { blockers } = removeQidsFromAssessment(parsed, qidsToRemove);
    if (blockers.length > 0) {
      blocked.push({
        assessmentLabel: ref.assessment_directory,
        courseInstanceShortName: ref.course_instance_directory,
        blockers,
      });
    }
  }
  return blocked;
}

export function formatBlockedAssessments(blocked: BlockedAssessment[]): string {
  return blocked
    .map((a) => {
      const reasons = a.blockers.map(blockerDescription).join('; ');
      return `${a.courseInstanceShortName}/${a.assessmentLabel} (${reasons})`;
    })
    .join(', ');
}

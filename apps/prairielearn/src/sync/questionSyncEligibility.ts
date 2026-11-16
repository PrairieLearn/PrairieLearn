import path from 'node:path';

import { type Course } from '../lib/db-types.js';
import { isDraftQid } from '../lib/draft-question.js';
import { collectAssessmentQids } from '../lib/infoAssessment-edits.js';
import { validateShortName } from '../lib/short-name.js';
import { selectAssessmentPathsWithSyncErrors } from '../models/assessment.js';
import { AssessmentJsonSchema } from '../schemas/infoAssessment.js';

import { loadInfoFile } from './course-db.js';

export function isQuestionQidEligibleForSync(qid: string): boolean {
  // The full loader stores QIDs in a plain object, where __proto__ sets the prototype.
  return validateShortName(qid).valid && !isDraftQid(qid) && qid !== '__proto__';
}

export async function hasErroredAssessmentsReferencingQids(
  course: Course,
  qids: ReadonlySet<string>,
): Promise<boolean> {
  const assessments = await selectAssessmentPathsWithSyncErrors(course.id);
  for (const assessment of assessments) {
    const info = await loadInfoFile({
      coursePath: course.path,
      filePath: path.join(
        'courseInstances',
        assessment.course_instance_short_name,
        'assessments',
        assessment.assessment_directory,
        'infoAssessment.json',
      ),
    });
    const parsed = AssessmentJsonSchema.safeParse(info?.data);
    if (!parsed.success) continue;
    if ([...collectAssessmentQids(parsed.data)].some((qid) => qids.has(qid))) return true;
  }
  return false;
}

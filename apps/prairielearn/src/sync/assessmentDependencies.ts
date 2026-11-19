import path from 'node:path';

import type { Course } from '../lib/db-types.js';
import { hasStaleImportedAssessmentQuestions } from '../models/assessment-question.js';
import { selectAssessmentsWithExternalDependencies } from '../models/assessment.js';
import { type AssessmentJson, AssessmentJsonSchema } from '../schemas/infoAssessment.js';

import { type CourseInstanceData, loadInfoFile } from './course-db.js';
import {
  preValidateAssessmentPreferences,
  validateAssessmentSharedQuestions,
} from './fromDisk/assessments.js';
import * as infofile from './infofile.js';

function collectImportedQuestions(assessment: AssessmentJson, assessmentId: string) {
  let number = 0;
  const imported = [];
  for (const zone of assessment.zones) {
    for (const block of zone.questions) {
      for (const question of block.alternatives ?? [block]) {
        // Full sync numbers every question, including local questions and all alternatives.
        number++;
        if (!question.id?.startsWith('@')) continue;
        imported.push({
          qid: question.id,
          assessment_id: assessmentId,
          number,
          has_split_points:
            (question.autoPoints ?? block.autoPoints) != null ||
            (question.maxAutoPoints ?? block.maxAutoPoints) != null ||
            (question.manualPoints ?? block.manualPoints) != null,
        });
      }
    }
  }
  return imported;
}

/** Requires the course lock. Validation only mutates the infofiles loaded here. */
export async function assessmentDependenciesRequireFullSync(course: Course): Promise<boolean> {
  const candidates = await selectAssessmentsWithExternalDependencies(course.id);
  const assessments: CourseInstanceData['assessments'] = {};
  const importedQuestions: ReturnType<typeof collectImportedQuestions> = [];
  for (const candidate of candidates) {
    const filePath = path.join(
      'courseInstances',
      candidate.short_name,
      'assessments',
      candidate.tid,
      'infoAssessment.json',
    );
    const loaded = await loadInfoFile<unknown>({ coursePath: course.path, filePath });
    if (!loaded?.data || infofile.hasErrors(loaded)) return true;
    const parsed = AssessmentJsonSchema.safeParse(loaded.data);
    if (!parsed.success) return true;
    const imported = collectImportedQuestions(parsed.data, candidate.id);
    if (imported.length === 0) continue;
    // Full sync must also replace development placeholders with resolved question associations.
    if (candidate.has_sync_errors || candidate.has_import_placeholders) return true;
    importedQuestions.push(...imported);
    assessments[filePath] = infofile.makeInfoFile({ data: parsed.data });
  }
  if (importedQuestions.length === 0) return false;
  const questionIds: Record<string, string> = {};
  const preferences = await validateAssessmentSharedQuestions(course.id, assessments, questionIds);
  if (importedQuestions.some(({ qid }) => !(qid in questionIds))) return true;
  preValidateAssessmentPreferences(assessments, {}, preferences);
  if (Object.values(assessments).some(infofile.hasErrors)) return true;
  return await hasStaleImportedAssessmentQuestions(
    importedQuestions.map(({ qid, ...question }) => ({
      ...question,
      question_id: questionIds[qid],
    })),
  );
}

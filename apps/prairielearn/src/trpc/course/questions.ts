import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  MAX_BULK_QUESTION_SELECTION,
  SafeQuestionsPageDataSchema,
} from '../../components/QuestionsTable.shared.js';
import { config } from '../../lib/config.js';
import type { Assessment, CourseInstance, Question } from '../../lib/db-types.js';
import { QuestionDeleteEditor, saveJsonFile } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import {
  type BlockedAssessment,
  removeQidsFromAssessment,
} from '../../lib/infoAssessment-edits.js';
import {
  formatBlockedAssessments,
  getQuestionDeletionBlockers,
  qidsToRemoveForQuestions,
} from '../../lib/question-deletion-validation.js';
import {
  selectAssessments,
  selectAssessmentsReferencingQuestions,
  selectOptionalAssessmentInCourse,
  selectZonesForAssessment,
} from '../../models/assessment.js';
import {
  selectCourseInstanceById,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';
import { selectLiveQuestionsByIdsAndCourseId } from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import type {
  AssessmentJsonInput,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJsonInput,
} from '../../schemas/infoAssessment.js';
import { throwAppError } from '../app-errors.js';

import {
  requireCoursePermissionEdit,
  requireCoursePermissionPreview,
  requireNotExampleCourse,
  t,
} from './init.js';

const list = t.procedure.use(requireCoursePermissionPreview).query(async ({ ctx }) => {
  const courseInstances = await selectCourseInstancesWithStaffAccess({
    course: ctx.course,
    authzData: ctx.authz_data,
    requiredRole: ['Previewer'],
  });

  const rawQuestions = await selectQuestionsForCourse(
    ctx.course.id,
    courseInstances.map((ci) => ci.id),
  );

  return rawQuestions.map((q) => SafeQuestionsPageDataSchema.parse(q));
});

export interface QuestionsError {
  List: never;
  ListAssessments: never;
  ListZones: never;
  PreviewDeletion: never;
  AddToAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  RemoveFromAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteQuestions:
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string }
    | { code: 'QUESTIONS_USED_IN_OTHER_COURSES'; qids: string[] }
    | { code: 'DELETION_BREAKS_ASSESSMENTS'; blockedAssessments: BlockedAssessment[] };
}

const QuestionIdsInputSchema = z.object({
  questionIds: z.array(IdSchema).min(1).max(MAX_BULK_QUESTION_SELECTION),
});

async function assertCourseInstanceBelongsToCourse({
  courseInstanceId,
  courseId,
}: {
  courseInstanceId: string;
  courseId: string;
}) {
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  if (!idsEqual(courseInstance.course_id, courseId) || courseInstance.deleted_at !== null) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid course instance' });
  }
  return courseInstance;
}

async function selectQuestionsForMutation({
  questionIds,
  courseId,
}: {
  questionIds: string[];
  courseId: string;
}) {
  const uniqueQuestionIds = [...new Set(questionIds)];
  const selectedQuestions = await selectLiveQuestionsByIdsAndCourseId({
    question_ids: uniqueQuestionIds,
    course_id: courseId,
  });
  if (selectedQuestions.length !== uniqueQuestionIds.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more selected questions are not valid for this course',
    });
  }
  return selectedQuestions;
}

async function selectAssessmentForEdit({
  assessmentId,
  courseId,
}: {
  assessmentId: string;
  courseId: string;
}): Promise<{ assessment: Assessment; courseInstance: CourseInstance }> {
  const result = await selectOptionalAssessmentInCourse({
    assessment_id: assessmentId,
    course_id: courseId,
  });
  if (!result) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid assessment' });
  }
  return { assessment: result.assessment, courseInstance: result.course_instance };
}

function assessmentInfoPath({
  coursePath,
  courseInstance,
  assessment,
}: {
  coursePath: string;
  courseInstance: CourseInstance;
  assessment: Assessment;
}): string {
  if (!assessment.tid) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Assessment directory is not available',
    });
  }
  return path.join(
    coursePath,
    'courseInstances',
    courseInstance.short_name,
    'assessments',
    assessment.tid,
    'infoAssessment.json',
  );
}

function collectQids(zones: ZoneAssessmentJsonInput[]) {
  const qids = new Set<string>();
  for (const zone of zones) {
    for (const question of zone.questions) {
      if (question.alternatives) {
        for (const alternative of question.alternatives) {
          qids.add(alternative.id);
        }
      } else if (question.id) {
        qids.add(question.id);
      }
    }
  }
  return qids;
}

function buildQuestionBlock(question: Question): ZoneQuestionBlockJsonInput {
  if (!question.qid) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more selected questions do not have a QID',
    });
  }

  if (question.grading_method === 'Manual') {
    return { id: question.qid, manualPoints: 1 };
  }
  return { id: question.qid, autoPoints: 1 };
}

const listAssessments = t.procedure
  .use(requireCoursePermissionPreview)
  .input(z.object({ courseInstanceId: IdSchema }))
  .query(async ({ input, ctx }) => {
    await assertCourseInstanceBelongsToCourse({
      courseInstanceId: input.courseInstanceId,
      courseId: ctx.course.id,
    });

    const assessments = await selectAssessments({ course_instance_id: input.courseInstanceId });
    return assessments.map((assessment) => ({
      id: assessment.id,
      label: assessment.label,
      title: assessment.title,
      type: assessment.type,
    }));
  });

const listZones = t.procedure
  .use(requireCoursePermissionPreview)
  .input(z.object({ assessmentId: IdSchema }))
  .query(async ({ input, ctx }) => {
    await selectAssessmentForEdit({
      assessmentId: input.assessmentId,
      courseId: ctx.course.id,
    });

    const zones = await selectZonesForAssessment({ assessment_id: input.assessmentId });
    return zones.map((zone) => ({
      number: zone.number,
      title: zone.title,
    }));
  });

const addToAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      assessmentId: IdSchema,
      zoneNumber: z.number().int().positive(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });
    const { assessment, courseInstance } = await selectAssessmentForEdit({
      assessmentId: input.assessmentId,
      courseId: ctx.course.id,
    });
    const jsonPath = assessmentInfoPath({
      coursePath: ctx.course.path,
      courseInstance,
      assessment,
    });

    let addedCount = 0;
    const saveResult = await saveJsonFile<AssessmentJsonInput>({
      applyChanges: (assessmentInfo) => {
        const zones = assessmentInfo.zones ?? [];
        const targetZone = zones.at(input.zoneNumber - 1);
        if (!targetZone) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid assessment zone' });
        }
        const existingQids = collectQids(zones);
        const questionsToAdd = selectedQuestions.filter(
          (question) => question.qid && !existingQids.has(question.qid),
        );
        targetZone.questions.push(...questionsToAdd.map(buildQuestionBlock));
        addedCount = questionsToAdd.length;
        return assessmentInfo;
      },
      jsonPath,
      conflictCheck: { origHash: null, scope: (json) => json.zones ?? [] },
      locals: ctx.locals,
      container: { rootPath: ctx.course.path, invalidRootPaths: [] },
    });

    if (!saveResult.success && saveResult.reason === 'sync_failed') {
      throwAppError<QuestionsError['AddToAssessment']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to add questions to assessment',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    return {
      addedCount,
      skippedCount: selectedQuestions.length - addedCount,
    };
  });

const removeFromAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      assessmentId: IdSchema,
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });
    const qidsToRemove = new Set(
      selectedQuestions.flatMap((question) => (question.qid ? [question.qid] : [])),
    );
    const { assessment, courseInstance } = await selectAssessmentForEdit({
      assessmentId: input.assessmentId,
      courseId: ctx.course.id,
    });
    const jsonPath = assessmentInfoPath({
      coursePath: ctx.course.path,
      courseInstance,
      assessment,
    });

    let removedCount = 0;
    const saveResult = await saveJsonFile<AssessmentJsonInput>({
      applyChanges: (assessmentInfo) => {
        const result = removeQidsFromAssessment(assessmentInfo, qidsToRemove);
        if (result.emptiedZones.length > 0) {
          const zoneList = result.emptiedZones
            .map((zone) => (zone.zoneTitle ? `"${zone.zoneTitle}"` : `zone ${zone.zoneIndex + 1}`))
            .join(', ');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot remove questions because it would leave ${result.emptiedZones.length === 1 ? 'a zone' : 'zones'} empty (${zoneList}). Add another question to ${result.emptiedZones.length === 1 ? 'that zone' : 'those zones'} or delete ${result.emptiedZones.length === 1 ? 'it' : 'them'} from the assessment first.`,
          });
        }
        removedCount = result.removedCount;
        return result.assessment;
      },
      jsonPath,
      conflictCheck: { origHash: null, scope: (json) => json.zones ?? [] },
      locals: ctx.locals,
      container: { rootPath: ctx.course.path, invalidRootPaths: [] },
    });

    if (!saveResult.success && saveResult.reason === 'sync_failed') {
      throwAppError<QuestionsError['RemoveFromAssessment']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to remove questions from assessment',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    return { removedCount };
  });

/**
 * For each (assessment, zone) that references one of the selected questions,
 * returns the QIDs that would be removed from that zone and whether the zone
 * would become empty if the deletion proceeded. Used by the bulk-delete modal
 * to warn the user about zones that will be dropped along with the questions.
 *
 * Reads each referencing `infoAssessment.json` so the empty-zone calculation
 * uses the same logic the editor will apply. Files that fail to read are
 * skipped (the editor will surface the same error during sync).
 */
const previewDeletion = t.procedure
  .use(requireCoursePermissionPreview)
  .input(QuestionIdsInputSchema)
  .query(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });
    const qidsToRemove = qidsToRemoveForQuestions(selectedQuestions);
    if (qidsToRemove.size === 0) return { zones: [] };

    const refs = await selectAssessmentsReferencingQuestions({
      course_id: ctx.course.id,
      question_ids: selectedQuestions.map((q) => q.id),
    });

    const zones: {
      assessmentId: string;
      assessmentLabel: string;
      assessmentColor: string;
      assessmentSetAbbreviation: string;
      assessmentSetName: string;
      assessmentNumber: string;
      courseInstanceId: string;
      courseInstanceShortName: string;
      zoneIndex: number;
      zoneTitle: string | null;
      affectedQids: string[];
      wouldBeEmpty: boolean;
    }[] = [];

    for (const ref of refs) {
      const jsonPath = path.join(
        ctx.course.path,
        'courseInstances',
        ref.course_instance_short_name,
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

      const { emptiedZones } = removeQidsFromAssessment(parsed, qidsToRemove);
      const emptiedIndices = new Set(emptiedZones.map((z) => z.zoneIndex));

      for (const [zoneIndex, zone] of (parsed.zones ?? []).entries()) {
        const affectedQids: string[] = [];
        for (const block of zone.questions) {
          if (block.alternatives) {
            for (const alternative of block.alternatives) {
              if (qidsToRemove.has(alternative.id)) affectedQids.push(alternative.id);
            }
          } else if (block.id && qidsToRemove.has(block.id)) {
            affectedQids.push(block.id);
          }
        }
        if (affectedQids.length === 0) continue;
        zones.push({
          assessmentId: ref.assessment_id,
          assessmentLabel: ref.assessment_label,
          assessmentColor: ref.assessment_color,
          assessmentSetAbbreviation: ref.assessment_set_abbreviation,
          assessmentSetName: ref.assessment_set_name,
          assessmentNumber: ref.assessment_number,
          courseInstanceId: ref.course_instance_id,
          courseInstanceShortName: ref.course_instance_short_name,
          zoneIndex,
          zoneTitle: zone.title ?? null,
          affectedQids,
          wouldBeEmpty: emptiedIndices.has(zoneIndex),
        });
      }
    }

    return { zones };
  });

const deleteQuestions = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(QuestionIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });

    // Mirrors the gating in `checkSharingConfigurationValid` (sync/syncFromDisk.ts):
    // if sharing isn't being validated at sync time, the sync won't block a
    // cross-course consumer's broken reference either, so don't block deletion here.
    const sharingEnabled =
      config.checkSharingOnSync &&
      (await features.enabled('question-sharing', {
        course_id: ctx.course.id,
        institution_id: ctx.course.institution_id,
      }));

    const { usedInOtherCourses, blockedAssessments } = await getQuestionDeletionBlockers({
      course: ctx.course,
      questions: selectedQuestions,
      checkOtherCourses: sharingEnabled,
    });

    if (usedInOtherCourses.length > 0) {
      throwAppError<QuestionsError['DeleteQuestions']>({
        code: 'QUESTIONS_USED_IN_OTHER_COURSES',
        message:
          usedInOtherCourses.length === 1
            ? 'One selected question is used by another course and cannot be deleted.'
            : `${usedInOtherCourses.length} selected questions are used by other courses and cannot be deleted.`,
        qids: usedInOtherCourses.map((q) => q.qid),
      });
    }

    if (blockedAssessments.length > 0) {
      throwAppError<QuestionsError['DeleteQuestions']>({
        code: 'DELETION_BREAKS_ASSESSMENTS',
        message: `Deletion would leave ${blockedAssessments.length === 1 ? 'an assessment' : `${blockedAssessments.length} assessments`} in an invalid state: ${formatBlockedAssessments(blockedAssessments)}`,
        blockedAssessments,
      });
    }

    const editor = new QuestionDeleteEditor({
      locals: ctx.locals,
      questions: selectedQuestions,
    });

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<QuestionsError['DeleteQuestions']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to delete questions',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    return { deletedCount: selectedQuestions.length };
  });

export const questionsRouter = t.router({
  list,
  listAssessments,
  listZones,
  addToAssessment,
  removeFromAssessment,
  previewDeletion,
  deleteQuestions,
});

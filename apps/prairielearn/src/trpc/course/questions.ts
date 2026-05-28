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
import { QuestionDeleteEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { removeQidsFromAssessment } from '../../lib/infoAssessment-edits.js';
import { selectAssessmentsReferencingQuestions } from '../../models/assessment.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import {
  selectLiveQuestionsByIdsAndCourseId,
  selectQuestionsUsedInOtherCourses,
} from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';
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
  PreviewDeletion: never;
  DeleteQuestions:
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string }
    | { code: 'QUESTIONS_USED_IN_OTHER_COURSES'; qids: string[] };
}

const QuestionIdsInputSchema = z.object({
  questionIds: z.array(IdSchema).min(1).max(MAX_BULK_QUESTION_SELECTION),
});

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
    const qidsToRemove = new Set(
      selectedQuestions.flatMap((question) => (question.qid ? [question.qid] : [])),
    );
    if (qidsToRemove.size === 0) return { zones: [] };

    const refs = await selectAssessmentsReferencingQuestions({
      course_id: ctx.course.id,
      question_ids: selectedQuestions.map((q) => q.id),
    });

    const zones: {
      assessmentId: string;
      assessmentLabel: string;
      assessmentColor: string;
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

    if (sharingEnabled) {
      const blockedByOtherCourses = await selectQuestionsUsedInOtherCourses({
        question_ids: selectedQuestions.map((q) => q.id),
        course_id: ctx.course.id,
      });
      if (blockedByOtherCourses.length > 0) {
        throwAppError<QuestionsError['DeleteQuestions']>({
          code: 'QUESTIONS_USED_IN_OTHER_COURSES',
          message:
            blockedByOtherCourses.length === 1
              ? 'One selected question is used by another course and cannot be deleted.'
              : `${blockedByOtherCourses.length} selected questions are used by other courses and cannot be deleted.`,
          qids: blockedByOtherCourses.map((q) => q.qid),
        });
      }
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
  previewDeletion,
  deleteQuestions,
});

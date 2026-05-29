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
import {
  type FileModifyEditor,
  MultiEditor,
  QuestionDeleteEditor,
  prepareJsonFileEditor,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { removeQidsFromAssessment } from '../../lib/infoAssessment-edits.js';
import {
  qidsToRemoveForQuestions,
  selectQuestionsBlockingDeletion,
} from '../../lib/question-deletion-validation.js';
import {
  selectAssessmentReferencedQuestionCounts,
  selectAssessments,
  selectAssessmentsReferencingQuestions,
  selectOptionalAssessmentInCourse,
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
  PreviewDeletion: never;
  AddToAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  RemoveFromAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteQuestions:
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string }
    | { code: 'QUESTIONS_USED_IN_OTHER_COURSES'; qids: string[] };
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
  .input(QuestionIdsInputSchema.extend({ courseInstanceId: IdSchema }))
  .query(async ({ input, ctx }) => {
    await assertCourseInstanceBelongsToCourse({
      courseInstanceId: input.courseInstanceId,
      courseId: ctx.course.id,
    });

    const uniqueQuestionIds = [...new Set(input.questionIds)];
    const [assessments, referencedCounts] = await Promise.all([
      selectAssessments({ course_instance_id: input.courseInstanceId }),
      selectAssessmentReferencedQuestionCounts({
        course_instance_id: input.courseInstanceId,
        question_ids: uniqueQuestionIds,
      }),
    ]);
    const referencedCountById = new Map(
      referencedCounts.map((row) => [row.assessment_id, row.referenced_count]),
    );
    return assessments.map((assessment) => {
      const referencedCount = referencedCountById.get(assessment.id) ?? 0;
      return {
        id: assessment.id,
        label: assessment.label,
        title: assessment.title,
        type: assessment.type,
        referencedCount,
        allQuestionsPresent: referencedCount >= uniqueQuestionIds.length,
        set: {
          id: assessment.assessment_set.id,
          name: assessment.assessment_set.name,
          heading: assessment.assessment_set.heading,
          implicit: assessment.assessment_set.implicit,
          abbreviation: assessment.assessment_set.abbreviation,
          color: assessment.assessment_set.color,
          number: assessment.assessment_set.number,
        },
      };
    });
  });

const addToAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      assessmentIds: z.array(IdSchema).min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });

    const results: { assessmentId: string; addedCount: number; skippedCount: number }[] = [];
    // Each assessment's edit is prepared but not executed, so the whole batch
    // commits and syncs once via the MultiEditor below.
    const editors: FileModifyEditor[] = [];

    for (const assessmentId of new Set(input.assessmentIds)) {
      const { assessment, courseInstance } = await selectAssessmentForEdit({
        assessmentId,
        courseId: ctx.course.id,
      });
      const jsonPath = assessmentInfoPath({
        coursePath: ctx.course.path,
        courseInstance,
        assessment,
      });

      let addedCount = 0;
      const prepared = await prepareJsonFileEditor<AssessmentJsonInput>({
        applyChanges: (assessmentInfo) => {
          const zones = assessmentInfo.zones ?? [];
          const existingQids = collectQids(zones);
          const questionsToAdd = selectedQuestions.filter(
            (question) => question.qid && !existingQids.has(question.qid),
          );
          if (questionsToAdd.length > 0) {
            zones.push({ questions: questionsToAdd.map(buildQuestionBlock) });
            assessmentInfo.zones = zones;
          }
          addedCount = questionsToAdd.length;
          return assessmentInfo;
        },
        jsonPath,
        conflictCheck: { origHash: null, scope: (json) => json.zones ?? [] },
        locals: ctx.locals,
        container: { rootPath: ctx.course.path, invalidRootPaths: [] },
      });

      // `origHash` is null, so `prepared` is always a success; only bundle an
      // editor when the file actually changed.
      if (prepared.success && addedCount > 0) {
        editors.push(prepared.editor);
      }
      results.push({
        assessmentId,
        addedCount,
        skippedCount: selectedQuestions.length - addedCount,
      });
    }

    const addedAssessmentCount = editors.length;
    if (addedAssessmentCount > 0) {
      const editor = new MultiEditor(
        {
          locals: ctx.locals,
          description: `Add questions to ${addedAssessmentCount} ${addedAssessmentCount === 1 ? 'assessment' : 'assessments'}`,
        },
        editors,
      );
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        throwAppError<QuestionsError['AddToAssessment']>({
          code: 'SYNC_JOB_FAILED',
          message: 'Failed to add questions to assessments',
          jobSequenceId: serverJob.jobSequenceId,
        });
      }
    }

    return { results, addedAssessmentCount };
  });

const removeFromAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      assessmentIds: z.array(IdSchema).min(1),
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

    const results: { assessmentId: string; removedCount: number; skippedCount: number }[] = [];
    // Each assessment's edit is prepared but not executed, so the whole batch
    // commits and syncs once via the MultiEditor below.
    const editors: FileModifyEditor[] = [];

    for (const assessmentId of new Set(input.assessmentIds)) {
      const { assessment, courseInstance } = await selectAssessmentForEdit({
        assessmentId,
        courseId: ctx.course.id,
      });
      const jsonPath = assessmentInfoPath({
        coursePath: ctx.course.path,
        courseInstance,
        assessment,
      });

      let removedCount = 0;
      const prepared = await prepareJsonFileEditor<AssessmentJsonInput>({
        applyChanges: (assessmentInfo) => {
          const result = removeQidsFromAssessment(assessmentInfo, qidsToRemove);
          removedCount = result.matchedQids.length;
          return result.assessment;
        },
        jsonPath,
        conflictCheck: { origHash: null, scope: (json) => json.zones ?? [] },
        locals: ctx.locals,
        container: { rootPath: ctx.course.path, invalidRootPaths: [] },
      });

      // `origHash` is null, so `prepared` is always a success; only bundle an
      // editor when the file actually changed.
      if (prepared.success && removedCount > 0) {
        editors.push(prepared.editor);
      }
      results.push({
        assessmentId,
        removedCount,
        skippedCount: selectedQuestions.length - removedCount,
      });
    }

    const removedAssessmentCount = editors.length;
    if (removedAssessmentCount > 0) {
      const editor = new MultiEditor(
        {
          locals: ctx.locals,
          description: `Remove questions from ${removedAssessmentCount} ${removedAssessmentCount === 1 ? 'assessment' : 'assessments'}`,
        },
        editors,
      );
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        throwAppError<QuestionsError['RemoveFromAssessment']>({
          code: 'SYNC_JOB_FAILED',
          message: 'Failed to remove questions from assessments',
          jobSequenceId: serverJob.jobSequenceId,
        });
      }
    }

    return { results, removedAssessmentCount };
  });

/**
 * For each (assessment, zone) that references one of the selected questions,
 * returns the QIDs that would be removed from that zone and whether the zone
 * would become empty if the deletion proceeded, plus a total count of zone
 * lockpoints that would be moved or removed. Used by the bulk-delete modal to
 * warn the user about zones and lockpoints affected along with the questions.
 *
 * Reads each referencing `infoAssessment.json` so the calculation uses the same
 * logic the editor will apply. Files that fail to read are skipped (the editor
 * will surface the same error during sync).
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
    if (qidsToRemove.size === 0) return { zones: [], lockpointsMovedOrRemoved: 0 };

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
    let lockpointsMovedOrRemoved = 0;

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

      const { emptiedZones, lockpointsMovedOrRemoved: lockpoints } = removeQidsFromAssessment(
        parsed,
        qidsToRemove,
      );
      lockpointsMovedOrRemoved += lockpoints;
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

    return { zones, lockpointsMovedOrRemoved };
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

    const usedInOtherCourses = await selectQuestionsBlockingDeletion({
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
  addToAssessment,
  removeFromAssessment,
  previewDeletion,
  deleteQuestions,
});

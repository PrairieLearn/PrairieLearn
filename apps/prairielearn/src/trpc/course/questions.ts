import * as path from 'path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  MAX_BULK_QUESTION_SELECTION,
  SafeQuestionsPageDataSchema,
} from '../../components/QuestionsTable.shared.js';
import type { Question } from '../../lib/db-types.js';
import { QuestionDeleteEditor, saveJsonFile } from '../../lib/editors.js';
import { idsEqual } from '../../lib/id.js';
import {
  selectAssessmentById,
  selectAssessments,
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
  AddToAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  RemoveFromAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteQuestions: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

const QuestionIdsInputSchema = z.object({
  questionIds: z.array(IdSchema).min(1).max(MAX_BULK_QUESTION_SELECTION),
});

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function assertNonDeletedTarget({ deletedAt, label }: { deletedAt: Date | null; label: string }) {
  if (deletedAt !== null) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${label} is deleted` });
  }
}

async function assertCourseInstanceBelongsToCourse({
  courseInstanceId,
  courseId,
}: {
  courseInstanceId: string;
  courseId: string;
}) {
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  if (!idsEqual(courseInstance.course_id, courseId)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid course instance' });
  }
  assertNonDeletedTarget({ deletedAt: courseInstance.deleted_at, label: 'Course instance' });
  return courseInstance;
}

async function selectQuestionsForMutation({
  questionIds,
  courseId,
}: {
  questionIds: string[];
  courseId: string;
}) {
  const uniqueQuestionIds = uniqueIds(questionIds);
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

  const questionById = new Map(selectedQuestions.map((question) => [question.id, question]));
  return uniqueQuestionIds.map((id) => questionById.get(id)!);
}

async function resolveAssessmentInfoPath({
  assessmentId,
  courseId,
  coursePath,
}: {
  assessmentId: string;
  courseId: string;
  coursePath: string;
}): Promise<string> {
  const assessment = await selectAssessmentById(assessmentId);
  assertNonDeletedTarget({ deletedAt: assessment.deleted_at, label: 'Assessment' });
  const courseInstance = await assertCourseInstanceBelongsToCourse({
    courseInstanceId: assessment.course_instance_id,
    courseId,
  });

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

function removeQidsFromBlock(
  question: ZoneQuestionBlockJsonInput,
  qidsToRemove: Set<string>,
): { question: ZoneQuestionBlockJsonInput | null; removedCount: number } {
  if (question.alternatives) {
    const alternatives = question.alternatives.filter((alternative) => {
      return !qidsToRemove.has(alternative.id);
    });
    return {
      question: alternatives.length > 0 ? { ...question, alternatives } : null,
      removedCount: question.alternatives.length - alternatives.length,
    };
  }

  if (question.id && qidsToRemove.has(question.id)) {
    return { question: null, removedCount: 1 };
  }
  return { question, removedCount: 0 };
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
    const assessment = await selectAssessmentById(input.assessmentId);
    assertNonDeletedTarget({ deletedAt: assessment.deleted_at, label: 'Assessment' });
    await assertCourseInstanceBelongsToCourse({
      courseInstanceId: assessment.course_instance_id,
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
    const assessmentInfoPath = await resolveAssessmentInfoPath({
      assessmentId: input.assessmentId,
      courseId: ctx.course.id,
      coursePath: ctx.course.path,
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
      jsonPath: assessmentInfoPath,
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
    const assessmentInfoPath = await resolveAssessmentInfoPath({
      assessmentId: input.assessmentId,
      courseId: ctx.course.id,
      coursePath: ctx.course.path,
    });

    let removedCount = 0;
    const saveResult = await saveJsonFile<AssessmentJsonInput>({
      applyChanges: (assessmentInfo) => {
        for (const zone of assessmentInfo.zones ?? []) {
          const nextQuestions: ZoneQuestionBlockJsonInput[] = [];
          for (const question of zone.questions) {
            const result = removeQidsFromBlock(question, qidsToRemove);
            removedCount += result.removedCount;
            if (result.question) {
              nextQuestions.push(result.question);
            }
          }
          if (zone.questions.length > 0 && nextQuestions.length === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove questions because it would leave an empty zone',
            });
          }
          zone.questions = nextQuestions;
        }
        return assessmentInfo;
      },
      jsonPath: assessmentInfoPath,
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

const deleteQuestions = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(QuestionIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    const selectedQuestions = await selectQuestionsForMutation({
      questionIds: input.questionIds,
      courseId: ctx.course.id,
    });

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

    return {
      deletedCount: selectedQuestions.length,
      jobSequenceId: serverJob.jobSequenceId,
    };
  });

export const questionsRouter = t.router({
  list,
  listAssessments,
  listZones,
  addToAssessment,
  removeFromAssessment,
  deleteQuestions,
});

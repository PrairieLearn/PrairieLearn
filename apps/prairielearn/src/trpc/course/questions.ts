import path from 'node:path';

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
import { getAssessmentInfoJsonPath } from '../../lib/editorUtil.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  type FileModifyEditor,
  MultiEditor,
  QuestionDeleteEditor,
  prepareJsonFileEditor,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { collectAssessmentQids, removeQidsFromAssessment } from '../../lib/infoAssessment-edits.js';
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
  selectCourseInstancesWithStaffAccess,
  selectOptionalCourseInstanceById,
} from '../../models/course-instances.js';
import { selectLiveQuestionsByIdsAndCourseId } from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import { selectTagsByCourseId } from '../../models/tags.js';
import { selectTopicsByCourseId } from '../../models/topics.js';
import type { AssessmentForPicker } from '../../pages/instructorAssessmentQuestions/types.js';
import type {
  AssessmentJsonInput,
  ZoneQuestionBlockJsonInput,
} from '../../schemas/infoAssessment.js';
import type { QuestionJsonInput } from '../../schemas/infoQuestion.js';
import { throwAppError } from '../app-errors.js';

import {
  type TRPCContext,
  requireCoursePermissionEdit,
  requireCoursePermissionPreview,
  requireNotExampleCourse,
  t,
} from './init.js';

const list = t.procedure.use(requireCoursePermissionPreview).query(async ({ ctx }) => {
  const courseInstances = await selectCourseInstancesWithStaffAccess({
    course: ctx.course,
    authzData: ctx.authz_data,
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
  ChangeTopic:
    | { code: 'INVALID_TOPIC'; topic: string }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  AddTags:
    | { code: 'INVALID_TAGS'; tags: string[] }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  RemoveTags:
    | { code: 'INVALID_TAGS'; tags: string[] }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
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
  const courseInstance = await selectOptionalCourseInstanceById(courseInstanceId);
  if (
    courseInstance === null ||
    !idsEqual(courseInstance.course_id, courseId) ||
    courseInstance.deleted_at !== null
  ) {
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

async function mutateQuestionInfoFiles({
  ctx,
  selectedQuestions,
  describe,
  syncFailureMessage,
  apply,
}: {
  ctx: TRPCContext;
  selectedQuestions: Question[];
  describe: (changedCount: number) => string;
  syncFailureMessage: string;
  apply: (questionInfo: QuestionJsonInput) => {
    questionInfo: QuestionJsonInput;
    changed: boolean;
  };
}) {
  const results: { questionId: string; changed: boolean }[] = [];
  const editors: FileModifyEditor[] = [];

  for (const question of selectedQuestions) {
    const questionDirectory = z.string().parse(question.directory ?? question.qid);

    const infoPath = path.join(ctx.course.path, 'questions', questionDirectory, 'info.json');
    let changedCount = 0;

    const prepared = await prepareJsonFileEditor<QuestionJsonInput>({
      applyChanges: (questionInfo) => {
        const applied = apply(questionInfo);
        if (applied.changed) changedCount += 1;
        return applied.questionInfo;
      },
      jsonPath: infoPath,
      // This edit is initiated from a bulk action, not from an open file hash.
      conflictCheck: { origHash: null, scope: (json) => ({ topic: json.topic, tags: json.tags }) },
      locals: ctx.locals,
      container: { rootPath: ctx.course.path, invalidRootPaths: [] },
    });

    if (!prepared.success) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Failed to update one or more selected questions due to a file conflict',
      });
    }

    if (changedCount > 0) editors.push(prepared.editor);
    results.push({ questionId: question.id, changed: changedCount > 0 });
  }

  const totalChangedCount = editors.length;
  if (totalChangedCount > 0) {
    const editor = new MultiEditor(
      { locals: ctx.locals, description: describe(totalChangedCount) },
      editors,
    );
    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<
        QuestionsError['ChangeTopic'] | QuestionsError['AddTags'] | QuestionsError['RemoveTags']
      >({
        code: 'SYNC_JOB_FAILED',
        message: syncFailureMessage,
        jobSequenceId: serverJob.jobSequenceId,
      });
    }
  }

  return {
    changedCount: totalChangedCount,
    unchangedCount: selectedQuestions.length - totalChangedCount,
    results,
  };
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

/**
 * Prepares and commits a batch of `infoAssessment.json` edits — one per
 * assessment in `assessmentIds` — under a single `MultiEditor` so they sync
 * atomically. `apply` mutates one assessment's JSON and reports how many of the
 * selected questions it changed; an assessment whose file is unchanged is left
 * out of the batch. Used by both the add-to-assessment and
 * remove-from-assessment mutations, which differ only in `apply`.
 */
async function mutateAssessmentMembership({
  ctx,
  assessmentIds,
  selectedCount,
  apply,
  describe,
  syncFailureMessage,
}: {
  ctx: TRPCContext;
  assessmentIds: string[];
  selectedCount: number;
  apply: (assessmentInfo: AssessmentJsonInput) => {
    assessment: AssessmentJsonInput;
    changedCount: number;
  };
  describe: (affectedAssessmentCount: number) => string;
  syncFailureMessage: string;
}) {
  // Each assessment's edit is prepared (but not executed) independently, then
  // the whole batch commits and syncs once via the MultiEditor below.
  const results: { assessmentId: string; changedCount: number; skippedCount: number }[] = [];
  const editors: FileModifyEditor[] = [];

  for (const assessmentId of new Set(assessmentIds)) {
    const { assessment, courseInstance } = await selectAssessmentForEdit({
      assessmentId,
      courseId: ctx.course.id,
    });
    const jsonPath = getAssessmentInfoJsonPath({
      course: ctx.course,
      course_instance: courseInstance,
      assessment,
    });

    let changedCount = 0;
    const result = await prepareJsonFileEditor<AssessmentJsonInput>({
      applyChanges: (assessmentInfo) => {
        const applied = apply(assessmentInfo);
        changedCount = applied.changedCount;
        return applied.assessment;
      },
      jsonPath,
      conflictCheck: { origHash: null, scope: (json) => json.zones ?? [] },
      locals: ctx.locals,
      container: { rootPath: ctx.course.path, invalidRootPaths: [] },
    });

    // `origHash` is null, so `result` is always a success; only bundle an
    // editor when the file actually changed.
    if (result.success && changedCount > 0) editors.push(result.editor);
    results.push({ assessmentId, changedCount, skippedCount: selectedCount - changedCount });
  }

  const affectedAssessmentCount = editors.length;

  if (affectedAssessmentCount > 0) {
    const editor = new MultiEditor(
      { locals: ctx.locals, description: describe(affectedAssessmentCount) },
      editors,
    );
    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<QuestionsError['AddToAssessment'] | QuestionsError['RemoveFromAssessment']>({
        code: 'SYNC_JOB_FAILED',
        message: syncFailureMessage,
        jobSequenceId: serverJob.jobSequenceId,
      });
    }
  }

  return { results, affectedAssessmentCount };
}

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

    return mutateAssessmentMembership({
      ctx,
      assessmentIds: input.assessmentIds,
      selectedCount: selectedQuestions.length,
      describe: (count) =>
        `Add questions to ${count} ${count === 1 ? 'assessment' : 'assessments'}`,
      syncFailureMessage: 'Failed to add questions to assessments',
      apply: (assessmentInfo) => {
        const zones = assessmentInfo.zones ?? [];
        const existingQids = collectAssessmentQids(assessmentInfo);
        const questionsToAdd = selectedQuestions.filter(
          (question) => question.qid && !existingQids.has(question.qid),
        );
        if (questionsToAdd.length > 0) {
          zones.push({ questions: questionsToAdd.map(buildQuestionBlock) });
          assessmentInfo.zones = zones;
        }
        return { assessment: assessmentInfo, changedCount: questionsToAdd.length };
      },
    });
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
    const qidsToRemove = qidsToRemoveForQuestions(selectedQuestions);

    return mutateAssessmentMembership({
      ctx,
      assessmentIds: input.assessmentIds,
      selectedCount: selectedQuestions.length,
      describe: (count) =>
        `Remove questions from ${count} ${count === 1 ? 'assessment' : 'assessments'}`,
      syncFailureMessage: 'Failed to remove questions from assessments',
      apply: (assessmentInfo) => {
        const result = removeQidsFromAssessment(assessmentInfo, qidsToRemove);
        return { assessment: result.assessment, changedCount: result.matchedQids.length };
      },
    });
  });

const changeTopic = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      topic: z.string().min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const [selectedQuestions, courseTopics] = await Promise.all([
      selectQuestionsForMutation({ questionIds: input.questionIds, courseId: ctx.course.id }),
      selectTopicsByCourseId(ctx.course.id),
    ]);
    const topicNames = new Set(courseTopics.map((topic) => topic.name));
    if (!topicNames.has(input.topic)) {
      throwAppError<QuestionsError['ChangeTopic']>({
        code: 'INVALID_TOPIC',
        message: `Invalid topic: ${input.topic}`,
        topic: input.topic,
      });
    }

    return mutateQuestionInfoFiles({
      ctx,
      selectedQuestions,
      describe: (changedCount) =>
        `Change topic to ${input.topic} for ${changedCount} ${changedCount === 1 ? 'question' : 'questions'}`,
      syncFailureMessage: 'Failed to change question topic',
      apply: (questionInfo) => {
        const changed = questionInfo.topic !== input.topic;
        questionInfo.topic = input.topic;
        return { questionInfo, changed };
      },
    });
  });

const addTags = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      tags: z.array(z.string().min(1)).min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const [selectedQuestions, courseTags] = await Promise.all([
      selectQuestionsForMutation({ questionIds: input.questionIds, courseId: ctx.course.id }),
      selectTagsByCourseId(ctx.course.id),
    ]);

    const validTags = new Set(courseTags.map((tag) => tag.name));
    const requestedTags = [...new Set(input.tags)];
    const invalidTags = requestedTags.filter((tag) => !validTags.has(tag));
    if (invalidTags.length > 0) {
      throwAppError<QuestionsError['AddTags']>({
        code: 'INVALID_TAGS',
        message: `Invalid tags: ${invalidTags.join(', ')}`,
        tags: invalidTags,
      });
    }

    return mutateQuestionInfoFiles({
      ctx,
      selectedQuestions,
      describe: (changedCount) =>
        `Add tags to ${changedCount} ${changedCount === 1 ? 'question' : 'questions'}`,
      syncFailureMessage: 'Failed to add tags to questions',
      apply: (questionInfo) => {
        const existingTags = questionInfo.tags ?? [];
        const nextTags = [...new Set([...existingTags, ...requestedTags])];
        const changed = nextTags.length !== existingTags.length;
        questionInfo.tags = propertyValueWithDefault(
          questionInfo.tags,
          nextTags,
          (val: string[] | undefined) => !val || val.length === 0,
        );
        return { questionInfo, changed };
      },
    });
  });

const removeTags = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    QuestionIdsInputSchema.extend({
      tags: z.array(z.string().min(1)).min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const [selectedQuestions, courseTags] = await Promise.all([
      selectQuestionsForMutation({ questionIds: input.questionIds, courseId: ctx.course.id }),
      selectTagsByCourseId(ctx.course.id),
    ]);

    const validTags = new Set(courseTags.map((tag) => tag.name));
    const requestedTags = [...new Set(input.tags)];
    const invalidTags = requestedTags.filter((tag) => !validTags.has(tag));
    if (invalidTags.length > 0) {
      throwAppError<QuestionsError['RemoveTags']>({
        code: 'INVALID_TAGS',
        message: `Invalid tags: ${invalidTags.join(', ')}`,
        tags: invalidTags,
      });
    }

    return mutateQuestionInfoFiles({
      ctx,
      selectedQuestions,
      describe: (changedCount) =>
        `Remove tags from ${changedCount} ${changedCount === 1 ? 'question' : 'questions'}`,
      syncFailureMessage: 'Failed to remove tags from questions',
      apply: (questionInfo) => {
        const existingTags = questionInfo.tags ?? [];
        const nextTags = existingTags.filter((tag) => !requestedTags.includes(tag));
        const changed = nextTags.length !== existingTags.length;
        questionInfo.tags = propertyValueWithDefault(
          questionInfo.tags,
          nextTags,
          (val: string[] | undefined) => !val || val.length === 0,
        );
        return { questionInfo, changed };
      },
    });
  });

type AssessmentRef = Awaited<ReturnType<typeof selectAssessmentsReferencingQuestions>>[number];

function refToAssessmentForPicker(ref: AssessmentRef): AssessmentForPicker {
  return {
    assessment_id: ref.assessment_id,
    label: ref.assessment_label,
    // An assessment's badge color is its set's color, so the same value
    // populates both color fields the picker reads.
    color: ref.assessment_color,
    assessment_set_color: ref.assessment_color,
    assessment_set_abbreviation: ref.assessment_set_abbreviation,
    assessment_set_name: ref.assessment_set_name,
    assessment_number: ref.assessment_number,
  };
}

interface MembershipAssessment {
  assessment: AssessmentForPicker;
  /** Whether deleting the selected questions would empty a zone in this assessment. */
  wouldEmpty: boolean;
}

interface MembershipCourseInstance {
  courseInstanceId: string;
  courseInstanceShortName: string;
  /** Keyed by assessment id so an assessment referenced from several zones is recorded once. */
  assessments: Map<string, MembershipAssessment>;
}

/**
 * Computes what would change if the selected questions were deleted: which
 * zones lose references, which would be emptied, and how many lockpoints move
 * or drop. Reads each referencing `infoAssessment.json` and reuses the canonical
 * `removeQidsFromAssessment` traversal, so the preview matches what the editor
 * will apply. Files that fail to read are skipped (the editor will surface the
 * same error during sync).
 *
 * Returns, for each affected QID, the course instances and assessments that
 * reference it (flagging assessments whose zones would be emptied), plus the
 * aggregate counts the bulk-delete modal summarizes.
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

    // qid -> course instance id -> course instance (with its referencing assessments).
    const membershipsByQid = new Map<string, Map<string, MembershipCourseInstance>>();
    const affectedAssessmentIds = new Set<string>();
    let emptiedZoneCount = 0;
    let lockpointsMovedOrRemoved = 0;

    const refs =
      qidsToRemove.size === 0
        ? []
        : await selectAssessmentsReferencingQuestions({
            course_id: ctx.course.id,
            question_ids: selectedQuestions.map((q) => q.id),
          });

    for (const ref of refs) {
      const jsonPath = getAssessmentInfoJsonPath({
        course: ctx.course,
        course_instance: { short_name: ref.course_instance_short_name },
        assessment: { tid: ref.assessment_directory },
      });
      // Fail closed: a file we can't read or parse here would also break the
      // actual deletion, so let the error propagate rather than silently
      // undercounting affected assessments in the preview.
      const parsed = (await fs.readJson(jsonPath)) as AssessmentJsonInput;
      const { affectedZones, lockpointsMovedOrRemoved: lockpoints } = removeQidsFromAssessment(
        parsed,
        qidsToRemove,
      );
      lockpointsMovedOrRemoved += lockpoints;
      if (affectedZones.length > 0) affectedAssessmentIds.add(ref.assessment_id);

      for (const zone of affectedZones) {
        if (zone.wouldBeEmpty) emptiedZoneCount += 1;
        for (const qid of zone.affectedQids) {
          let perCourseInstance = membershipsByQid.get(qid);
          if (!perCourseInstance) {
            perCourseInstance = new Map();
            membershipsByQid.set(qid, perCourseInstance);
          }
          let courseInstance = perCourseInstance.get(ref.course_instance_id);
          if (!courseInstance) {
            courseInstance = {
              courseInstanceId: ref.course_instance_id,
              courseInstanceShortName: ref.course_instance_short_name,
              assessments: new Map(),
            };
            perCourseInstance.set(ref.course_instance_id, courseInstance);
          }
          const assessment = courseInstance.assessments.get(ref.assessment_id);
          if (assessment) {
            assessment.wouldEmpty ||= zone.wouldBeEmpty;
          } else {
            courseInstance.assessments.set(ref.assessment_id, {
              assessment: refToAssessmentForPicker(ref),
              wouldEmpty: zone.wouldBeEmpty,
            });
          }
        }
      }
    }

    const collator = new Intl.Collator(undefined, { numeric: true });
    const questionMemberships = [...membershipsByQid].map(([qid, perCourseInstance]) => ({
      qid,
      courseInstances: [...perCourseInstance.values()]
        .sort((a, b) => collator.compare(a.courseInstanceShortName, b.courseInstanceShortName))
        .map((courseInstance) => {
          const assessments = [...courseInstance.assessments.values()].sort((a, b) =>
            collator.compare(a.assessment.label, b.assessment.label),
          );
          return {
            courseInstanceId: courseInstance.courseInstanceId,
            courseInstanceShortName: courseInstance.courseInstanceShortName,
            assessments: assessments.map((a) => a.assessment),
            emptiedAssessmentIds: assessments
              .filter((a) => a.wouldEmpty)
              .map((a) => a.assessment.assessment_id),
          };
        }),
    }));

    return {
      questionMemberships,
      affectedAssessmentCount: affectedAssessmentIds.size,
      emptiedZoneCount,
      lockpointsMovedOrRemoved,
    };
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
  changeTopic,
  addTags,
  removeTags,
  previewDeletion,
  deleteQuestions,
});

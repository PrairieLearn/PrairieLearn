import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { run } from '@prairielearn/run';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getOriginalHash } from '../../lib/editorUtil.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  AssessmentCopyEditor,
  AssessmentDeleteEditor,
  AssessmentRenameEditor,
  FileModifyEditor,
  MultiEditor,
} from '../../lib/editors.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { assertAssessmentCanBeSharedPublicly } from '../../lib/sharing-validation.js';
import { validateShortName } from '../../lib/short-name.js';
import { selectAssessmentByUuid, selectAssessments } from '../../models/assessment.js';
import {
  type AssessmentJsonInput,
  EnumAssessmentToolSchema,
} from '../../schemas/infoAssessment.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

export interface AssessmentSettingsError {
  UpdateAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  CopyAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  ChangeAssessmentType: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

const AssessmentTypeSchema = z.enum(['Exam', 'Homework']);

export interface TypeChangeLocation {
  zoneIndex?: number;
  zoneTitle?: string | null;
  questionIndex?: number;
  qid?: string | null;
  alternativeIndex?: number;
  alternativeQid?: string | null;
}

export type TypeChangeBlockerField =
  | 'multipleInstance'
  | 'requireHonorCode'
  | 'honorCode'
  | 'allowRealTimeGrading'
  | 'constantQuestionValue'
  | 'maxPoints'
  | 'maxAutoPoints';

export interface TypeChangeBlocker {
  field: TypeChangeBlockerField;
  location: TypeChangeLocation;
  currentValue: string;
}

export interface PointsListCollapse {
  field: 'points' | 'autoPoints';
  location: TypeChangeLocation;
  currentValue: number[];
  newValue: number;
}

export interface AnalyzeTypeChangeResult {
  currentType: 'Exam' | 'Homework';
  newType: 'Exam' | 'Homework';
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
}

function blockLocationForQuestion(
  zoneIndex: number,
  zoneTitle: string | null | undefined,
  questionIndex: number,
  qid: string | null | undefined,
): TypeChangeLocation {
  return { zoneIndex, zoneTitle: zoneTitle ?? null, questionIndex, qid: qid ?? null };
}

function blockLocationForAlternative(
  zoneIndex: number,
  zoneTitle: string | null | undefined,
  questionIndex: number,
  qid: string | null | undefined,
  alternativeIndex: number,
  alternativeQid: string | null | undefined,
): TypeChangeLocation {
  return {
    zoneIndex,
    zoneTitle: zoneTitle ?? null,
    questionIndex,
    qid: qid ?? null,
    alternativeIndex,
    alternativeQid: alternativeQid ?? null,
  };
}

function collectPointsListCollapses(
  block: { points?: number | number[]; autoPoints?: number | number[] },
  location: TypeChangeLocation,
): PointsListCollapse[] {
  const collapses: PointsListCollapse[] = [];
  if (Array.isArray(block.points) && block.points.length > 1) {
    collapses.push({
      field: 'points',
      location,
      currentValue: block.points,
      newValue: block.points[0],
    });
  }
  if (Array.isArray(block.autoPoints) && block.autoPoints.length > 1) {
    collapses.push({
      field: 'autoPoints',
      location,
      currentValue: block.autoPoints,
      newValue: block.autoPoints[0],
    });
  }
  return collapses;
}

function analyzeForHomework(info: AssessmentJsonInput): {
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
} {
  const blockers: TypeChangeBlocker[] = [];
  const pointsListCollapses: PointsListCollapse[] = [];

  if (info.multipleInstance) {
    blockers.push({
      field: 'multipleInstance',
      location: {},
      currentValue: 'true',
    });
  }
  if (info.requireHonorCode) {
    blockers.push({
      field: 'requireHonorCode',
      location: {},
      currentValue: 'true',
    });
  }
  if (info.honorCode != null && info.honorCode !== '') {
    blockers.push({
      field: 'honorCode',
      location: {},
      currentValue: 'set',
    });
  }
  if (info.allowRealTimeGrading === false) {
    blockers.push({
      field: 'allowRealTimeGrading',
      location: {},
      currentValue: 'false',
    });
  }

  (info.zones ?? []).forEach((zone, zoneIndex) => {
    if (zone.allowRealTimeGrading === false) {
      blockers.push({
        field: 'allowRealTimeGrading',
        location: { zoneIndex, zoneTitle: zone.title ?? null },
        currentValue: 'false',
      });
    }
    zone.questions.forEach((question, questionIndex) => {
      const qid = question.id ?? null;
      const questionLocation = blockLocationForQuestion(zoneIndex, zone.title, questionIndex, qid);
      if (question.allowRealTimeGrading === false) {
        blockers.push({
          field: 'allowRealTimeGrading',
          location: questionLocation,
          currentValue: 'false',
        });
      }
      pointsListCollapses.push(...collectPointsListCollapses(question, questionLocation));
      (question.alternatives ?? []).forEach((alt, alternativeIndex) => {
        const alternativeLocation = blockLocationForAlternative(
          zoneIndex,
          zone.title,
          questionIndex,
          qid,
          alternativeIndex,
          alt.id,
        );
        if (alt.allowRealTimeGrading === false) {
          blockers.push({
            field: 'allowRealTimeGrading',
            location: alternativeLocation,
            currentValue: 'false',
          });
        }
        pointsListCollapses.push(...collectPointsListCollapses(alt, alternativeLocation));
      });
    });
  });

  return { blockers, pointsListCollapses };
}

function analyzeForExam(info: AssessmentJsonInput): {
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
} {
  const blockers: TypeChangeBlocker[] = [];
  if (info.constantQuestionValue) {
    blockers.push({
      field: 'constantQuestionValue',
      location: {},
      currentValue: 'true',
    });
  }

  (info.zones ?? []).forEach((zone, zoneIndex) => {
    zone.questions.forEach((question, questionIndex) => {
      const qid = question.id ?? null;
      const questionLocation = blockLocationForQuestion(zoneIndex, zone.title, questionIndex, qid);
      if (question.maxPoints != null) {
        blockers.push({
          field: 'maxPoints',
          location: questionLocation,
          currentValue: String(question.maxPoints),
        });
      }
      if (question.maxAutoPoints != null) {
        blockers.push({
          field: 'maxAutoPoints',
          location: questionLocation,
          currentValue: String(question.maxAutoPoints),
        });
      }
      (question.alternatives ?? []).forEach((alt, alternativeIndex) => {
        const alternativeLocation = blockLocationForAlternative(
          zoneIndex,
          zone.title,
          questionIndex,
          qid,
          alternativeIndex,
          alt.id,
        );
        if (alt.maxPoints != null) {
          blockers.push({
            field: 'maxPoints',
            location: alternativeLocation,
            currentValue: String(alt.maxPoints),
          });
        }
        if (alt.maxAutoPoints != null) {
          blockers.push({
            field: 'maxAutoPoints',
            location: alternativeLocation,
            currentValue: String(alt.maxAutoPoints),
          });
        }
      });
    });
  });

  return { blockers, pointsListCollapses: [] };
}

async function readInfoAssessment(infoAssessmentPath: string): Promise<AssessmentJsonInput> {
  if (!(await fs.pathExists(infoAssessmentPath))) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'infoAssessment.json does not exist',
    });
  }
  return JSON.parse(await fs.readFile(infoAssessmentPath, 'utf8'));
}

function infoAssessmentPathFor(
  course: { path: string },
  courseInstanceShortName: string,
  tid: string,
) {
  return path.join(
    course.path,
    'courseInstances',
    courseInstanceShortName,
    'assessments',
    tid,
    'infoAssessment.json',
  );
}

const updateAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      aid: z.string().min(1, 'Short name is required'),
      title: z.string(),
      set: z.string(),
      number: z.string(),
      module: z.string(),
      text: z.string().optional(),
      allow_issue_reporting: z.boolean(),
      allow_personal_notes: z.boolean(),
      multiple_instance: z.boolean(),
      auto_close: z.boolean(),
      require_honor_code: z.boolean(),
      honor_code: z.string().optional(),
      max_points: z.preprocess(
        (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
        z.number().nullable(),
      ),
      max_bonus_points: z.preprocess(
        (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
        z.number().nullable(),
      ),
      constant_question_value: z.boolean(),
      shuffle_questions: z.boolean(),
      advance_score_perc: z.preprocess(
        (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
        z.number().nullable(),
      ),
      allow_real_time_grading: z.boolean(),
      grade_rate_minutes: z.preprocess(
        (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
        z.number().nullable(),
      ),
      origHash: z.string(),
      tools: z.record(z.string(), z.boolean()).optional(),
      share_source_publicly: z.boolean().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course, course_instance, assessment, locals } = ctx;

    const infoAssessmentPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      assessment.tid!,
      'infoAssessment.json',
    );

    if (!(await fs.pathExists(infoAssessmentPath))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'infoAssessment.json does not exist',
      });
    }

    const shortNameValidation = validateShortName(input.aid, assessment.tid ?? undefined);
    if (!shortNameValidation.valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: shortNameValidation.lowercaseMessage,
      });
    }

    const rootPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      assessment.tid!,
    );

    const assessmentInfo: AssessmentJsonInput = JSON.parse(
      await fs.readFile(infoAssessmentPath, 'utf8'),
    );

    assessmentInfo.title = input.title;
    assessmentInfo.set = input.set;
    assessmentInfo.number = input.number;
    if (assessmentInfo.module != null || input.module !== 'Default') {
      assessmentInfo.module = input.module;
    }
    const normalizedText = input.text?.replaceAll('\r\n', '\n');
    assessmentInfo.text = propertyValueWithDefault(assessmentInfo.text, normalizedText, '');
    assessmentInfo.allowIssueReporting = propertyValueWithDefault(
      assessmentInfo.allowIssueReporting,
      input.allow_issue_reporting,
      true,
    );
    assessmentInfo.allowPersonalNotes = propertyValueWithDefault(
      assessmentInfo.allowPersonalNotes,
      input.allow_personal_notes,
      true,
    );

    assessmentInfo.tools = assessmentInfo.tools ?? {};
    for (const tool of EnumAssessmentToolSchema.options) {
      const enabled = input.tools?.[tool] ?? false;
      // Only update the tool if it was already defined in the assessmentInfo
      // or if it's being enabled. This prevents accidentally adding new tools
      // to the assessmentInfo when editing an existing assessment that doesn't
      // have those tools configured.
      if (tool in assessmentInfo.tools || enabled) {
        assessmentInfo.tools[tool] = { ...assessmentInfo.tools[tool], enabled };
      }
    }
    // If no tools are configured, delete the tools property to avoid storing an empty object.
    if (Object.keys(assessmentInfo.tools).length === 0) {
      delete assessmentInfo.tools;
    }

    if (assessment.type === 'Exam') {
      assessmentInfo.multipleInstance = propertyValueWithDefault(
        assessmentInfo.multipleInstance,
        input.multiple_instance,
        false,
      );
      assessmentInfo.autoClose = propertyValueWithDefault(
        assessmentInfo.autoClose,
        input.auto_close,
        true,
      );
      assessmentInfo.requireHonorCode = propertyValueWithDefault(
        assessmentInfo.requireHonorCode,
        input.require_honor_code,
        true,
      );
      assessmentInfo.honorCode = propertyValueWithDefault(
        assessmentInfo.honorCode,
        input.honor_code?.replaceAll('\r\n', '\n').trim(),
        '',
      );
    }

    // Scoring
    assessmentInfo.maxPoints = propertyValueWithDefault(
      assessmentInfo.maxPoints,
      input.max_points ?? undefined,
      undefined,
    );
    assessmentInfo.maxBonusPoints = propertyValueWithDefault(
      assessmentInfo.maxBonusPoints,
      input.max_bonus_points ?? undefined,
      (v: number | null | undefined) => v == null || v === 0,
    );
    if (assessment.type === 'Homework') {
      assessmentInfo.constantQuestionValue = propertyValueWithDefault(
        assessmentInfo.constantQuestionValue,
        input.constant_question_value,
        false,
      );
    }

    // Question behaviour
    assessmentInfo.shuffleQuestions = propertyValueWithDefault(
      assessmentInfo.shuffleQuestions,
      input.shuffle_questions,
      assessment.type === 'Exam',
    );
    if (assessment.type === 'Exam') {
      assessmentInfo.advanceScorePerc = propertyValueWithDefault(
        assessmentInfo.advanceScorePerc,
        input.advance_score_perc ?? undefined,
        undefined,
      );
    }

    // Grading
    if (assessment.type === 'Exam') {
      assessmentInfo.allowRealTimeGrading = propertyValueWithDefault(
        assessmentInfo.allowRealTimeGrading,
        input.allow_real_time_grading,
        true,
      );
    }
    assessmentInfo.gradeRateMinutes = propertyValueWithDefault(
      assessmentInfo.gradeRateMinutes,
      input.grade_rate_minutes ?? undefined,
      (v: number | null | undefined) => v == null || v === 0,
    );
    if (locals.question_sharing_enabled) {
      if (input.share_source_publicly && !assessment.share_source_publicly) {
        try {
          await assertAssessmentCanBeSharedPublicly({ assessment_id: assessment.id });
        } catch (err) {
          if (err instanceof HttpStatusError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
          }
          throw err;
        }
      }
      assessmentInfo.shareSourcePublicly = propertyValueWithDefault(
        assessmentInfo.shareSourcePublicly,
        // If source is already public, preserve that setting regardless of the submitted value.
        assessment.share_source_publicly || (input.share_source_publicly ?? false),
        false,
      );
    }

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

    const tid_new = run(() => {
      try {
        return path.normalize(input.aid);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid short name (could not be normalized): ${input.aid}`,
        });
      }
    });

    const editor = new MultiEditor(
      {
        locals,
        description: `${course_instance.short_name}: Update assessment ${assessment.tid}`,
      },
      [
        new FileModifyEditor({
          locals,
          container: {
            rootPath,
            invalidRootPaths: [],
          },
          filePath: infoAssessmentPath,
          editContents: b64EncodeUnicode(formattedJson),
          origHash: input.origHash,
        }),
        new AssessmentRenameEditor({ locals, tid_new }),
      ],
    );

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<AssessmentSettingsError['UpdateAssessment']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to update assessment',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    const newInfoAssessmentPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      tid_new,
      'infoAssessment.json',
    );
    const newHash = await getOriginalHash(newInfoAssessmentPath);
    if (newHash === null) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to read hash of updated infoAssessment.json',
      });
    }

    return { origHash: newHash };
  });

const copyAssessment = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      aid: z.string().trim().min(1, 'Short name is required'),
      title: z.string().trim().min(1, 'Long name is required'),
      number: z.string().trim(),
      set: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course_instance, locals } = ctx;

    const { aid, title, number, set } = input;

    const shortNameValidation = validateShortName(aid);
    if (!shortNameValidation.valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: shortNameValidation.lowercaseMessage,
      });
    }

    const existingAssessments = await selectAssessments({
      course_instance_id: course_instance.id,
    });
    if (existingAssessments.some((a) => a.tid === aid)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `An assessment with the short name "${aid}" already exists.`,
      });
    }

    const editor = new AssessmentCopyEditor({
      locals,
      tid_new: aid,
      title_new: title,
      number_new: number,
      set_new: set,
    });
    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<AssessmentSettingsError['CopyAssessment']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to copy assessment',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    const copiedAssessment = await selectAssessmentByUuid({
      uuid: editor.uuid,
      course_instance_id: course_instance.id,
    });

    flash(
      'success',
      'Assessment copied successfully. You are now viewing your copy of the assessment.',
    );

    return { assessmentId: copiedAssessment.id };
  });

const analyzeTypeChange = t.procedure
  .use(requireCoursePermissionEdit)
  .input(z.object({ newType: AssessmentTypeSchema }))
  .query(async ({ input, ctx }): Promise<AnalyzeTypeChangeResult> => {
    const { course, course_instance, assessment } = ctx;
    const currentType = assessment.type;
    if (currentType !== 'Exam' && currentType !== 'Homework') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Assessment type "${currentType}" cannot be changed.`,
      });
    }

    if (input.newType === currentType) {
      return {
        currentType,
        newType: input.newType,
        blockers: [],
        pointsListCollapses: [],
      };
    }

    const info = await readInfoAssessment(
      infoAssessmentPathFor(course, course_instance.short_name, assessment.tid!),
    );

    const { blockers, pointsListCollapses } =
      input.newType === 'Homework' ? analyzeForHomework(info) : analyzeForExam(info);
    return { currentType, newType: input.newType, blockers, pointsListCollapses };
  });

const ChangeTypeExamDefaultsSchema = z.object({
  multipleInstance: z.boolean(),
  autoClose: z.boolean(),
  requireHonorCode: z.boolean(),
  honorCode: z.string(),
  advanceScorePerc: z.preprocess(
    (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
    z.number().nullable(),
  ),
  allowRealTimeGrading: z.boolean(),
});

const ChangeTypeHomeworkDefaultsSchema = z.object({
  constantQuestionValue: z.boolean(),
});

const ChangeTypeDefaultsSchema = z.union([
  z.object({ newType: z.literal('Exam'), defaults: ChangeTypeExamDefaultsSchema }),
  z.object({ newType: z.literal('Homework'), defaults: ChangeTypeHomeworkDefaultsSchema }),
]);

export type ChangeTypeExamDefaults = z.infer<typeof ChangeTypeExamDefaultsSchema>;
export type ChangeTypeHomeworkDefaults = z.infer<typeof ChangeTypeHomeworkDefaultsSchema>;

const changeAssessmentType = t.procedure
  .use(requireCoursePermissionEdit)
  .input(z.intersection(z.object({ origHash: z.string() }), ChangeTypeDefaultsSchema))
  .mutation(async ({ input, ctx }) => {
    const { course, course_instance, assessment, locals } = ctx;
    const currentType = assessment.type;
    if (currentType !== 'Exam' && currentType !== 'Homework') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Assessment type "${currentType}" cannot be changed.`,
      });
    }
    if (input.newType === currentType) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'New type matches the current type.',
      });
    }

    const infoAssessmentPath = infoAssessmentPathFor(
      course,
      course_instance.short_name,
      assessment.tid!,
    );
    const rootPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      assessment.tid!,
    );

    const info: AssessmentJsonInput = await readInfoAssessment(infoAssessmentPath);

    info.type = input.newType;

    if (input.newType === 'Homework') {
      delete info.multipleInstance;
      delete info.autoClose;
      delete info.requireHonorCode;
      delete info.honorCode;
      delete info.advanceScorePerc;
      delete info.allowRealTimeGrading;

      (info.zones ?? []).forEach((zone) => {
        if (zone.allowRealTimeGrading === false) delete zone.allowRealTimeGrading;
        zone.questions.forEach((question) => {
          if (question.allowRealTimeGrading === false) delete question.allowRealTimeGrading;
          if (Array.isArray(question.points)) question.points = question.points[0];
          if (Array.isArray(question.autoPoints)) question.autoPoints = question.autoPoints[0];
          (question.alternatives ?? []).forEach((alt) => {
            if (alt.allowRealTimeGrading === false) delete alt.allowRealTimeGrading;
            if (Array.isArray(alt.points)) alt.points = alt.points[0];
            if (Array.isArray(alt.autoPoints)) alt.autoPoints = alt.autoPoints[0];
          });
        });
      });

      info.constantQuestionValue = propertyValueWithDefault(
        info.constantQuestionValue,
        input.defaults.constantQuestionValue,
        false,
      );
    } else {
      delete info.constantQuestionValue;

      (info.zones ?? []).forEach((zone) => {
        zone.questions.forEach((question) => {
          delete question.maxPoints;
          delete question.maxAutoPoints;
          (question.alternatives ?? []).forEach((alt) => {
            delete alt.maxPoints;
            delete alt.maxAutoPoints;
          });
        });
      });

      info.multipleInstance = propertyValueWithDefault(
        info.multipleInstance,
        input.defaults.multipleInstance,
        false,
      );
      info.autoClose = propertyValueWithDefault(info.autoClose, input.defaults.autoClose, true);
      info.requireHonorCode = propertyValueWithDefault(
        info.requireHonorCode,
        input.defaults.requireHonorCode,
        true,
      );
      info.honorCode = propertyValueWithDefault(
        info.honorCode,
        input.defaults.honorCode.trim() === '' ? undefined : input.defaults.honorCode.trim(),
        '',
      );
      info.advanceScorePerc = propertyValueWithDefault(
        info.advanceScorePerc,
        input.defaults.advanceScorePerc ?? undefined,
        undefined,
      );
      info.allowRealTimeGrading = propertyValueWithDefault(
        info.allowRealTimeGrading,
        input.defaults.allowRealTimeGrading,
        true,
      );
    }

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(info));

    const editor = new MultiEditor(
      {
        locals,
        description: `${course_instance.short_name}: Change assessment ${assessment.tid} type to ${input.newType}`,
      },
      [
        new FileModifyEditor({
          locals,
          container: { rootPath, invalidRootPaths: [] },
          filePath: infoAssessmentPath,
          editContents: b64EncodeUnicode(formattedJson),
          origHash: input.origHash,
        }),
      ],
    );

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<AssessmentSettingsError['ChangeAssessmentType']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to change assessment type',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    const newHash = await getOriginalHash(infoAssessmentPath);
    if (newHash === null) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to read hash of updated infoAssessment.json',
      });
    }

    return { origHash: newHash, newType: input.newType };
  });

const deleteAssessment = t.procedure.use(requireCoursePermissionEdit).mutation(async ({ ctx }) => {
  const { locals } = ctx;

  const editor = new AssessmentDeleteEditor({ locals });
  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    throwAppError<AssessmentSettingsError['DeleteAssessment']>({
      code: 'SYNC_JOB_FAILED',
      message: 'Failed to delete assessment',
      jobSequenceId: serverJob.jobSequenceId,
    });
  }

  flash('success', 'Assessment deleted successfully.');
});

export const assessmentSettingsRouter = t.router({
  updateAssessment,
  copyAssessment,
  deleteAssessment,
  analyzeTypeChange,
  changeAssessmentType,
});

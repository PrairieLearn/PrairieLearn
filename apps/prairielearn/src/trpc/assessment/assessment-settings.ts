import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { run } from '@prairielearn/run';

import { StaffAssessmentSchema } from '../../lib/client/safe-db-types.js';
import { EnumAssessmentTypeSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  AssessmentCopyEditor,
  AssessmentDeleteEditor,
  AssessmentRenameEditor,
  MultiEditor,
  prepareJsonFileEditor,
  saveJsonFile,
} from '../../lib/editors.js';
import { assertAssessmentCanBeSharedPublicly } from '../../lib/sharing-validation.js';
import { validateShortName } from '../../lib/short-name.js';
import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import {
  selectAssessmentById,
  selectAssessmentByUuid,
  selectAssessmentZonePointsRange,
  selectAssessments,
} from '../../models/assessment.js';
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

export function settingsScope(json: AssessmentJsonInput) {
  const {
    accessControl: _accessControl,
    allowAccess: _allowAccess,
    groups: _groups,
    ...rest
  } = json;
  return rest;
}

const ChangeableAssessmentTypeSchema = EnumAssessmentTypeSchema.extract(['Exam', 'Homework']);
type ChangeableAssessmentType = z.infer<typeof ChangeableAssessmentTypeSchema>;

export type TypeChangeLocation =
  | { kind: 'assessment' }
  | { kind: 'zone'; zoneIndex: number; zoneTitle: string | null }
  | {
      kind: 'question';
      zoneIndex: number;
      zoneTitle: string | null;
      questionIndex: number;
      qid: string | null;
    }
  | {
      kind: 'alternative';
      zoneIndex: number;
      zoneTitle: string | null;
      questionIndex: number;
      qid: string | null;
      alternativeIndex: number;
      alternativeQid: string | null;
    };

type TypeChangeBlockerField =
  | 'multipleInstance'
  | 'autoClose'
  | 'requireHonorCode'
  | 'honorCode'
  | 'advanceScorePerc'
  | 'allowRealTimeGrading'
  | 'constantQuestionValue'
  | 'maxPoints'
  | 'maxAutoPoints';

interface TypeChangeBlocker {
  field: TypeChangeBlockerField;
  location: TypeChangeLocation;
  currentValue: string;
}

interface PointsListCollapse {
  field: 'points' | 'autoPoints';
  location: TypeChangeLocation;
  currentValue: number[];
  newValue: number;
}

interface PointsListPromotion {
  field: 'points' | 'autoPoints';
  location: TypeChangeLocation;
  currentValue: number;
  newValue: number[];
}

interface AnalyzeTypeChangeResult {
  currentType: ChangeableAssessmentType;
  newType: ChangeableAssessmentType;
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
  pointsListPromotions: PointsListPromotion[];
}

// Widened structural block type lets a single loop iterate zones, questions,
// and alternatives uniformly. Zones don't carry the points fields; treating
// them as optional-undefined avoids per-callsite narrowing on `location.kind`.
interface AssessmentBlockEntry {
  block: {
    allowRealTimeGrading?: boolean;
    points?: number | number[];
    autoPoints?: number | number[];
    maxPoints?: number;
    maxAutoPoints?: number;
  };
  location: TypeChangeLocation;
}

function* iterateAssessmentBlocks(info: AssessmentJsonInput): Generator<AssessmentBlockEntry> {
  const zones = info.zones ?? [];
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const zoneTitle = zone.title ?? null;
    yield { block: zone, location: { kind: 'zone', zoneIndex, zoneTitle } };
    for (let questionIndex = 0; questionIndex < zone.questions.length; questionIndex++) {
      const question = zone.questions[questionIndex];
      const qid = question.id ?? null;
      yield {
        block: question,
        location: { kind: 'question', zoneIndex, zoneTitle, questionIndex, qid },
      };
      const alts = question.alternatives ?? [];
      for (let alternativeIndex = 0; alternativeIndex < alts.length; alternativeIndex++) {
        const alt = alts[alternativeIndex];
        yield {
          block: alt,
          location: {
            kind: 'alternative',
            zoneIndex,
            zoneTitle,
            questionIndex,
            qid,
            alternativeIndex,
            alternativeQid: alt.id,
          },
        };
      }
    }
  }
}

function analyzeForHomework(info: AssessmentJsonInput): {
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
  pointsListPromotions: PointsListPromotion[];
} {
  const blockers: TypeChangeBlocker[] = [];
  const pointsListCollapses: PointsListCollapse[] = [];
  const assessmentLocation: TypeChangeLocation = { kind: 'assessment' };

  if (info.multipleInstance) {
    blockers.push({
      field: 'multipleInstance',
      location: assessmentLocation,
      currentValue: 'true',
    });
  }
  if (info.autoClose === false) {
    blockers.push({
      field: 'autoClose',
      location: assessmentLocation,
      currentValue: 'false',
    });
  }
  if (info.requireHonorCode) {
    blockers.push({
      field: 'requireHonorCode',
      location: assessmentLocation,
      currentValue: 'true',
    });
  }
  if (info.honorCode != null && info.honorCode !== '') {
    blockers.push({ field: 'honorCode', location: assessmentLocation, currentValue: 'set' });
  }
  if (info.advanceScorePerc != null) {
    blockers.push({
      field: 'advanceScorePerc',
      location: assessmentLocation,
      currentValue: String(info.advanceScorePerc),
    });
  }
  if (info.allowRealTimeGrading === false) {
    blockers.push({
      field: 'allowRealTimeGrading',
      location: assessmentLocation,
      currentValue: 'false',
    });
  }

  for (const { block, location } of iterateAssessmentBlocks(info)) {
    if (block.allowRealTimeGrading === false) {
      blockers.push({ field: 'allowRealTimeGrading', location, currentValue: 'false' });
    }
    if (location.kind === 'zone') continue;
    if (Array.isArray(block.points) && block.points.length > 1) {
      pointsListCollapses.push({
        field: 'points',
        location,
        currentValue: block.points,
        newValue: block.points[0],
      });
    }
    if (Array.isArray(block.autoPoints) && block.autoPoints.length > 1) {
      pointsListCollapses.push({
        field: 'autoPoints',
        location,
        currentValue: block.autoPoints,
        newValue: block.autoPoints[0],
      });
    }
  }

  return { blockers, pointsListCollapses, pointsListPromotions: [] };
}

function analyzeForExam(info: AssessmentJsonInput): {
  blockers: TypeChangeBlocker[];
  pointsListCollapses: PointsListCollapse[];
  pointsListPromotions: PointsListPromotion[];
} {
  const blockers: TypeChangeBlocker[] = [];
  const pointsListPromotions: PointsListPromotion[] = [];
  if (info.constantQuestionValue) {
    blockers.push({
      field: 'constantQuestionValue',
      location: { kind: 'assessment' },
      currentValue: 'true',
    });
  }

  for (const { block, location } of iterateAssessmentBlocks(info)) {
    if (location.kind === 'zone') continue;
    if (block.maxPoints != null) {
      blockers.push({ field: 'maxPoints', location, currentValue: String(block.maxPoints) });
    }
    if (block.maxAutoPoints != null) {
      blockers.push({
        field: 'maxAutoPoints',
        location,
        currentValue: String(block.maxAutoPoints),
      });
    }
    if (typeof block.points === 'number') {
      pointsListPromotions.push({
        field: 'points',
        location,
        currentValue: block.points,
        newValue: [block.points],
      });
    }
    if (typeof block.autoPoints === 'number') {
      pointsListPromotions.push({
        field: 'autoPoints',
        location,
        currentValue: block.autoPoints,
        newValue: [block.autoPoints],
      });
    }
  }

  return { blockers, pointsListCollapses: [], pointsListPromotions };
}

async function readInfoAssessment(infoAssessmentPath: string): Promise<AssessmentJsonInput> {
  try {
    return JSON.parse(await fs.readFile(infoAssessmentPath, 'utf8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'infoAssessment.json does not exist',
      });
    }
    throw err;
  }
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
      showQuestionTitles: z.boolean().optional(),
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
    
    const infoAssessmentPath = path.join(rootPath, 'infoAssessment.json');

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
    assessmentInfo.showQuestionTitles = propertyValueWithDefault(
      assessmentInfo.showQuestionTitles,
      input.showQuestionTitles ?? (assessment.type === 'Exam' ? false : true),
      assessment.type === 'Exam' ? false : true,
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
    if (
      locals.question_sharing_enabled &&
      input.share_source_publicly &&
      !assessment.share_source_publicly
    ) {
      try {
        await assertAssessmentCanBeSharedPublicly({ assessment_id: assessment.id });
      } catch (err) {
        if (err instanceof HttpStatusError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
        }
        throw err;
      }
    }

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

    const assessmentDir = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      assessment.tid!,
    );
    const infoAssessmentPath = path.join(assessmentDir, 'infoAssessment.json');

    const prepared = await prepareJsonFileEditor<AssessmentJsonInput>({
      jsonPath: infoAssessmentPath,
      conflictCheck: { origHash: input.origHash, scope: settingsScope },
      applyChanges: (assessmentInfo) => {
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
          assessmentInfo.shareSourcePublicly = propertyValueWithDefault(
            assessmentInfo.shareSourcePublicly,
            // If source is already public, preserve that setting regardless of the submitted value.
            assessment.share_source_publicly || (input.share_source_publicly ?? false),
            false,
          );
        }

        return assessmentInfo;
      },
      locals: {
        authz_data: ctx.authz_data,
        course: ctx.course,
        user: ctx.authn_user,
      },
      container: { rootPath: assessmentDir, invalidRootPaths: [] },
    });

    if (!prepared.success) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'The assessment settings have been modified since you loaded this page. Please refresh and try again.',
      });
    }

    const editor = new MultiEditor(
      {
        locals,
        description: `${course_instance.short_name}: Update assessment ${assessment.tid}`,
      },
      [prepared.editor, new AssessmentRenameEditor({ locals, tid_new })],
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

    return { origHash: prepared.newHash };
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
  .input(z.object({ newType: ChangeableAssessmentTypeSchema, origHash: z.string() }))
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
        pointsListPromotions: [],
      };
    }

    const info = await readInfoAssessment(
      infoAssessmentPathFor(course, course_instance.short_name, assessment.tid!),
    );

    const { blockers, pointsListCollapses, pointsListPromotions } =
      input.newType === 'Homework' ? analyzeForHomework(info) : analyzeForExam(info);
    return {
      currentType,
      newType: input.newType,
      blockers,
      pointsListCollapses,
      pointsListPromotions,
    };
  });

const changeAssessmentType = t.procedure
  .use(requireCoursePermissionEdit)
  .input(z.object({ newType: ChangeableAssessmentTypeSchema, origHash: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { course, course_instance, assessment } = ctx;
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

    if (await selectAssessmentHasInstances(assessment.id)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'The assessment type cannot be changed because student instances already exist for this assessment.',
      });
    }

    const assessmentDir = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name,
      'assessments',
      assessment.tid!,
    );
    const infoAssessmentPath = path.join(assessmentDir, 'infoAssessment.json');

    const saveResult = await saveJsonFile<AssessmentJsonInput>({
      jsonPath: infoAssessmentPath,
      conflictCheck: { origHash: input.origHash, scope: settingsScope },
      applyChanges: (info) => {
        info.type = input.newType;

        if (input.newType === 'Homework') {
          delete info.multipleInstance;
          delete info.autoClose;
          delete info.requireHonorCode;
          delete info.honorCode;
          delete info.advanceScorePerc;
          delete info.allowRealTimeGrading;

          for (const { block, location } of iterateAssessmentBlocks(info)) {
            delete block.allowRealTimeGrading;
            if (location.kind === 'zone') continue;
            if (Array.isArray(block.points)) block.points = block.points[0];
            if (Array.isArray(block.autoPoints)) block.autoPoints = block.autoPoints[0];
          }
        } else {
          delete info.constantQuestionValue;

          for (const { block, location } of iterateAssessmentBlocks(info)) {
            if (location.kind === 'zone') continue;
            delete block.maxPoints;
            delete block.maxAutoPoints;
          }
        }

        return info;
      },
      locals: {
        authz_data: ctx.authz_data,
        course: ctx.course,
        user: ctx.authn_user,
      },
      container: { rootPath: assessmentDir, invalidRootPaths: [] },
    });

    if (!saveResult.success) {
      if (saveResult.reason === 'conflict') {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The assessment settings have been modified since you loaded this page. Please refresh and try again.',
        });
      }
      throwAppError<AssessmentSettingsError['ChangeAssessmentType']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to change assessment type',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    const [refreshedAssessment, zonePointsRange] = await Promise.all([
      selectAssessmentById(assessment.id),
      selectAssessmentZonePointsRange({ assessment_id: assessment.id }),
    ]);

    return {
      origHash: saveResult.newHash,
      newType: input.newType,
      assessment: StaffAssessmentSchema.parse(refreshedAssessment),
      zonePointsRange,
    };
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

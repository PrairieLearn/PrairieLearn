import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { run } from '@prairielearn/run';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  AssessmentCopyEditor,
  AssessmentDeleteEditor,
  AssessmentRenameEditor,
  FileModifyEditor,
  MultiEditor,
  getOriginalHash,
} from '../../lib/editors.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { validateShortName } from '../../lib/short-name.js';
import { selectAssessmentByUuid } from '../../models/assessment.js';
import {
  type AssessmentJsonInput,
  EnumAssessmentToolSchema,
} from '../../schemas/infoAssessment.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

export interface AssessmentSettingsError {
  UpdateAssessment:
    | { code: 'INVALID_SHORT_NAME' }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  CopyAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteAssessment: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
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
      origHash: z.string(),
      tools: z.record(z.string(), z.boolean()).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course, course_instance, assessment, locals } = ctx;

    const infoAssessmentPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
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
      throwAppError<AssessmentSettingsError['UpdateAssessment']>({
        code: 'INVALID_SHORT_NAME',
        message: shortNameValidation.lowercaseMessage,
      });
    }

    const rootPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
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
      course_instance.short_name!,
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

const copyAssessment = t.procedure.use(requireCoursePermissionEdit).mutation(async ({ ctx }) => {
  const { course_instance, locals } = ctx;

  const editor = new AssessmentCopyEditor({ locals });
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
});

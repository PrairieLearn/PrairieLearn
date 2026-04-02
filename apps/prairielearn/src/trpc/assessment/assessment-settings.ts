import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

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
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface AssessmentSettingsError {
  UpdateAssessment:
    | { code: 'INVALID_SHORT_NAME'; reason: string }
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
        reason: shortNameValidation.lowercaseMessage,
      });
    }

    const rootPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
      'assessments',
      assessment.tid!,
    );

    const assessmentInfo = JSON.parse(await fs.readFile(infoAssessmentPath, 'utf8'));
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
    const newHash = (await getOriginalHash(newInfoAssessmentPath)) ?? '';

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
      jobSequenceId: serverJob.jobSequenceId,
    });
  }

  const assessmentId = await sqldb.queryScalar(
    sql.select_assessment_id_from_uuid,
    { uuid: editor.uuid, course_instance_id: course_instance.id },
    IdSchema,
  );

  return { assessmentId };
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
      jobSequenceId: serverJob.jobSequenceId,
    });
  }
});

export const assessmentSettingsRouter = t.router({
  updateAssessment,
  copyAssessment,
  deleteAssessment,
});

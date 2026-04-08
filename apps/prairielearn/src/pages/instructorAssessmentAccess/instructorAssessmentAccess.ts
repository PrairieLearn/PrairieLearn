import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  analyzeAssessmentFile,
  migrateAssessmentJson,
} from '../../lib/assessment-access-control/migration.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAccessControlRules } from '../../models/assessment-access-control-rules.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
  InstructorAssessmentAccessNew,
} from './instructorAssessmentAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function getAssessmentPath(
  resLocals: Pick<ResLocalsForPage<'assessment'>, 'course' | 'course_instance' | 'assessment'>,
): string {
  return path.join(
    resLocals.course.path,
    'courseInstances',
    resLocals.course_instance.short_name!,
    'assessments',
    resLocals.assessment.tid!,
    'infoAssessment.json',
  );
}

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const enhancedAccessControlEnabled = await features.enabledFromLocals(
      'enhanced-access-control',
      res.locals,
    );

    if (enhancedAccessControlEnabled && res.locals.assessment.modern_access_control) {
      const jsonRules = await selectAccessControlRules(res.locals.assessment);
      const assessmentPath = getAssessmentPath(res.locals);
      const origHash = await computeScopedJsonHash<AssessmentJsonInput>(
        assessmentPath,
        (json) => json.accessControl ?? [],
      );
      const trpcCsrfToken = generatePrefixCsrfToken(
        {
          url: getAssessmentTrpcUrl({
            courseInstanceId: res.locals.course_instance.id,
            assessmentId: res.locals.assessment.id,
          }),
          authn_user_id: res.locals.authn_user.id,
        },
        config.secretKey,
      );
      res.send(
        InstructorAssessmentAccessNew({
          resLocals: res.locals,
          origHash,
          trpcCsrfToken,
          initialData: jsonRules,
        }),
      );
      return;
    }

    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      AssessmentAccessRulesSchema,
    );

    const assessmentPath = getAssessmentPath(res.locals);

    let migrationAnalysis: Awaited<ReturnType<typeof analyzeAssessmentFile>> = null;
    let migrationPreview: {
      beforeJson: string;
      afterJson: string;
      warnings: string[];
      hasUidRules: boolean;
    } | null = null;

    if (enhancedAccessControlEnabled) {
      migrationAnalysis = await analyzeAssessmentFile(assessmentPath, res.locals.assessment.tid!);

      if (migrationAnalysis?.canMigrate) {
        const content = await fs.readFile(assessmentPath, 'utf-8');
        const parsed = JSON.parse(content);
        const beforeJson = JSON.stringify(parsed.allowAccess, null, 2);

        const migrationResult = migrateAssessmentJson(content);
        if (migrationResult) {
          const migratedParsed = JSON.parse(migrationResult.json);
          const afterJson = JSON.stringify(migratedParsed.accessControl, null, 2);
          migrationPreview = {
            beforeJson,
            afterJson,
            warnings: migrationResult.warnings,
            hasUidRules: migrationAnalysis.hasUidRules,
          };
        }
      }
    }

    const origHash = (await getOriginalHash(assessmentPath)) ?? '';
    const canEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    res.send(
      InstructorAssessmentAccess({
        resLocals: res.locals,
        accessRules,
        migrationAnalysis,
        migrationPreview,
        origHash,
        canEdit,
        enhancedAccessControlEnabled,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    if (req.body.__action === 'migrate_access_control') {
      if (!res.locals.authz_data.has_course_permission_edit || res.locals.course.example_course) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const enhancedAccessControlEnabled = await features.enabledFromLocals(
        'enhanced-access-control',
        res.locals,
      );
      if (!enhancedAccessControlEnabled) {
        throw new HttpStatusError(403, 'Enhanced access control is not enabled for this course.');
      }

      const assessmentPath = getAssessmentPath(res.locals);
      const content = await fs.readFile(assessmentPath, 'utf-8');

      const migrationResult = migrateAssessmentJson(content);
      if (!migrationResult) {
        flash('error', 'This assessment cannot be automatically migrated.');
        return res.redirect(req.originalUrl);
      }

      const formattedJson = await formatJsonWithPrettier(migrationResult.json);

      const paths = getPaths(undefined, res.locals);
      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: assessmentPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      flash('success', 'Access rules migrated to modern format.');
      return res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

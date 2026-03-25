import * as path from 'path';

import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';
import fs from 'fs-extra';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  analyzeAssessmentFile,
  migrateAssessmentJson,
} from '../../lib/access-control-migration.js';
import { fetchAllAccessControlRules } from '../../lib/assessment-access-control.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { config } from '../../lib/config.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { handleTrpcError } from '../../lib/trpc.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
  InstructorAssessmentAccessNew,
} from './instructorAssessmentAccess.html.js';
import { accessControlRouter, computeHash, createContext } from './trpc.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: accessControlRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

function getAssessmentPath(resLocals: {
  course: { path: string };
  course_instance: { short_name: string | null };
  assessment: { tid: string | null };
}): string {
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
    const assessmentId = res.locals.assessment.id;

    const jsonRules = await fetchAllAccessControlRules(res.locals.assessment);

    if (jsonRules.length > 0) {
      const origHash = computeHash(jsonRules);
      const trpcCsrfToken = generatePrefixCsrfToken(
        {
          url: req.originalUrl.split('?')[0].replace(/\/$/, '') + '/trpc',
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
      { assessment_id: assessmentId },
      AssessmentAccessRulesSchema,
    );

    const assessmentPath = getAssessmentPath(res.locals);
    const migrationAnalysis = await analyzeAssessmentFile(
      assessmentPath,
      res.locals.assessment.tid!,
    );
    const origHash = (await getOriginalHash(assessmentPath)) ?? '';
    const canEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    let migrationPreview: {
      beforeJson: string;
      afterJson: string;
      warnings: string[];
      hasUidRules: boolean;
    } | null = null;

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

    res.send(
      InstructorAssessmentAccess({
        resLocals: res.locals,
        accessRules,
        migrationAnalysis,
        migrationPreview,
        origHash,
        canEdit,
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

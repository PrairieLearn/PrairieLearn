import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
} from './instructorAssessmentAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      AssessmentAccessRulesSchema,
    );
    const enhancedAccessControl = await features.enabled('enhanced-access-control');

    // Compute origHash for the infoAssessment.json file
    const infoAssessmentPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
      'infoAssessment.json',
    );

    let origHash = '';
    if (await fs.pathExists(infoAssessmentPath)) {
      origHash = sha256(b64EncodeUnicode(await fs.readFile(infoAssessmentPath, 'utf8'))).toString();
    }

    res.send(
      InstructorAssessmentAccess({
        resLocals: res.locals,
        accessRules,
        enhancedAccessControl,
        origHash,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_access_control') {
      const infoAssessmentPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      );

      if (!(await fs.pathExists(infoAssessmentPath))) {
        throw new error.HttpStatusError(400, 'infoAssessment.json does not exist');
      }

      const paths = getPaths(undefined, res.locals);

      // Read the current assessment info and update the accessControl field
      const assessmentInfo = JSON.parse(await fs.readFile(infoAssessmentPath, 'utf8'));
      assessmentInfo.accessControl = JSON.parse(req.body.access_control);

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: infoAssessmentPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.status(500).json({ job_sequence_id: serverJob.jobSequenceId });
        return;
      }

      flash('success', 'Access control updated successfully');
      res.sendStatus(204);
      return;
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

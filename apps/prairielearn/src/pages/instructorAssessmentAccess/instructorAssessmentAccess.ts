import * as path from 'path';

import { Temporal } from '@js-temporal/polyfill';
import sha256 from 'crypto-js/sha256.js';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';

import { InstructorAssessmentAccess } from './instructorAssessmentAccess.html.js';
import { AssessmentAccessRulesSchema } from './instructorAssessmentAccess.types.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.assessment_access_rules,
      { assessment_id: res.locals.assessment.id },
      // AssessmentAccessRulesSchema,
      z.any(),
    );

    console.log(accessRules);

    const assessmentPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
      'infoAssessment.json',
    );

    const assessmentPathExists = await fs.pathExists(assessmentPath);

    let origHash = '';
    if (assessmentPathExists) {
      origHash = sha256(b64EncodeUnicode(await fs.readFile(assessmentPath, 'utf8'))).toString();
    }

    const now = Temporal.Now.zonedDateTimeISO(res.locals.course_instance.timezone);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: res.locals.course_instance.display_timezone,
      timeZoneName: 'short',
    });
    const timezone = formatter
      .formatToParts(now.toInstant().epochMilliseconds)
      .find((part) => part.type === 'timeZoneName')?.value;

    res.send(
      InstructorAssessmentAccess({
        resLocals: res.locals,
        accessRules,
        origHash,
        timezone,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be an instructor)');
    }

    if (res.locals.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'edit_access_rules') {
      const assessmentPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      );

      const paths = getPaths(req, res);

      const assessmentInfo = JSON.parse(await fs.readFile(assessmentPath, 'utf8'));

      const origHash = req.body.__orig_hash;

      const assessmentInfoEdit = assessmentInfo;
      assessmentInfoEdit.allowAccess = JSON.parse(req.body.assessment_access_rules);

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: assessmentPath,
        editContents: b64EncodeUnicode(JSON.stringify(assessmentInfoEdit, null, 2)),
        origHash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        flash('success', 'Assessment access rules updated successfully');
        return res.redirect(req.originalUrl);
      } catch (err) {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

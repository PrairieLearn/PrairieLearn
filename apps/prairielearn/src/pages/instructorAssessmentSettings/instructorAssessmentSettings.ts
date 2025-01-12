import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { AssessmentModuleSchema, AssessmentSetSchema, IdSchema } from '../../lib/db-types.js';
import {
  AssessmentCopyEditor,
  AssessmentRenameEditor,
  AssessmentDeleteEditor,
  FileModifyEditor,
} from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { encodePath } from '../../lib/uri-util.js';
import { getCanonicalHost } from '../../lib/url.js';

import { InstructorAssessmentSettings } from './instructorAssessmentSettings.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tids = await sqldb.queryRows(
      sql.tids,
      { course_instance_id: res.locals.course_instance.id },
      z.string(),
    );
    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: res.locals.course.id },
      AssessmentSetSchema,
    );
    const assessmentModules = await sqldb.queryRows(
      sql.select_assessment_modules,
      { course_id: res.locals.course.id },
      AssessmentModuleSchema,
    );
    const host = getCanonicalHost(req);
    const studentLink = new URL(
      `${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}/assessment/${res.locals.assessment.id}`,
      host,
    ).href;
    const infoAssessmentPath = encodePath(
      path.join(
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      ),
    );
    const fullInfoAssessmentPath = path.join(res.locals.course.path, infoAssessmentPath);

    const infoAssessmentPathExists = await fs.pathExists(fullInfoAssessmentPath);

    let origHash = '';
    if (infoAssessmentPathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(fullInfoAssessmentPath, 'utf8')),
      ).toString();
    }

    const canEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    res.send(
      InstructorAssessmentSettings({
        resLocals: res.locals,
        origHash,
        tids,
        studentLink,
        infoAssessmentPath,
        assessmentSets,
        assessmentModules,
        canEdit,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_assessment') {
      const editor = new AssessmentCopyEditor({
        locals: res.locals,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      const assessmentId = await sqldb.queryRow(
        sql.select_assessment_id_from_uuid,
        { uuid: editor.uuid, course_instance_id: res.locals.course_instance.id },
        IdSchema,
      );

      flash(
        'success',
        'Assessment copied successfully. You are now viewing your copy of the assessment.',
      );
      res.redirect(res.locals.urlPrefix + '/assessment/' + assessmentId + '/settings');
    } else if (req.body.__action === 'delete_assessment') {
      const editor = new AssessmentDeleteEditor({
        locals: res.locals,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(res.locals.urlPrefix + '/instance_admin/assessments');
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'change_id') {
      if (!req.body.id) {
        throw new error.HttpStatusError(400, `Invalid TID (was falsy): ${req.body.id}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
        throw new error.HttpStatusError(
          400,
          `Invalid TID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      let tid_new;
      try {
        tid_new = path.normalize(req.body.id);
      } catch {
        throw new error.HttpStatusError(
          400,
          `Invalid TID (could not be normalized): ${req.body.id}`,
        );
      }
      if (res.locals.assessment.tid === tid_new) {
        res.redirect(req.originalUrl);
      } else {
        const editor = new AssessmentRenameEditor({
          locals: res.locals,
          tid_new,
        });

        const serverJob = await editor.prepareServerJob();
        try {
          await editor.executeWithServerJob(serverJob);
          return res.redirect(req.originalUrl);
        } catch {
          return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
      }
    } else if (req.body.__action === 'update_assessment') {
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

      const assessmentInfo = JSON.parse(await fs.readFile(infoAssessmentPath, 'utf8'));
      assessmentInfo.title = req.body.title;
      assessmentInfo.set = req.body.set;
      assessmentInfo.number = req.body.number;
      if (assessmentInfo.module != null || req.body.module !== 'Default') {
        assessmentInfo.module = req.body.module;
      }
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

      const editor = new FileModifyEditor({
        locals: res.locals,
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
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      // Assessment TID must be handled separately
      if (!req.body.aid) {
        throw new error.HttpStatusError(400, `Invalid TID (was falsy): ${req.body.aid}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.aid)) {
        throw new error.HttpStatusError(
          400,
          `Invalid TID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      if (res.locals.assessment.tid !== req.body.aid) {
        let tid_new;
        try {
          tid_new = path.normalize(req.body.aid);
        } catch {
          throw new error.HttpStatusError(
            400,
            `Invalid TID (could not be normalized): ${req.body.aid}`,
          );
        }
        if (res.locals.assessment.tid !== tid_new) {
          const editor = new AssessmentRenameEditor({
            locals: res.locals,
            tid_new,
          });

          const serverJob = await editor.prepareServerJob();
          try {
            await editor.executeWithServerJob(serverJob);
          } catch {
            return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
          }
        }
      }
      flash('success', 'Assessment updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

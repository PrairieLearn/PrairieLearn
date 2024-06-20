import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import {
  AssessmentCopyEditor,
  AssessmentRenameEditor,
  AssessmentDeleteEditor,
} from '../../lib/editors.js';
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
    res.send(
      InstructorAssessmentSettings({
        resLocals: res.locals,
        tids,
        studentLink,
        infoAssessmentPath,
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
      } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
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
        } catch (err) {
          return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

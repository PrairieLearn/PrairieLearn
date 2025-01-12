import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import {
  CourseInstanceCopyEditor,
  CourseInstanceRenameEditor,
  CourseInstanceDeleteEditor,
} from '../../lib/editors.js';
import { encodePath } from '../../lib/uri-util.js';
import { getCanonicalHost } from '../../lib/url.js';

import { InstructorInstanceAdminSettings } from './instructorInstanceAdminSettings.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const shortNames = await sqldb.queryRows(
      sql.short_names,
      { course_id: res.locals.course.id },
      z.string(),
    );

    const host = getCanonicalHost(req);
    const studentLink = new URL(
      `${res.locals.plainUrlPrefix}/course_instance/${res.locals.course_instance.id}`,
      host,
    ).href;

    const infoCourseInstancePath = encodePath(
      path.join(
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      ),
    );
    res.send(
      InstructorInstanceAdminSettings({
        resLocals: res.locals,
        shortNames,
        studentLink,
        infoCourseInstancePath,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_course_instance') {
      const editor = new CourseInstanceCopyEditor({
        locals: res.locals,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      const courseInstanceID = await sqldb.queryRow(
        sql.select_course_instance_id_from_uuid,
        { uuid: editor.uuid, course_id: res.locals.course.id },
        IdSchema,
      );

      flash(
        'success',
        'Course instance copied successfully. You are new viewing your copy of the course instance.',
      );
      res.redirect(
        res.locals.plainUrlPrefix +
          '/course_instance/' +
          courseInstanceID +
          '/instructor/instance_admin/settings',
      );
    } else if (req.body.__action === 'delete_course_instance') {
      const editor = new CourseInstanceDeleteEditor({
        locals: res.locals,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(`${res.locals.plainUrlPrefix}/course/${res.locals.course.id}/course_admin`);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'change_id') {
      if (!req.body.id) {
        throw new error.HttpStatusError(400, `Invalid CIID (was falsy): ${req.body.id}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
        throw new error.HttpStatusError(
          400,
          `Invalid CIID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      let ciid_new;
      try {
        ciid_new = path.normalize(req.body.id);
      } catch {
        throw new error.HttpStatusError(
          400,
          `Invalid CIID (could not be normalized): ${req.body.id}`,
        );
      }
      if (res.locals.course_instance.short_name === ciid_new) {
        res.redirect(req.originalUrl);
      } else {
        const editor = new CourseInstanceRenameEditor({
          locals: res.locals,
          ciid_new,
        });

        const serverJob = await editor.prepareServerJob();
        try {
          await editor.executeWithServerJob(serverJob);
          res.redirect(req.originalUrl);
        } catch {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

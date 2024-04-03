//@ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
const QR = require('qrcode-svg');
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import * as path from 'path';
import * as error from '@prairielearn/error';
import { z } from 'zod';

import {
  CourseInstanceCopyEditor,
  CourseInstanceRenameEditor,
  CourseInstanceDeleteEditor,
} from '../../lib/editors';
import { encodePath } from '../../lib/uri-util';
import { getCanonicalHost } from '../../lib/url';
import { IdSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.short_names = await sqldb.queryRows(
      sql.short_names,
      { course_id: res.locals.course.id },
      z.string(),
    );

    const host = getCanonicalHost(req);
    res.locals.studentLink = new URL(
      res.locals.plainUrlPrefix + '/course_instance/' + res.locals.course_instance.id,
      host,
    ).href;

    res.locals.studentLinkQRCode = new QR({
      content: res.locals.studentLink,
      width: 512,
      height: 512,
    }).svg();

    res.locals.infoCourseInstancePath = encodePath(
      path.join(
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      ),
    );
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
      } catch (err) {
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
      } catch (err) {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'change_id') {
      if (!req.body.id) throw error.make(400, `Invalid CIID (was falsy): ${req.body.id}`);
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
        throw error.make(
          400,
          `Invalid CIID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      let ciid_new;
      try {
        ciid_new = path.normalize(req.body.id);
      } catch (err) {
        throw error.make(400, `Invalid CIID (could not be normalized): ${req.body.id}`);
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
        } catch (err) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
      }
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

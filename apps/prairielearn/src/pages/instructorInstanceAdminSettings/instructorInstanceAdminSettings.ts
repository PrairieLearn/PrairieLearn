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
import { IdSchema } from '../../lib/db-types.js';
import {
  CourseInstanceCopyEditor,
  CourseInstanceDeleteEditor,
  CourseInstanceRenameEditor,
  FileModifyEditor,
  MultiEditor,
  propertyValueWithDefault,
} from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
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
    const availableTimezones = await getCanonicalTimezones([
      res.locals.course_instance.display_timezone,
    ]);

    const infoCourseInstancePath = path.join(
      'courseInstances',
      res.locals.course_instance.short_name,
      'infoCourseInstance.json',
    );
    const fullInfoCourseInstancePath = path.join(res.locals.course.path, infoCourseInstancePath);
    const infoCourseInfoPathExists = await fs.pathExists(fullInfoCourseInstancePath);
    let origHash = '';
    if (infoCourseInfoPathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(fullInfoCourseInstancePath, 'utf8')),
      ).toString();
    }
    const canEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    res.send(
      InstructorInstanceAdminSettings({
        resLocals: res.locals,
        shortNames,
        studentLink,
        infoCourseInstancePath,
        availableTimezones,
        origHash,
        canEdit,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_course_instance') {
      const editor = new CourseInstanceCopyEditor({
        locals: res.locals as any,
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
        locals: res.locals as any,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(
          `${res.locals.plainUrlPrefix}/course/${res.locals.course.id}/course_admin/instances`,
        );
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'update_configuration') {
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }
      if (!req.body.ciid) {
        throw new error.HttpStatusError(400, `Invalid CIID (was falsy): ${req.body.ciid}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.ciid)) {
        throw new error.HttpStatusError(
          400,
          `Invalid CIID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.ciid}`,
        );
      }

      const paths = getPaths(undefined, res.locals);

      const courseInstanceInfo = JSON.parse(await fs.readFile(infoCourseInstancePath, 'utf8'));
      courseInstanceInfo.longName = req.body.long_name;
      courseInstanceInfo.timezone = propertyValueWithDefault(
        courseInstanceInfo.timezone,
        req.body.display_timezone,
        res.locals.course.display_timezone,
      );
      courseInstanceInfo.groupAssessmentsBy = propertyValueWithDefault(
        courseInstanceInfo.groupAssessmentsBy,
        req.body.group_assessments_by,
        'Set',
      );
      courseInstanceInfo.hideInEnrollPage = propertyValueWithDefault(
        courseInstanceInfo.hideInEnrollPage,
        req.body.hide_in_enroll_page === 'on',
        false,
      );
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      let ciid_new;
      try {
        ciid_new = path.normalize(req.body.ciid);
      } catch {
        throw new error.HttpStatusError(
          400,
          `Invalid CIID (could not be normalized): ${req.body.ciid}`,
        );
      }
      const editor = new MultiEditor(
        {
          locals: res.locals as any,
          description: `Update course instance: ${res.locals.course_instance.short_name}`,
        },
        [
          new FileModifyEditor({
            locals: res.locals as any,
            container: {
              rootPath: paths.rootPath,
              invalidRootPaths: paths.invalidRootPaths,
            },
            filePath: infoCourseInstancePath,
            editContents: b64EncodeUnicode(formattedJson),
            origHash: req.body.orig_hash,
          }),
          new CourseInstanceRenameEditor({
            locals: res.locals as any,
            ciid_new,
          }),
        ],
      );

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Course instance configuration updated successfully');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

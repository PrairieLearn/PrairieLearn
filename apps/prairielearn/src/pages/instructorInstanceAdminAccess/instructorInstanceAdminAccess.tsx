import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminAccess } from './instructorInstanceAdminAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleSchema,
    );

    const {
      authz_data: {
        has_course_instance_permission_view: hasCourseInstancePermissionView,
        has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
      },
    } = getPageContext(res.locals);

    assert(hasCourseInstancePermissionView !== undefined);
    assert(hasCourseInstancePermissionEdit !== undefined);
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    // Calculate orig_hash for the infoCourseInstance.json file
    const infoCourseInstancePath = path.join(
      res.locals.course.path,
      'courseInstances',
      courseInstance.short_name,
      'infoCourseInstance.json',
    );
    const infoCourseInstancePathExists = await fs.pathExists(infoCourseInstancePath);
    let origHash = '';
    if (infoCourseInstancePathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(infoCourseInstancePath, 'utf8')),
      ).toString();
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Access',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'access',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <>
            <CourseInstanceSyncErrorsAndWarnings
              authzData={res.locals.authz_data}
              courseInstance={res.locals.course_instance}
              course={res.locals.course}
              urlPrefix={res.locals.urlPrefix}
            />
            <InstructorInstanceAdminAccess
              accessRules={accessRules}
              courseInstance={courseInstance}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              csrfToken={res.locals.__csrf_token}
              origHash={origHash}
            />
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      authz_data: { has_course_instance_permission_edit: hasCourseInstancePermissionEdit },
    } = getPageContext(res.locals);

    if (!hasCourseInstancePermissionEdit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course instance editor)');
    }

    if (req.body.__action === 'update_access_control') {
      const published = req.body.published;
      const publishedStartDateEnabled = req.body.publishedStartDateEnabled;
      const publishedStartDate = req.body.publishedStartDate || null;
      const publishedEndDate = req.body.publishedEndDate || null;

      // Validate that we're not mixing systems
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstanceAccessRuleSchema,
      );

      if (accessRules.length > 0) {
        throw new error.HttpStatusError(
          400,
          'Cannot update access control when legacy allowAccess rules are present',
        );
      }

      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      // Update the access control settings
      if (!courseInstanceInfo.accessControl) {
        courseInstanceInfo.accessControl = {};
      }

      courseInstanceInfo.accessControl.published = published;
      courseInstanceInfo.accessControl.publishedStartDateEnabled = publishedStartDateEnabled;
      courseInstanceInfo.accessControl.publishedStartDate = publishedStartDate;
      courseInstanceInfo.accessControl.publishedEndDate = publishedEndDate;

      // Format and write the updated JSON
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      const paths = getPaths(undefined, res.locals);
      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: infoCourseInstancePath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      flash('success', 'Access control settings updated successfully');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;

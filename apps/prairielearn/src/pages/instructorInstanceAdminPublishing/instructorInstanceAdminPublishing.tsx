import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectUsersAndEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminPublishing } from './instructorInstanceAdminPublishing.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Validate a list of UIDs against enrollments in this course instance.
// Returns the list of UIDs that are NOT enrolled (invalidUids).
router.get(
  '/extension/check',
  asyncHandler(async (req, res) => {
    const {
      authz_data: { has_course_instance_permission_edit: hasCourseInstancePermissionEdit },
    } = getPageContext(res.locals);

    if (!hasCourseInstancePermissionEdit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course instance editor)');
    }

    // Accept comma-separated UIDs in query parameter
    const uidsString = typeof req.query.uids === 'string' ? req.query.uids : '';
    const uids: string[] = uidsString
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Verify each UID is enrolled (matches either users.uid or enrollments.pending_uid)
    const validRecords = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids,
      courseInstance: res.locals.course_instance,
      requestedRole: 'Student Data Viewer',
      authzData: res.locals.authz_data,
    });
    const validUids = new Set(validRecords.map((record) => record.user.uid));
    const invalidUids = uids.filter((uid) => !validUids.has(uid));

    res.json({ invalidUids });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      authz_data: {
        has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
        has_course_instance_permission_view: hasCourseInstancePermissionView,
      },
    } = getPageContext(res.locals);

    assert(hasCourseInstancePermissionEdit !== undefined);
    assert(hasCourseInstancePermissionView !== undefined);
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    // Calculate orig_hash for the infoCourseInstance.json file
    const infoCourseInstancePath = path.join(
      res.locals.course.path,
      'courseInstances',
      courseInstance.short_name,
      'infoCourseInstance.json',
    );
    const infoCourseInstancePathExists = await fs.pathExists(infoCourseInstancePath);
    let origHash: string | null = null;
    if (infoCourseInstancePathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(infoCourseInstancePath, 'utf8')),
      ).toString();
    }

    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Publishing',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'publishing',
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
            <InstructorInstanceAdminPublishing
              courseInstance={courseInstance}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
              accessRules={accessRules}
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
      // Validate that we're not mixing systems
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstanceAccessRuleSchema,
      );

      if (accessRules.length > 0) {
        flash('error', 'Cannot update access control when legacy allowAccess rules are present');
        res.redirect(req.originalUrl);
        return;
      }

      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        flash('error', 'infoCourseInstance.json does not exist');
        res.redirect(req.originalUrl);
        return;
      }

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      const parsedBody = z
        .object({
          accessControl: z.object({
            startDate: z.string().nullable(),
            endDate: z.string().nullable(),
          }),
        })
        .parse(req.body);

      // Update the publishing settings
      const resolvedPublishing = {
        startDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.startDate,
          parsedBody.accessControl.startDate,
          (v: string | null) => v === null || v === '',
        ),
        endDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.endDate,
          parsedBody.accessControl.endDate,
          (v: string | null) => v === null || v === '',
        ),
      };
      const hasPublishing = Object.values(resolvedPublishing).some((v) => v !== undefined);
      if (!hasPublishing) {
        courseInstanceInfo.publishing = undefined;
      } else {
        courseInstanceInfo.publishing = resolvedPublishing;
      }

      // Format and write the updated JSON
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      // JSON file has been formatted and is ready to be written
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
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      flash('success', 'Access control settings updated successfully');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;

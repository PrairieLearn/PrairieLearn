import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { IdSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import { getUrl } from '../../lib/url.js';
import { selectUsersAndEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import {
  addEnrollmentToStudentLabel,
  selectStudentLabelsByCourseInstance,
  verifyLabelBelongsToCourseInstance,
} from '../../models/student-label.js';
import { ColorJsonSchema } from '../../schemas/infoCourse.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

import { InstructorStudentsLabels } from './instructorStudentsLabels.html.js';
import { StudentLabelWithUserDataSchema } from './instructorStudentsLabels.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const MAX_UIDS = 1000;

async function getStudentLabelsWithUserData(courseInstanceId: string) {
  return await sqldb.queryRows(
    sql.select_student_labels_with_user_data,
    { course_instance_id: courseInstanceId },
    StudentLabelWithUserDataSchema,
  );
}

/**
 * Reads the infoCourseInstance.json file and returns the parsed JSON.
 */
async function readCourseInstanceJson(courseInstancePath: string): Promise<Record<string, any>> {
  const jsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
  const content = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(content);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      course_instance: courseInstance,
      authz_data,
      __csrf_token,
      course,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const labels = await getStudentLabelsWithUserData(courseInstance.id);
    const canEdit = authz_data.has_course_instance_permission_edit ?? false;

    const studentsPageUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students`;

    const search = getUrl(req).search;

    // Compute origHash for optimistic concurrency
    const courseInstancePath = path.join(course.path, 'courseInstances', courseInstance.short_name);
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    let origHash: string | null = null;
    if (await fs.pathExists(courseInstanceJsonPath)) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(courseInstanceJsonPath, 'utf8')),
      ).toString();
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Student labels',
        navContext: {
          type: 'instructor',
          page: 'students',
          subPage: 'student_labels',
        },
        content: (
          <Hydrate>
            <InstructorStudentsLabels
              csrfToken={__csrf_token}
              courseInstanceId={courseInstance.id}
              studentsPageUrl={studentsPageUrl}
              initialLabels={labels}
              canEdit={canEdit}
              isDevMode={config.devMode}
              search={search}
              origHash={origHash}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.get(
  '/data.json',
  asyncHandler(async (req, res) => {
    const { course_instance: courseInstance } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const labels = await getStudentLabelsWithUserData(courseInstance.id);
    res.json(labels);
  }),
);

router.get(
  '/check',
  asyncHandler(async (req, res) => {
    const { course_instance: courseInstance, authz_data } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const uidsParam = z.string().parse(req.query.uids);
    const uids = uidsParam.split(',').filter(Boolean);

    const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids,
      courseInstance,
      requiredRole: ['Student Data Viewer'],
      authzData: authz_data,
    });

    const enrolledUidSet = new Set(enrolledUsers.map((e) => e.user.uid));
    const invalidUids = uids.filter((uid) => !enrolledUidSet.has(uid));

    res.json({ invalidUids });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'You do not have permission to edit student labels');
    }

    const courseInstance = res.locals.course_instance;
    const course = res.locals.course;
    const authz_data = res.locals.authz_data;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      courseInstance.short_name!,
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');

    // Get paths for FileModifyEditor
    const paths = getPaths(undefined, res.locals);

    if (req.body.__action === 'create_label') {
      const {
        name,
        color,
        uids: uidsString,
        orig_hash,
      } = z
        .object({
          name: z.string().min(1, 'Label name is required').max(255),
          color: ColorJsonSchema,
          uids: z.string().optional().default(''),
          orig_hash: z.string(),
        })
        .parse(req.body);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentLabels: StudentLabelJson[] = courseInstanceJson.studentLabels ?? [];

      // Check if label name already exists
      if (studentLabels.some((l) => l.name === name)) {
        res.status(400).json({ error: 'A label with this name already exists' });
        return;
      }

      // Add new label
      studentLabels.push({ name, color });
      courseInstanceJson.studentLabels = studentLabels;

      // Format and write using FileModifyEditor
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: courseInstanceJsonPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to save changes',
          jobSequenceId: serverJob.jobSequenceId,
        });
        return;
      }

      // After sync, add enrollments
      const uids = parseUniqueValuesFromString(uidsString, MAX_UIDS);
      if (uids.length > 0) {
        const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
          uids,
          courseInstance,
          requiredRole: ['Student Data Editor'],
          authzData: authz_data,
        });

        // Get the newly created label from database
        const labels = await selectStudentLabelsByCourseInstance(courseInstance.id);
        const newLabel = labels.find((l) => l.name === name);
        if (!newLabel) {
          throw new error.HttpStatusError(500, 'Label saved but not found in database');
        }
        for (const user of enrolledUsers) {
          await addEnrollmentToStudentLabel({
            enrollment_id: user.enrollment.id,
            student_label_id: newLabel.id,
          });
        }
      }

      res.json({ success: true });
    } else if (req.body.__action === 'edit_label') {
      const {
        label_id,
        name,
        old_name,
        color,
        uids: uidsString,
        orig_hash,
      } = z
        .object({
          label_id: z.string(),
          name: z.string().min(1, 'Label name is required').max(255),
          old_name: z.string(),
          color: ColorJsonSchema,
          uids: z.string().optional().default(''),
          orig_hash: z.string(),
        })
        .parse(req.body);

      await verifyLabelBelongsToCourseInstance(label_id, courseInstance.id);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentLabels: StudentLabelJson[] = courseInstanceJson.studentLabels ?? [];

      // Find and update the label
      const labelIndex = studentLabels.findIndex((l) => l.name === old_name);
      if (labelIndex === -1) {
        res.status(400).json({ error: 'Label not found in JSON configuration' });
        return;
      }

      // Check if new name conflicts with another label
      if (name !== old_name && studentLabels.some((l) => l.name === name)) {
        res.status(400).json({ error: 'A label with this name already exists' });
        return;
      }

      studentLabels[labelIndex] = { name, color };
      courseInstanceJson.studentLabels = studentLabels;

      // Format and write using FileModifyEditor
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: courseInstanceJsonPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to save changes',
          jobSequenceId: serverJob.jobSequenceId,
        });
        return;
      }

      // Update enrollments - get the label by new name after sync
      const labels = await selectStudentLabelsByCourseInstance(courseInstance.id);
      const updatedLabel = labels.find((l) => l.name === name);

      if (!updatedLabel) {
        throw new error.HttpStatusError(500, 'Label saved but not found in database');
      }

      // Get current enrollments
      const currentEnrollmentIds = new Set(
        await sqldb.queryRows(
          sql.select_enrollment_ids_for_label,
          { student_label_id: updatedLabel.id },
          IdSchema,
        ),
      );

      // Parse UIDs and get desired enrollments
      const uids = parseUniqueValuesFromString(uidsString, MAX_UIDS);
      const desiredEnrollmentIds = new Set<string>();
      if (uids.length > 0) {
        const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
          uids,
          courseInstance,
          requiredRole: ['Student Data Editor'],
          authzData: authz_data,
        });
        enrolledUsers.forEach((u) => desiredEnrollmentIds.add(u.enrollment.id));
      }

      // Add new enrollments
      for (const enrollmentId of desiredEnrollmentIds) {
        if (!currentEnrollmentIds.has(enrollmentId)) {
          await addEnrollmentToStudentLabel({
            enrollment_id: enrollmentId,
            student_label_id: updatedLabel.id,
          });
        }
      }

      // Remove old enrollments
      const toRemove = [...currentEnrollmentIds].filter((id) => !desiredEnrollmentIds.has(id));
      if (toRemove.length > 0) {
        await sqldb.execute(sql.bulk_remove_enrollments_from_label, {
          student_label_id: updatedLabel.id,
          enrollment_ids: toRemove,
        });
      }

      res.json({ success: true });
    } else if (req.body.__action === 'delete_label') {
      const { label_id, label_name, orig_hash } = z
        .object({
          label_id: z.string(),
          label_name: z.string(),
          orig_hash: z.string(),
        })
        .parse(req.body);

      await verifyLabelBelongsToCourseInstance(label_id, courseInstance.id);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentLabels: StudentLabelJson[] = courseInstanceJson.studentLabels ?? [];

      // Remove the label
      const labelIndex = studentLabels.findIndex((l) => l.name === label_name);
      if (labelIndex === -1) {
        res.status(404).json({ error: 'Label not found in course configuration' });
        return;
      }

      studentLabels.splice(labelIndex, 1);
      courseInstanceJson.studentLabels = studentLabels;

      // Format and write using FileModifyEditor
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: courseInstanceJsonPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to save changes',
          jobSequenceId: serverJob.jobSequenceId,
        });
        return;
      }

      res.json({ success: true });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

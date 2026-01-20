import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

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
  addEnrollmentToStudentGroup,
  selectStudentGroupsByCourseInstance,
  verifyGroupBelongsToCourseInstance,
} from '../../models/student-group.js';
import { ColorJsonSchema } from '../../schemas/infoCourse.js';
import type { StudentGroupJson } from '../../schemas/infoCourseInstance.js';

import { InstructorStudentsGroups } from './instructorStudentsGroups.html.js';
import { StudentGroupWithUserDataSchema } from './instructorStudentsGroups.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const MAX_UIDS = 1000;

async function getStudentGroupsWithUserData(courseInstanceId: string) {
  return await sqldb.queryRows(
    sql.select_student_groups_with_user_data,
    { course_instance_id: courseInstanceId },
    StudentGroupWithUserDataSchema,
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

    const groups = await getStudentGroupsWithUserData(courseInstance.id);
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
        pageTitle: 'Student groups',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'student_groups',
        },
        content: (
          <Hydrate>
            <InstructorStudentsGroups
              csrfToken={__csrf_token}
              courseInstanceId={courseInstance.id}
              studentsPageUrl={studentsPageUrl}
              initialGroups={groups}
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

    const groups = await getStudentGroupsWithUserData(courseInstance.id);
    res.json(groups);
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
      throw new error.HttpStatusError(403, 'You do not have permission to edit student groups');
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

    if (req.body.__action === 'create_group') {
      const {
        name,
        color,
        uids: uidsString,
        orig_hash,
      } = z
        .object({
          name: z.string().min(1, 'Group name is required').max(255),
          color: ColorJsonSchema,
          uids: z.string().optional().default(''),
          orig_hash: z.string(),
        })
        .parse(req.body);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentGroups: StudentGroupJson[] = courseInstanceJson.studentGroups ?? [];

      // Check if group name already exists
      if (studentGroups.some((g) => g.name === name)) {
        res.status(400).json({ error: 'A group with this name already exists' });
        return;
      }

      // Add new group
      studentGroups.push({ name, color });
      courseInstanceJson.studentGroups = studentGroups;

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

        // Get the newly created group from database
        const groups = await selectStudentGroupsByCourseInstance(courseInstance.id);
        const newGroup = groups.find((g) => g.name === name);
        if (newGroup) {
          for (const user of enrolledUsers) {
            await addEnrollmentToStudentGroup({
              enrollment_id: user.enrollment.id,
              student_group_id: newGroup.id,
            });
          }
        }
      }

      res.json({ success: true });
    } else if (req.body.__action === 'edit_group') {
      const {
        group_id,
        name,
        old_name,
        color,
        uids: uidsString,
        orig_hash,
      } = z
        .object({
          group_id: z.string(),
          name: z.string().min(1, 'Group name is required').max(255),
          old_name: z.string(),
          color: ColorJsonSchema,
          uids: z.string().optional().default(''),
          orig_hash: z.string(),
        })
        .parse(req.body);

      await verifyGroupBelongsToCourseInstance(group_id, courseInstance.id);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentGroups: StudentGroupJson[] = courseInstanceJson.studentGroups ?? [];

      // Find and update the group
      const groupIndex = studentGroups.findIndex((g) => g.name === old_name);
      if (groupIndex === -1) {
        res.status(400).json({ error: 'Group not found in JSON configuration' });
        return;
      }

      // Check if new name conflicts with another group
      if (name !== old_name && studentGroups.some((g) => g.name === name)) {
        res.status(400).json({ error: 'A group with this name already exists' });
        return;
      }

      studentGroups[groupIndex] = { name, color };
      courseInstanceJson.studentGroups = studentGroups;

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

      // Update enrollments - get the group by new name after sync
      const groups = await selectStudentGroupsByCourseInstance(courseInstance.id);
      const updatedGroup = groups.find((g) => g.name === name);

      if (updatedGroup) {
        // Get current enrollments
        const currentEnrollments = await sqldb.queryRows(
          sql.select_enrollment_ids_for_group,
          { student_group_id: updatedGroup.id },
          z.object({ enrollment_id: z.string() }),
        );
        const currentEnrollmentIds = new Set(currentEnrollments.map((e) => e.enrollment_id));

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
            await addEnrollmentToStudentGroup({
              enrollment_id: enrollmentId,
              student_group_id: updatedGroup.id,
            });
          }
        }

        // Remove old enrollments
        const toRemove = [...currentEnrollmentIds].filter((id) => !desiredEnrollmentIds.has(id));
        if (toRemove.length > 0) {
          await sqldb.execute(sql.bulk_remove_enrollments_from_group, {
            student_group_id: updatedGroup.id,
            enrollment_ids: toRemove,
          });
        }
      }

      res.json({ success: true });
    } else if (req.body.__action === 'delete_group') {
      const { group_id, group_name, orig_hash } = z
        .object({
          group_id: z.string(),
          group_name: z.string(),
          orig_hash: z.string(),
        })
        .parse(req.body);

      await verifyGroupBelongsToCourseInstance(group_id, courseInstance.id);

      // Read current JSON
      const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
      const studentGroups: StudentGroupJson[] = courseInstanceJson.studentGroups ?? [];

      // Remove the group
      const groupIndex = studentGroups.findIndex((g) => g.name === group_name);
      if (groupIndex !== -1) {
        studentGroups.splice(groupIndex, 1);
        courseInstanceJson.studentGroups = studentGroups;

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
        } catch {
          res.status(500).json({
            error: 'Failed to save changes',
            jobSequenceId: serverJob.jobSequenceId,
          });
          return;
        }
      }

      res.json({ success: true });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

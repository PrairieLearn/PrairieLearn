import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import {
  createStudentGroup,
  deleteStudentGroup,
  renameStudentGroup,
  selectStudentGroupById,
} from '../../models/student-group.js';

import { InstructorInstanceAdminStudentGroups } from './instructorInstanceAdminStudentGroups.html.js';
import { StudentGroupRowSchema } from './instructorInstanceAdminStudentGroups.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getStudentGroupsWithCounts(courseInstanceId: string) {
  return await sqldb.queryRows(
    sql.select_student_groups_with_counts,
    { course_instance_id: courseInstanceId },
    StudentGroupRowSchema,
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { course_instance: courseInstance, authz_data, __csrf_token } = extractPageContext(
      res.locals,
      {
        pageType: 'courseInstance',
        accessType: 'instructor',
      },
    );

    const groups = await getStudentGroupsWithCounts(courseInstance.id);
    const canEdit = authz_data.has_course_instance_permission_edit ?? false;

    const studentsPageUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students`;

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
            <InstructorInstanceAdminStudentGroups
              csrfToken={__csrf_token}
              courseInstanceId={courseInstance.id}
              studentsPageUrl={studentsPageUrl}
              initialGroups={groups}
              canEdit={canEdit}
              isDevMode={config.devMode}
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

    const groups = await getStudentGroupsWithCounts(courseInstance.id);
    res.json(groups);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { course_instance: courseInstance, authz_data } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    if (!authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'You do not have permission to edit student groups');
    }

    if (req.body.__action === 'create_group') {
      const { name } = z
        .object({
          name: z.string().min(1, 'Group name is required').max(255),
        })
        .parse(req.body);

      try {
        await createStudentGroup({
          course_instance_id: courseInstance.id,
          name,
        });
        res.json({ success: true });
      } catch (err: any) {
        if (err.constraint === 'student_groups_course_instance_id_name_key') {
          res.status(400).json({ error: 'A group with this name already exists' });
        } else {
          throw err;
        }
      }
    } else if (req.body.__action === 'rename_group') {
      const { group_id, name } = z
        .object({
          group_id: z.string(),
          name: z.string().min(1, 'Group name is required').max(255),
        })
        .parse(req.body);

      const group = await selectStudentGroupById(group_id);
      if (group.course_instance_id !== courseInstance.id) {
        throw new error.HttpStatusError(403, 'Group does not belong to this course instance');
      }

      try {
        await renameStudentGroup({ id: group_id, name });
        res.json({ success: true });
      } catch (err: any) {
        if (err.constraint === 'student_groups_course_instance_id_name_key') {
          res.status(400).json({ error: 'A group with this name already exists' });
        } else {
          throw err;
        }
      }
    } else if (req.body.__action === 'delete_group') {
      const { group_id } = z
        .object({
          group_id: z.string(),
        })
        .parse(req.body);

      const group = await selectStudentGroupById(group_id);
      if (group.course_instance_id !== courseInstance.id) {
        throw new error.HttpStatusError(403, 'Group does not belong to this course instance');
      }

      await deleteStudentGroup(group_id);
      res.json({ success: true });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

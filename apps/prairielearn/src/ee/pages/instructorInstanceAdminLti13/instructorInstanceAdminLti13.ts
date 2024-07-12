import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { Lti13CourseInstanceSchema, Lti13InstanceSchema } from '../../../lib/db-types.js';
import { createServerJob, ServerJob } from '../../../lib/server-jobs.js';
import { insertAuditLog } from '../../../models/audit-log.js';

import {
  AssessmentRowSchema,
  InstructorInstanceAdminLti13,
} from './instructorInstanceAdminLti13.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_lti13_course_instance_id?',
  asyncHandler(async (req, res) => {
    const instances = await queryRows(
      sql.select_lti13_instances,
      {
        course_instance_id: res.locals.course_instance.id,
      },
      z.object({
        lti13_course_instance: Lti13CourseInstanceSchema,
        lti13_instance: Lti13InstanceSchema,
      }),
    );

    // Handle the no parameter offered case, take the first one
    if (!req.params.unsafe_lti13_course_instance_id) {
      const lti13_course_instance_id = instances[0].lti13_course_instance.id;

      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${lti13_course_instance_id}`,
      );
      return;
    }

    const instance = instances.find(
      (i) => i.lti13_course_instance.id === req.params.unsafe_lti13_course_instance_id,
    );

    if (!instance) {
      throw error.make(404, 'LTI 1.3 instance not found.');
    }

    const assessments = await queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentRowSchema,
    );

    console.log(assessments);

    console.log(instance);

    res.send(
      InstructorInstanceAdminLti13({
        resLocals: res.locals,
        instance,
        instances,
        assessments,
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    const instance = await queryRow(
      sql.select_lti13_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      z.object({
        lti13_course_instance: Lti13CourseInstanceSchema,
        lti13_instance: Lti13InstanceSchema,
      }),
    );

    const serverJobOptions = {
      courseInstanceId: res.locals.course_instance.id,
      userId: res.locals.user.user_id,
      authnUserId: res.locals.authn_user.user_id,
      type: 'lti13',
      description: 'Some LTI operation',
    };

    if (req.body.__action === 'delete_lti13_course_instance') {
      await runInTransactionAsync(async () => {
        const deleted_lti13_course_instance = await queryRow(
          sql.delete_lti13_course_instance,
          {
            course_instance_id: res.locals.course_instance.id,
            lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
          },
          Lti13CourseInstanceSchema,
        );
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.user_id,
          table_name: 'lti13_course_instances',
          action: 'delete',
          institution_id: res.locals.institution.id,
          course_id: res.locals.course.id,
          course_instance_id: deleted_lti13_course_instance.course_instance_id,
          row_id: deleted_lti13_course_instance.id,
          old_state: deleted_lti13_course_instance,
        });
      });

      // Redirect away so they don't get an error page
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/assessments`,
      );
    } else if (req.body.__action === 'poll_lti13_assessments') {
      serverJobOptions.description = 'get lineitems from LTI';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        await get_lineitems(
          req.body.unsafe_lti13_course_instance_id,
          res.locals.course_instance.id,
          job,
          res.locals.authn_user.user_id,
        );
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

/////////////////////////////////////////////////////////////////////////////////////////////////
export async function get_lineitems(
  lti13_course_instance_id: number,
  course_instance_id: number,
  job: ServerJob,
  authn_user_id: number,
) {
  const params = {
    course_instance_id,
    lti13_course_instance_id,
  };

  job.info('Polling for line items');

  /*
  // Make this a more targetted single row query
  const lti13_course_instance_result = await queryAsync(sql.get_course_instance, params);

  const lti13_course_instance = lti13_course_instance_result.rows[0];
  //console.log(JSON.stringify(lti13_course_instance, null, 3));

  const url = lti13_course_instance.ags_lineitems;

  // Validate here, error before moving on if we're missing things

  const token = await access_token(lti13_instance_id);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  //console.log(response);
  const data = await response.json();

  for (const item of data) {
    console.log(item);

    await queryAsync(sql.update_lineitem, {
      lti13_instance_id,
      course_instance_id,
      lineitem_id: item.id,
      assessment_id: item?.resourceId,
      lineitem: JSON.stringify(item),
      active: true,
    });
  }

  job.info(JSON.stringify(data, null, 3));
  */
}

export default router;

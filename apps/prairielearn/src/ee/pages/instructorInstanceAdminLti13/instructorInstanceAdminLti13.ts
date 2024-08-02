import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import {
  AssessmentSchema,
  Lti13CourseInstanceSchema,
  Lti13InstanceSchema,
  Lti13Lineitems,
} from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  sync_lineitems,
  get_lineitems,
  unlink_assessment,
  query_and_link_lineitem,
  create_and_link_lineitem,
} from '../../lib/lti13.js';

import {
  AssessmentRowSchema,
  InstructorInstanceAdminLti13,
  LineitemsInputs,
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

    const lineitems = await queryRows(
      sql.select_lineitems,
      {
        lti13_course_instance_id: instance.lti13_course_instance.id,
      },
      Lti13Lineitems,
    );

    if ('lineitems' in req.query) {
      const refreshed_lineitems = await get_lineitems(instance);
      res.send(LineitemsInputs(refreshed_lineitems));
    } else {
      res.send(
        InstructorInstanceAdminLti13({
          resLocals: res.locals,
          instance,
          instances,
          assessments,
          lineitems,
        }),
      );
    }
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    console.log(req.body);

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
      serverJobOptions.description = 'Synchronize external assignment metadata from LMS';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        await sync_lineitems(instance, job);
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else if (req.body.__action === 'unlink_assessment') {
      // validate assessment_id off of course_instance here?
      await unlink_assessment(instance.lti13_course_instance.id, req.body.assessment_id);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'create_link_assessment') {
      serverJobOptions.description = 'create lineitem from PL assessment';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        const assessment = await queryRow(
          sql.select_assessment,
          {
            assessment_id: req.body.assessment_id,
            course_instance_id: instance.lti13_course_instance.course_instance_id,
          },
          AssessmentSchema.extend({
            label: z.string(),
          }),
        );

        const assessment_metadata = {
          label: `${assessment.label}: ${assessment.title}`,
          id: assessment.id,
          url: `${getCanonicalHost(req)}/pl/course_instance/${assessment.course_instance_id}/assessment/${assessment.id}`,
        };

        await create_and_link_lineitem(instance, job, assessment_metadata);
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else if (req.body.__action === 'link_assessment') {
      await query_and_link_lineitem(instance, req.body.lineitem_id, req.body.assessment_id);
      return res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

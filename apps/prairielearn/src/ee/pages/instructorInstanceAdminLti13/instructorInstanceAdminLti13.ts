import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  AssessmentSchema,
  Lti13CourseInstanceSchema,
  Lti13AssessmentsSchema,
} from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  enrollUsersFromLti13,
  syncLineitems,
  getLineitems,
  unlinkAssessment,
  queryAndLinkLineitem,
  createAndLinkLineitem,
  validateLti13CourseInstance,
  Lti13CombinedInstanceSchema,
  updateLti13Scores,
} from '../../lib/lti13.js';

import {
  AssessmentRowSchema,
  InstructorInstanceAdminLti13,
  LineitemsInputs,
} from './instructorInstanceAdminLti13.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.use(
  asyncHandler(async (req, res, next) => {
    if (!(await validateLti13CourseInstance(res.locals))) {
      throw new error.HttpStatusError(403, 'LTI 1.3 is not available');
    }
    next();
  }),
);

router.get(
  '/:unsafe_lti13_course_instance_id?',
  asyncHandler(async (req, res) => {
    const instances = await queryRows(
      sql.select_lti13_instances,
      {
        course_instance_id: res.locals.course_instance.id,
      },
      Lti13CombinedInstanceSchema,
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

    if ('lineitems' in req.query) {
      res.send(LineitemsInputs(await getLineitems(instance)));
      return;
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
      sql.select_lti13_assessments,
      {
        lti13_course_instance_id: instance.lti13_course_instance.id,
      },
      Lti13AssessmentsSchema,
    );

    res.send(
      InstructorInstanceAdminLti13({
        resLocals: res.locals,
        instance,
        instances,
        assessments,
        lineitems,
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
      Lti13CombinedInstanceSchema,
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
      serverJobOptions.description = 'Synchronize assignment and user metadata from LMS';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        await syncLineitems(instance, job);
        job.info('Adding students to PrairieLearn');
        await enrollUsersFromLti13(instance);
        job.info('Done.');
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else if (req.body.__action === 'unlink_assessment') {
      await unlinkAssessment(instance.lti13_course_instance.id, req.body.unsafe_assessment_id);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'create_link_assessment') {
      serverJobOptions.description = 'create lineitem from PL assessment';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        const assessment = await queryRow(
          sql.select_assessment_to_create,
          {
            assessment_id: req.body.unsafe_assessment_id,
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

        await createAndLinkLineitem(instance, job, assessment_metadata);
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else if (req.body.__action === 'link_assessment') {
      await queryAndLinkLineitem(instance, req.body.lineitem_id, req.body.unsafe_assessment_id);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'bulk_unlink_assessments') {
      const group_id =
        res.locals.course_instance.assessments_group_by === 'Set'
          ? req.body.assessment_set_id || null
          : req.body.assessment_module_id || null;

      const lineitems = await queryRows(
        sql.delete_lti13_assessments,
        {
          lti13_course_instance_id: instance.lti13_course_instance.id,
          course_instance_id: instance.lti13_course_instance.course_instance_id,
          group_id,
          assessments_group_by: res.locals.course_instance.assessments_group_by,
        },
        Lti13AssessmentsSchema,
      );

      flash(
        'success',
        `${lineitems.length} assessment${lineitems.length === 1 ? '' : 's'} unlinked.`,
      );
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'bulk_create_assessments') {
      const group_id =
        res.locals.course_instance.assessments_group_by === 'Set'
          ? req.body.assessment_set_id || null
          : req.body.assessment_module_id || null;

      const assessments = await queryRows(
        sql.select_assessments_to_create,
        {
          course_instance_id: instance.lti13_course_instance.course_instance_id,
          group_id,
          assessments_group_by: res.locals.course_instance.assessments_group_by,
        },
        AssessmentSchema.extend({
          label: z.string(),
        }),
      );

      if (assessments.length === 0) {
        flash('warning', 'No unlinked assessments to create');
        return res.redirect(req.originalUrl);
      }

      serverJobOptions.description = 'create lineitems from PL assessments';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        for (const assessment of assessments) {
          const assessment_metadata = {
            label: `${assessment.label}: ${assessment.title}`,
            id: assessment.id,
            url: `${getCanonicalHost(req)}/pl/course_instance/${assessment.course_instance_id}/assessment/${assessment.id}`,
          };

          await createAndLinkLineitem(instance, job, assessment_metadata);
        }
      });
      return res.redirect(`/pl/jobSequence/${serverJob.jobSequenceId}`);
    } else if (req.body.__action === 'send_grades') {
      // Should something like this be in a model?
      const assessment = await queryRow(
        sql.select_assessment_with_course_instance,
        {
          assessment_id: req.body.unsafe_assessment_id,
          course_instance_id: res.locals.course_instance.id,
        },
        AssessmentSchema,
      );
      if (assessment === null) {
        throw new Error('Invalid assessment.id');
      }

      await enrollUsersFromLti13(instance);
      await updateLti13Scores(assessment.id);

      await queryAsync(sql.update_lti13_assessment_last_activity, {
        assessment_id: assessment.id,
      });

      flash('notice', `Sending grades in the background for ${assessment.title}`);
      return res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

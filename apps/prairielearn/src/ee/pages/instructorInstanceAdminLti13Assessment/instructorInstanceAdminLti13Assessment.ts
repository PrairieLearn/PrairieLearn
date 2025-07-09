import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  AssessmentSchema,
  type Lti13Assessments,
  Lti13AssessmentsSchema,
  Lti13CourseInstanceSchema,
} from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { type AssessmentRow, selectAssessments } from '../../../models/assessment.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  Lti13CombinedInstanceSchema,
  createAndLinkLineitem,
  getLineitems,
  queryAndLinkLineitem,
  syncLineitems,
  unlinkAssessment,
  updateLti13Scores,
} from '../../lib/lti13.js';

import {
  type AssessmentLti13AssessmentRowSchema,
  InstructorInstanceAdminLti13,
  type LineItemsRow,
  LineitemsInputs,
} from './instructorInstanceAdminLti13Assessment.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

/*

linked assessments with other options
- inputs
	we pick one
	with link
- outputs
	polls for available links
	we pick one



assignment linking
- inputs
	none
- assessment list showing linked, pick one

assignment intercept
- have assessment and lineitem




We know the assessment
- picked from the Integrations page
- link intercepted from an instructor LTI login

We pick the assessment
- assignment selection placement
- picked from the Integrations page


*/

router.get(
  '/:unsafe_assessment_id?',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    console.log(res.locals);
    console.log(req.params);

    const instance = await queryRow(
      sql.select_lti13_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        lti13_course_instance_id: req.params.lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

    console.log(instance);

    let assessment_id: string | null = null;

    if ('unsafe_assessment_id' in req.params) {
      // Query to sanitize to this course instance and LTI 1.3 course instance
      // Then set assessment_id

      assessment_id = req.params.unsafe_assessment_id;
    } else {
      // No assessment ID, we probably need to pick one
      // Get metadata from LTI
    }

    console.log(assessment_id);

    const assessments: AssessmentLti13AssessmentRowSchema[] = await selectAssessments({
      course_instance_id: res.locals.course_instance.id,
    });

    const lti13_assessments = await queryRows(
      sql.select_lti13_assessments,
      {
        lti13_course_instance_id: instance.lti13_course_instance.id,
      },
      Lti13AssessmentsSchema,
    );

    const lti13AssessmentsByLineItemIdUrl: Record<string, Lti13Assessments> = {};
    const lti13AssessmentsByAssessmentId: Record<string, Lti13Assessments> = {};
    for (const la of lti13_assessments) {
      lti13AssessmentsByAssessmentId[la.assessment_id] = la;
      lti13AssessmentsByLineItemIdUrl[la.lineitem_id_url] = la;
    }

    const assessmentsById: Record<string, AssessmentRow> = {};
    for (const a of assessments) {
      a.lti13_assessment = lti13AssessmentsByAssessmentId[a.id] ?? undefined;
      assessmentsById[a.id] = a;
    }

    // Fixme
    const assessment = assessmentsById[assessment_id ?? 1];

    if ('lineitems' in req.query) {
      let lineItemRows: LineItemsRow[];

      try {
        lineItemRows = await getLineitems(instance);
      } catch (error) {
        res.end(html`<div class="alert alert-warning">${error.message}</div>`.toString());
        logger.error('LineitemsInputs error', error);
        return;
      }

      for (const item of lineItemRows) {
        item.lti13_assessment = lti13AssessmentsByLineItemIdUrl[item.id] ?? undefined;
        item.assessment = assessmentsById[item.lti13_assessment?.assessment_id] ?? undefined;
      }

      lineItemRows.sort((a, b) => {
        // First sort by assessment_id, puts unlinked first and ordered by ID
        const a_assessmentId = a.assessment?.id ?? '';
        const b_assessmentId = b.assessment?.id ?? '';

        const byAssessmentId = a_assessmentId.localeCompare(b_assessmentId);
        if (byAssessmentId !== 0) return byAssessmentId;

        // Finally, reverse sort by the lineitem id to get the newest first
        return b.id.localeCompare(a.id);
      });

      res.send(
        LineitemsInputs({
          lineitems: lineItemRows,
          urlPrefix: res.locals.urlPrefix,
        }),
      );
      return;
    }

    res.send(
      InstructorInstanceAdminLti13({
        resLocals: res.locals,
        instance,
        assessment,
        assessments,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const instance = await queryRow(
      sql.select_lti13_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

    const serverJobOptions = {
      courseId: res.locals.course.id,
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
      serverJobOptions.description = 'Synchronize assignment metadata from LMS';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        await syncLineitems(instance, job);
      });
      return res.redirect(res.locals.urlPrefix + '/jobSequence/' + serverJob.jobSequenceId);
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
            unsafe_assessment_id: req.body.unsafe_assessment_id,
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
      return res.redirect(res.locals.urlPrefix + '/jobSequence/' + serverJob.jobSequenceId);
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
      return res.redirect(res.locals.urlPrefix + '/jobSequence/' + serverJob.jobSequenceId);
    } else if (req.body.__action === 'send_grades') {
      const assessment = await queryRow(
        sql.select_assessment_in_course_instance,
        {
          unsafe_assessment_id: req.body.unsafe_assessment_id,
          course_instance_id: res.locals.course_instance.id,
        },
        AssessmentSchema,
      );
      if (assessment === null) {
        throw new error.HttpStatusError(403, 'Invalid assessment.id');
      }

      serverJobOptions.description = 'LTI 1.3 send assessment grades to LMS';
      const serverJob = await createServerJob(serverJobOptions);

      serverJob.executeInBackground(async (job) => {
        await updateLti13Scores(assessment.id, instance, job);

        await queryAsync(sql.update_lti13_assessment_last_activity, {
          assessment_id: assessment.id,
        });
      });
      return res.redirect(res.locals.urlPrefix + '/jobSequence/' + serverJob.jobSequenceId);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;

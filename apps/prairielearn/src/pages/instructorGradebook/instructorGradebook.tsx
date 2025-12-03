/** @jsxImportSource @prairielearn/preact-cjs */

import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryCursor, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { updateAssessmentInstanceScore } from '../../lib/assessment.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  checkAssessmentInstanceBelongsToCourseInstance,
  getCourseOwners,
} from '../../lib/course.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorGradebookTable } from './components/InstructorGradebookTable.js';
import { RoleDescriptionModal } from './components/RoleDescriptionModal.js';
import {
  AssessmentInstanceScoreResultSchema,
  CourseAssessmentRowSchema,
  type GradebookRow,
  GradebookRowSchema,
} from './instructorGradebook.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function buildCsvFilename(locals: UntypedResLocals) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
    const { course_instance, course, authz_data, urlPrefix, __csrf_token } = extractPageContext(
      res.locals,
      {
        pageType: 'courseInstance',
        accessType: 'instructor',
      },
    );

    if (!authz_data.has_course_instance_permission_view) {
      // We don't actually forbid access to this page if the user is not a student
      // data viewer, because we want to allow users to click the gradebook tab and
      // see instructions for how to get student data viewer permissions. Otherwise,
      // users just wouldn't see the tab at all, and this caused a lot of questions
      // about why staff couldn't see the gradebook tab.
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'instance_admin',
            subPage: 'gradebook',
          },
          courseOwners,
          pageTitle: 'Gradebook',
          requiredPermissions: 'Student Data Viewer',
        }),
      );
      return;
    }

    const csvFilename = buildCsvFilename(res.locals);
    const courseAssessments = await queryRows(
      sql.course_assessments,
      { course_instance_id: course_instance.id },
      CourseAssessmentRowSchema,
    );
    const gradebookRows = await queryRows(
      sql.user_scores,
      { course_id: course.id, course_instance_id: course_instance.id },
      GradebookRowSchema,
    );

    const content = (
      <>
        <CourseInstanceSyncErrorsAndWarnings
          authzData={res.locals.authz_data}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />
        <Hydrate fullHeight>
          <InstructorGradebookTable
            csrfToken={__csrf_token}
            courseAssessments={courseAssessments}
            gradebookRows={gradebookRows}
            urlPrefix={urlPrefix}
            csvFilename={csvFilename}
            courseInstanceId={course_instance.id}
            search={getUrl(req).search}
            isDevMode={process.env.NODE_ENV === 'development'}
          />
        </Hydrate>
      </>
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Gradebook',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'gradebook',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content,
        postContent: [RoleDescriptionModal()],
      }),
    );
  }),
);

router.get(
  '/raw_data.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const userScores = await queryRows(
      sql.user_scores,
      { course_id: res.locals.course.id, course_instance_id: res.locals.course_instance.id },
      GradebookRowSchema,
    );
    res.json(userScores);
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    if (req.params.filename === buildCsvFilename(res.locals)) {
      const assessments = await queryRows(
        sql.course_assessments,
        { course_instance_id: res.locals.course_instance.id },
        CourseAssessmentRowSchema,
      );
      const userScoresCursor = await queryCursor(
        sql.user_scores,
        {
          course_id: res.locals.course.id,
          course_instance_id: res.locals.course_instance.id,
        },
        GradebookRowSchema,
      );

      const stringifier = stringifyStream<GradebookRow>({
        header: true,
        columns: ['UID', 'Name', 'UIN', 'Role', 'Enrollment', ...assessments.map((a) => a.label)],
        transform: (record) => [
          record.uid,
          record.uin,
          record.user_name,
          record.role,
          record.enrollment?.status ?? null,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          ...assessments.map((a) => record.scores[a.assessment_id]?.score_perc ?? null),
        ],
      });

      res.attachment(req.params.filename);
      await pipeline(userScoresCursor.stream(100), stringifier, res);
    } else {
      throw new HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'edit_total_score_perc') {
      await checkAssessmentInstanceBelongsToCourseInstance(
        req.body.assessment_instance_id,
        res.locals.course_instance.id,
      );
      await updateAssessmentInstanceScore(
        req.body.assessment_instance_id,
        req.body.score_perc,
        res.locals.authn_user.user_id,
      );

      const updatedScores = await queryRows(
        sql.assessment_instance_score,
        { assessment_instance_id: req.body.assessment_instance_id },
        AssessmentInstanceScoreResultSchema,
      );
      res.json(updatedScores);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

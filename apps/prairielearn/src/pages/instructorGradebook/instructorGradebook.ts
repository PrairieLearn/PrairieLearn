import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows, queryCursor } from '@prairielearn/postgres';

import { updateAssessmentInstanceScore } from '../../lib/assessment.js';
import {
  getCourseOwners,
  checkAssessmentInstanceBelongsToCourseInstance,
} from '../../lib/course.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { InstructorGradebook } from './instructorGradebook.html.js';
import {
  AssessmentInstanceScoreResultSchema,
  CourseAssessmentRowSchema,
  type GradebookRow,
  GradebookRowSchema,
} from './instructorGradebook.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function buildCsvFilename(locals: Record<string, any>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const csvFilename = buildCsvFilename(res.locals);

    if (!res.locals.authz_data.has_course_instance_permission_view) {
      // We don't actually forbid access to this page if the user is not a student
      // data viewer, because we want to allow users to click the gradebook tab and
      // see instructions for how to get student data viewer permissions. Otherwise,
      // users just wouldn't see the tab at all, and this caused a lot of questions
      // about why staff couldn't see the gradebook tab.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res
        .status(403)
        .send(InstructorGradebook({ resLocals: res.locals, courseOwners, csvFilename }));
      return;
    }

    const courseAssessments = await queryRows(
      sql.course_assessments,
      { course_instance_id: res.locals.course_instance.id },
      CourseAssessmentRowSchema,
    );
    res.send(
      InstructorGradebook({
        resLocals: res.locals,
        courseOwners: [], // Not needed in this context
        csvFilename,
        courseAssessments,
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
      const userScoresCursor = await queryCursor(sql.user_scores, {
        course_id: res.locals.course.id,
        course_instance_id: res.locals.course_instance.id,
      });

      const stringifier = stringifyStream({
        header: true,
        columns: ['UID', 'UIN', 'Name', 'Role', ...assessments.map((a) => a.label)],
        transform: (record: GradebookRow) => [
          record.uid,
          record.uin,
          record.user_name,
          record.role,
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

import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { IssueSchema } from '../../../../lib/db-types.js';
import { updateIssueOpen } from '../../../../lib/issues.js';
import { typedAsyncHandler } from '../../../../lib/res-locals.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

// `system_data` and `course_data` are large jsonb blobs (stack traces,
// variant params) — included on the single-issue endpoint, omitted from list.
const CourseIssueListSchema = IssueSchema.pick({
  id: true,
  date: true,
  open: true,
  manually_reported: true,
  course_caused: true,
  student_message: true,
  instructor_message: true,
  course_id: true,
  course_instance_id: true,
  assessment_id: true,
  instance_question_id: true,
  question_id: true,
  user_id: true,
  variant_id: true,
}).extend({
  course_instance_short_name: z.string().nullable(),
  assessment_tid: z.string().nullable(),
  assessment_label: z.string().nullable(),
  question_qid: z.string().nullable(),
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
  user_email: z.string().nullable(),
});

const CourseIssueDetailSchema = CourseIssueListSchema.extend({
  system_data: z.record(z.string(), z.any()).nullable(),
  course_data: z.record(z.string(), z.any()).nullable(),
});

function parseBoolParam(value: unknown): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const filter_open = parseBoolParam(req.query.open);
    const filter_manually_reported = parseBoolParam(req.query.manually_reported);
    const filter_since =
      typeof req.query.since === 'string' && req.query.since.length > 0
        ? req.query.since
        : null;

    const issues = await sqldb.queryRows(
      sql.select_issues,
      {
        course_id: res.locals.course.id,
        filter_open,
        filter_manually_reported,
        filter_since,
      },
      CourseIssueListSchema,
    );

    res.status(200).json({ issues });
  }),
);

router.get(
  '/:issue_id(\\d+)',
  typedAsyncHandler<'course'>(async (req, res) => {
    const issue = await sqldb.queryOptionalRow(
      sql.select_issue_by_id,
      {
        course_id: res.locals.course.id,
        issue_id: req.params.issue_id,
      },
      CourseIssueDetailSchema,
    );

    if (!issue) {
      throw new error.HttpStatusError(404, 'Issue not found');
    }

    res.status(200).json(issue);
  }),
);

const PatchBodySchema = z.object({
  open: z.boolean(),
});

router.patch(
  '/:issue_id(\\d+)',
  typedAsyncHandler<'course'>(async (req, res) => {
    const body = PatchBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new error.HttpStatusError(
        400,
        'Request body must be a JSON object with shape { "open": boolean }',
      );
    }

    // updateIssueOpen throws 403 if the issue does not exist in this course
    // or is not course-caused — same surface the instructor UI presents. The
    // helper also writes an audit_logs entry attributed to the calling user.
    await updateIssueOpen({
      issue_id: req.params.issue_id,
      new_open: body.data.open,
      course_id: res.locals.course.id,
      authn_user_id: res.locals.authz_data.authn_user.id,
    });

    const issue = await sqldb.queryOptionalRow(
      sql.select_issue_by_id,
      {
        course_id: res.locals.course.id,
        issue_id: req.params.issue_id,
      },
      CourseIssueDetailSchema,
    );

    // Should never happen: updateIssueOpen would have thrown above if the
    // issue weren't in this course. But the row read is a fresh query so a
    // concurrent delete could in principle race — guard defensively.
    if (!issue) {
      throw new error.HttpStatusError(404, 'Issue not found');
    }

    res.status(200).json(issue);
  }),
);

export default router;

import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { idsEqual } from '../../../../lib/id.js';
import { insertReportedIssue } from '../../../../lib/issues.js';
import { selectOptionalCourseInstanceById } from '../../../../models/course-instances.js';
import {
  closeIssues,
  selectIssueSummariesByIds,
  updateIssueOpen,
} from '../../../../models/issue.js';
import { selectQuestionById } from '../../../../models/question.js';
import { selectAndAuthzVariant, selectOptionalVariantById } from '../../../../models/variant.js';

import { type CourseActionContext, CourseActionError, action, count } from './action.js';

const IssuesInputSchema = z.strictObject({
  issue_ids: z
    .array(IdSchema)
    .min(1)
    .max(500)
    .describe('IDs of the issues, from the id column of the issues dataset.'),
});

/** The issues a request names. The request is refused if the course does not have one of them. */
async function selectIssues(ctx: CourseActionContext, issueIds: string[]) {
  const ids = [...new Set(issueIds)];
  const issues = await selectIssueSummariesByIds({ course_id: ctx.course.id, issue_ids: ids });
  const found = new Set(issues.map((issue) => issue.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `This course has no issue with ID ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}. Find issue IDs in the issues dataset.`,
    );
  }
  return issues;
}

const ReportInputSchema = z.strictObject({
  variant_id: IdSchema.describe(
    'ID of the question version the issue is about, from the id column of the variants dataset.',
  ),
  description: z
    .string()
    .min(1)
    .max(1000)
    .describe('What is wrong, in the words the report will show.'),
});

export const issueActions = {
  issues_close: action({
    description:
      'Close open issues, as on the Issues page. Issues that are already closed are left as they are.',
    permission: 'course_editor',
    input: IssuesInputSchema,
    run: async ({ ctx, input }) => {
      await selectIssues(ctx, input.issue_ids);
      const closed = await closeIssues({
        issue_ids: input.issue_ids,
        course_id: ctx.course.id,
        authn_user_id: ctx.user.id,
      });
      return { summary: `Closed ${count(closed, 'issue')}.` };
    },
  }),
  issues_reopen: action({
    description:
      'Reopen closed issues, as on the Issues page. Issues that are already open are left as they are.',
    permission: 'course_editor',
    input: IssuesInputSchema,
    run: async ({ ctx, input }) => {
      const closed = (await selectIssues(ctx, input.issue_ids)).filter((issue) => !issue.open);
      // The Issues page reopens one issue at a time, so this reopens each the same way.
      for (const issue of closed) {
        await updateIssueOpen({
          issue_id: issue.id,
          open: true,
          course_id: ctx.course.id,
          authn_user_id: ctx.user.id,
        });
      }
      return { summary: `Reopened ${count(closed.length, 'issue')}.` };
    },
  }),
  issues_report: action({
    description:
      'Report an issue on a question version, as the "Report an issue" button does. A version that belongs to a student needs Student Data Viewer access to its course instance.',
    permission: [],
    input: ReportInputSchema,
    run: async ({ ctx, input }) => {
      const variant = await selectOptionalVariantById(input.variant_id);
      if (!variant || !idsEqual(variant.course_id, ctx.course.id)) {
        throw new CourseActionError(
          `This course has no question version with ID ${input.variant_id}. Find one in the variants dataset.`,
        );
      }
      try {
        // Without authz data, this checks the instructor's access to a student's version in its
        // own course instance, as the question preview does.
        await selectAndAuthzVariant({
          unsafe_variant_id: variant.id,
          variant_course: ctx.course,
          question_id: variant.question_id,
          authn_user: ctx.user,
          user: ctx.user,
          is_administrator: ctx.is_administrator,
        });
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 403) {
          throw new CourseActionError(
            "The instructor needs Student Data Viewer access in this version's course instance to report an issue on it. Tell them, and do not retry.",
          );
        }
        throw error;
      }
      const question = await selectQuestionById(variant.question_id);
      const issueId = await insertReportedIssue({
        variant,
        description: input.description,
        reportedBy: 'instructor',
        courseData: {
          question,
          course_instance: variant.course_instance_id
            ? await selectOptionalCourseInstanceById(variant.course_instance_id)
            : undefined,
          course: ctx.course,
        },
        userId: ctx.user.id,
        authnUserId: ctx.user.id,
      });
      return { summary: `Reported issue #${issueId} on ${question.qid}.` };
    },
  }),
};

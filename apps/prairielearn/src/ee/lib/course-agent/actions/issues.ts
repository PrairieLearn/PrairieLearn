import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { idsEqual } from '../../../../lib/id.js';
import { insertReportedIssue } from '../../../../lib/issues.js';
import { selectOptionalCourseInstanceById } from '../../../../models/course-instances.js';
import {
  type IssueSummary,
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

/**
 * What the instructor sees for a request that changes some of the issues it names: the issues
 * that will change, each linking to it on the Issues page, and a count of the rest.
 */
function describeIssues({
  ctx,
  verb,
  changing,
  unchanged,
}: {
  ctx: CourseActionContext;
  /** `Close` or `Reopen`. */
  verb: string;
  changing: IssueSummary[];
  /** How many of the named issues are left as they are, and the state they are already in. */
  unchanged: { count: number; state: string };
}) {
  if (changing.length === 0) {
    throw new CourseActionError(
      `${unchanged.count === 1 ? 'This issue is' : 'These issues are'} already ${unchanged.state}, so there is nothing to change.`,
    );
  }
  return {
    title:
      changing.length === 1
        ? `${verb} issue #${changing[0].id}`
        : `${verb} ${count(changing.length, 'issue')}`,
    subtitle:
      unchanged.count > 0
        ? `${count(unchanged.count, 'other issue')} already ${unchanged.state}`
        : null,
    items: changing.map((issue) => ({
      // The Issues page shows the same number, which tells apart two reports on one question.
      label: `#${issue.id} ${issue.question_qid ?? ''}`.trim(),
      // The Issues page, searched for the question, shows the report and who can open what.
      href: issue.question_qid
        ? `/pl/course/${ctx.course.id}/course_admin/issues?q=${encodeURIComponent(`qid:${issue.question_qid}`)}`
        : null,
    })),
  };
}

const ReportInputSchema = z.strictObject({
  variant_id: IdSchema.describe(
    'ID of the question version the issue is about, from the id column of the variants dataset.',
  ),
  description: z
    .string()
    .min(1)
    .max(300)
    .describe('What is wrong, in the words the report will show.'),
});

/**
 * The variant an issue is reported on, if the instructor may see it. The "Report an issue"
 * button checks the same: a student's variant needs Student Data Viewer access to its course
 * instance.
 */
async function selectReportedVariant(ctx: CourseActionContext, variantId: string) {
  const variant = await selectOptionalVariantById(variantId);
  if (!variant || !idsEqual(variant.course_id, ctx.course.id)) {
    throw new CourseActionError(
      `This course has no question version with ID ${variantId}. Find one in the variants dataset.`,
    );
  }
  try {
    await selectAndAuthzVariant({
      unsafe_variant_id: variant.id,
      variant_course: ctx.course,
      question_id: variant.question_id,
      authz_data: ctx.authz_data,
      authn_user: ctx.user,
      user: ctx.user,
      is_administrator: 'is_administrator' in ctx.authz_data && ctx.authz_data.is_administrator,
    });
  } catch (error) {
    if ((error as { status?: number }).status === 403) {
      throw new CourseActionError(
        "The instructor needs Student Data Viewer access in this version's course instance to report an issue on it. Tell them, and do not retry.",
      );
    }
    throw error;
  }
  return { variant, question: await selectQuestionById(variant.question_id) };
}

export const issueActions = {
  issues_close: action({
    group: 'issues',
    icon: 'check-circle',
    tone: 'positive',
    description: 'Close the open issues among issue_ids.',
    requiredRole: ['Editor'],
    input: IssuesInputSchema,
    describe: async ({ ctx, input }) => {
      const issues = await selectIssues(ctx, input.issue_ids);
      const changing = issues.filter((issue) => issue.open);
      return describeIssues({
        ctx,
        verb: 'Close',
        changing,
        unchanged: { count: issues.length - changing.length, state: 'closed' },
      });
    },
    run: async ({ ctx, input }) => {
      const closed = await closeIssues({
        issue_ids: input.issue_ids,
        course_id: ctx.course.id,
        authn_user_id: ctx.user.id,
      });
      return { status: 'succeeded', summary: `Closed ${count(closed, 'issue')}.` };
    },
  }),
  issues_reopen: action({
    group: 'issues',
    icon: 'arrow-counterclockwise',
    tone: 'caution',
    description: 'Reopen the closed issues among issue_ids.',
    requiredRole: ['Editor'],
    input: IssuesInputSchema,
    describe: async ({ ctx, input }) => {
      const issues = await selectIssues(ctx, input.issue_ids);
      const changing = issues.filter((issue) => !issue.open);
      return describeIssues({
        ctx,
        verb: 'Reopen',
        changing,
        unchanged: { count: issues.length - changing.length, state: 'open' },
      });
    },
    run: async ({ ctx, input }) => {
      // The Issues page opens one issue at a time, so this opens each closed one the same way.
      const issues = await selectIssues(ctx, input.issue_ids);
      const closed = issues.filter((issue) => !issue.open);
      for (const issue of closed) {
        await updateIssueOpen({
          issue_id: issue.id,
          open: true,
          course_id: ctx.course.id,
          authn_user_id: ctx.user.id,
        });
      }
      return { status: 'succeeded', summary: `Reopened ${count(closed.length, 'issue')}.` };
    },
  }),
  issues_report: action({
    group: 'issues',
    icon: 'flag',
    tone: 'positive',
    description:
      'Report an issue on a question version, as an instructor does with "Report an issue".',
    requiredRole: ['Previewer'],
    input: ReportInputSchema,
    describe: async ({ ctx, input }) => {
      const { variant, question } = await selectReportedVariant(ctx, input.variant_id);
      return {
        title: `Report an issue on ${question.qid}`,
        subtitle: `"${input.description}"`,
        items: [
          {
            label: `${question.qid}, version ${variant.id}`,
            // Where the Issues page's "instructor view" goes.
            href: `/pl/course/${ctx.course.id}/question/${question.id}/?variant_id=${variant.id}`,
          },
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const { variant, question } = await selectReportedVariant(ctx, input.variant_id);
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
      return { status: 'succeeded', summary: `Reported issue #${issueId}.` };
    },
  }),
};

import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type IssueSummary,
  closeIssues,
  selectIssueSummariesByIds,
  updateIssueOpen,
} from '../../../../models/issue.js';

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
 * that will change, each linking where the Issues page links it, and a count of the rest.
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
      // The question as its reporter saw it, where the Issues page's "instructor view" goes.
      href: issue.question_id
        ? `/pl/course/${ctx.course.id}/question/${issue.question_id}/${issue.variant_id ? `?variant_id=${issue.variant_id}` : ''}`
        : null,
    })),
  };
}

export const issueActions = {
  issues_close: action({
    group: 'issues',
    icon: 'check-circle',
    tone: 'positive',
    description:
      'Closes the issues with the given IDs that are open. Issues that are already closed are left as they are. Use it once the question is fixed, or when the report needs no change.',
    results:
      'The issues leave the open issues list, and the open issue count goes down. Students see no change.',
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
    description:
      'Reopens the issues with the given IDs that are closed. Issues that are already open are left as they are. Use it for an issue closed by mistake, or one whose problem has come back.',
    results:
      'The issues return to the open issues list, and the open issue count goes up. Students see no change.',
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
      const reopened = await runInTransactionAsync(async () => {
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
        return closed.length;
      });
      return { status: 'succeeded', summary: `Reopened ${count(reopened, 'issue')}.` };
    },
  }),
};

import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { selectIssueSummariesByIds, updateIssuesOpen } from '../../../../models/issue.js';

import { type CourseActionContext, CourseActionError, action, count } from './action.js';

const IssuesInputSchema = z.strictObject({
  issue_ids: z
    .array(IdSchema)
    .min(1)
    .max(500)
    .describe('IDs of the issues, from the id column of the issues dataset.'),
});

/** The issues whose state would change, or an error the course agent can act on. */
async function describeIssues(ctx: CourseActionContext, issueIds: string[], open: boolean) {
  const ids = [...new Set(issueIds)];
  const issues = await selectIssueSummariesByIds({ course_id: ctx.course.id, issue_ids: ids });
  const found = new Set(issues.map((issue) => issue.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `This course has no issue with ID ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}. Find issue IDs in the issues dataset.`,
    );
  }
  const changing = issues.filter((issue) => issue.open !== open);
  if (changing.length === 0) {
    throw new CourseActionError(
      `${issues.length === 1 ? 'This issue is' : 'These issues are'} already ${open ? 'open' : 'closed'}.`,
    );
  }
  const unchanged = issues.length - changing.length;
  return {
    title: `${open ? 'Reopen' : 'Close'} ${count(changing.length, 'issue')}`,
    context:
      unchanged > 0 ? `${count(unchanged, 'issue')} already ${open ? 'open' : 'closed'}` : null,
    rows: changing.map((issue) => ({
      label: issue.question_qid ?? 'No question',
      detail: issue.student_message?.trim() || null,
    })),
  };
}

export const issueActions = {
  issues_close: action({
    group: 'issues',
    description:
      'Close open issues that students or PrairieLearn reported on questions. Use it once the question is fixed, or when the report needs no change.',
    effects:
      'The issues leave the open issues list and the open issue count. Students see no change.',
    undo: 'Reopen the same issues with issues_reopen.',
    permission: 'course_editor',
    input: IssuesInputSchema,
    describe: ({ ctx, input }) => describeIssues(ctx, input.issue_ids, false),
    run: async ({ ctx, input }) => {
      const { updated } = await updateIssuesOpen({
        course_id: ctx.course.id,
        issue_ids: input.issue_ids,
        open: false,
        authn_user_id: ctx.user.id,
      });
      return {
        summary:
          updated === 0
            ? 'Nothing changed: the issues were already closed.'
            : `Closed ${count(updated, 'issue')}.`,
      };
    },
  }),
  issues_reopen: action({
    group: 'issues',
    description:
      'Reopen closed issues, such as ones closed by mistake or whose problem has come back.',
    effects: 'The issues return to the open issues list and the open issue count.',
    undo: 'Close the same issues with issues_close.',
    permission: 'course_editor',
    input: IssuesInputSchema,
    describe: ({ ctx, input }) => describeIssues(ctx, input.issue_ids, true),
    run: async ({ ctx, input }) => {
      const { updated } = await updateIssuesOpen({
        course_id: ctx.course.id,
        issue_ids: input.issue_ids,
        open: true,
        authn_user_id: ctx.user.id,
      });
      return {
        summary:
          updated === 0
            ? 'Nothing changed: the issues were already open.'
            : `Reopened ${count(updated, 'issue')}.`,
      };
    },
  }),
};

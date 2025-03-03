import * as url from 'node:url';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import SearchString from 'search-string';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { InstructorIssues, IssueRowSchema, PAGE_SIZE } from './instructorIssues.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function formatForLikeClause(str: string) {
  return `%${str}%`;
}

function parseRawQuery(str: string) {
  const parsedQuery = SearchString.parse(str);
  const filters = {
    filter_is_open: null as boolean | null,
    filter_is_closed: null as boolean | null,
    filter_manually_reported: null as boolean | null,
    filter_automatically_reported: null as boolean | null,
    filter_qids: null as string[] | null,
    filter_not_qids: null as string[] | null,
    filter_query_text: null as string | null,
    filter_users: null as string[] | null,
    filter_not_users: null as string[] | null,
  };

  const queryText = parsedQuery.getAllText();
  if (queryText) {
    filters.filter_query_text = queryText;
  }

  for (const option of parsedQuery.getConditionArray()) {
    switch (option.keyword) {
      case 'is': // boolean option
        switch (option.value) {
          case 'open':
            filters.filter_is_open = !option.negated;
            break;
          case 'closed':
            filters.filter_is_closed = !option.negated;
            break;
          case 'manually-reported':
            filters.filter_manually_reported = !option.negated;
            break;
          case 'automatically-reported':
            filters.filter_automatically_reported = !option.negated;
            break;
        }
        break;
      case 'qid':
        if (!option.negated) {
          filters.filter_qids = filters.filter_qids || [];
          filters.filter_qids.push(formatForLikeClause(option.value));
        } else {
          filters.filter_not_qids = filters.filter_not_qids || [];
          filters.filter_not_qids.push(formatForLikeClause(option.value));
        }
        break;
      case 'user':
        if (!option.negated) {
          filters.filter_users = filters.filter_users || [];
          filters.filter_users.push(formatForLikeClause(option.value));
        } else {
          filters.filter_not_users = filters.filter_not_users || [];
          filters.filter_not_users.push(formatForLikeClause(option.value));
        }
        break;
    }
  }

  return filters;
}

async function updateIssueOpen(
  issue_id: string,
  new_open: boolean,
  course_id: string,
  authn_user_id: string,
) {
  const updated_issue_id = await queryOptionalRow(
    sql.update_issue_open,
    { issue_id, new_open, course_id, authn_user_id },
    IdSchema,
  );
  if (!updated_issue_id) {
    throw new HttpStatusError(
      403,
      `Unable to ${new_open ? 'open' : 'close'} issue ${issue_id}: issue does not exist in this course.`,
    );
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filterQuery = typeof req.query.q === 'string' ? req.query.q : 'is:open';

    const [closedCount, openCount] = await queryRows(
      sql.issues_count,
      { course_id: res.locals.course.id },
      z.number(),
    );

    const queryPageNumber = Number(req.query.page);
    const filters = parseRawQuery(filterQuery);
    const offset = Number.isInteger(queryPageNumber) ? (queryPageNumber - 1) * PAGE_SIZE : 0;
    const issueRows = await queryRows(
      sql.select_issues,
      { course_id: res.locals.course.id, offset, limit: PAGE_SIZE, ...filters },
      IssueRowSchema,
    );
    // If the offset is not zero and there are no returned issues, this
    // typically means the page number was incorrectly set to a value larger
    // than the number of actual issues. In this case, redirect to the same page
    // without setting the page number.
    if (offset > 0 && issueRows.length === 0) {
      res.redirect(`${url.parse(req.originalUrl).pathname}?q=${encodeURIComponent(filterQuery)}`);
      return;
    }

    // Compute the IDs of the course instances to which the effective user has access.

    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });
    const linkableCourseInstanceIds = new Set(course_instances.map((ci) => ci.id));

    const issues = issueRows.map((row) => ({
      ...row,

      // Each issue is associated with a question variant. If an issue is also
      // associated with a course instance, then this question variant is from
      // some assessment in that course instance. We can provide a link to this
      // assessment, but we only want to do so if the effective user has access
      // to the corresponding course instance.
      //
      // Add a flag to each row saying if the effective user has this access.
      hideAssessmentLink:
        row.course_instance_id != null && !linkableCourseInstanceIds.has(row.course_instance_id),

      // There are three situations in which the issue need not be anonymized:
      //
      //  1) The issue is not associated with a course instance. The only way
      //     for a user to generate an issue that is not associated with a course
      //     instance is if they are an instructor, so there are no student data
      //     to be protected in this case.
      //
      //  2) We are accessing this page through a course instance, the issue is
      //     associated with the same course instance, and the user has student
      //     data view access.
      //
      //  3) We are not accessing this page through the course instance
      //     associated to the issue (i.e., we are accessing it through the
      //     course or through a different course instance), and the user has
      //     student data view access in the course instance associated to the
      //     issue. This is distinguished from situation 2 above to ensure
      //     effective user roles are taken into account.
      //
      // Otherwise, all issues must be anonymized.
      showUser:
        !row.course_instance_id ||
        (res.locals.course_instance &&
          idsEqual(res.locals.course_instance.id, row.course_instance_id) &&
          res.locals.authz_data.has_course_instance_permission_view) ||
        ((!res.locals.course_instance ||
          !idsEqual(res.locals.course_instance.id, row.course_instance_id)) &&
          course_instances.some(
            (ci) => ci.id === row.course_instance_id && ci.has_course_instance_permission_view,
          )),
    }));

    const openFilteredIssuesCount = issueRows.reduce((acc, row) => (row.open ? acc + 1 : acc), 0);

    res.send(
      InstructorIssues({
        resLocals: res.locals,
        issues,
        filterQuery,
        openFilteredIssuesCount,
        openCount,
        closedCount,
        chosenPage: queryPageNumber,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a course editor)');
    }

    if (req.body.__action === 'open') {
      await updateIssueOpen(
        req.body.issue_id,
        true, // open status
        res.locals.course.id,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'close') {
      await updateIssueOpen(
        req.body.issue_id,
        false, // open status
        res.locals.course.id,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'close_matching') {
      const issueIds = req.body.unsafe_issue_ids.split(',').filter((id) => id !== '');
      const closedCount = await queryRow(
        sql.close_issues,
        {
          issue_ids: issueIds,
          course_id: res.locals.course.id,
          authn_user_id: res.locals.authn_user.user_id,
        },
        z.number(),
      );
      flash('success', `Closed ${closedCount} ${closedCount === 1 ? 'issue' : 'issues'}.`);
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

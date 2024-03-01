// @ts-check
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
import { parseISO, formatDistance } from 'date-fns';
import * as express from 'express';
const SearchString = require('search-string');
const { z } = require('zod');

import * as error from '@prairielearn/error';
import * as paginate from '../../lib/paginate';
import * as sqldb from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';
import { idsEqual } from '../../lib/id';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances';
import { IdSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const PAGE_SIZE = 100;

const commonQueries = {
  allOpenQuery: 'is:open',
  allClosedQuery: 'is:closed',
  allManuallyReportedQuery: 'is:manually-reported',
  allAutomaticallyReportedQuery: 'is:automatically-reported',
};

const formattedCommonQueries = {};

Object.keys(commonQueries).forEach((key) => {
  formattedCommonQueries[key] = `?q=${encodeURIComponent(commonQueries[key])}`;
});

function formatForLikeClause(str) {
  return `%${str}%`;
}

function parseRawQuery(str) {
  const parsedQuery = SearchString.parse(str);
  /**
   * @type {{filter_is_open: boolean | null, filter_is_closed: boolean | null, filter_manually_reported: boolean | null, filter_automatically_reported: boolean | null, filter_qids: string[] | null, filter_not_qids: string[] | null, filter_query_text: string | null, filter_users: string[] | null, filter_not_users: string[] | null}}
   */
  const filters = {
    filter_is_open: null,
    filter_is_closed: null,
    filter_manually_reported: null,
    filter_automatically_reported: null,
    filter_qids: null,
    filter_not_qids: null,
    filter_query_text: null,
    filter_users: null,
    filter_not_users: null,
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

/**
 * @param {string} issue_id
 * @param {boolean} new_open
 * @param {string} course_id
 * @param {string} authn_user_id
 */
async function updateIssueOpen(issue_id, new_open, course_id, authn_user_id) {
  const result = await sqldb.queryOptionalRow(
    sql.update_issue_open,
    { issue_id, new_open, course_id, authn_user_id },
    IdSchema,
  );
  if (!result) {
    throw error.make(
      403,
      `Unable to ${new_open ? 'open' : 'close'} issue ${issue_id}: issue does not exist in this course.`,
    );
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!('q' in req.query)) {
      req.query.q = 'is:open';
    }

    const counts = await sqldb.queryAsync(sql.issues_count, {
      course_id: res.locals.course.id,
    });

    if (counts.rowCount !== 2) {
      throw new Error('unable to obtain issue count, rowCount = ' + counts.rowCount);
    }

    res.locals.closedCount = counts.rows[0].count;
    res.locals.openCount = counts.rows[1].count;

    var params = {
      course_id: res.locals.course.id,
      offset: 0,
      limit: PAGE_SIZE,
    };
    if (_.isInteger(Number(req.query.page))) {
      params.offset = (Number(req.query.page) - 1) * PAGE_SIZE;
    }

    const filters = parseRawQuery(req.query.q);
    _.assign(params, filters);

    const issues = await sqldb.queryAsync(sql.select_issues, params);

    // Compute the IDs of the course instances to which the effective user has access.

    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });
    const linkable_course_instance_ids = course_instances.reduce((acc, ci) => {
      acc.add(ci.id);
      return acc;
    }, new Set());

    res.locals.issueCount = issues.rowCount ? issues.rows[0].issue_count : 0;

    _.assign(res.locals, paginate.pages(req.query.page, res.locals.issueCount, PAGE_SIZE));
    res.locals.shouldPaginate = res.locals.issueCount > PAGE_SIZE;

    issues.rows.forEach((row) => {
      // Add human-readable relative dates to each row
      row.relative_date = formatDistance(parseISO(row.formatted_date), parseISO(row.now_date), {
        addSuffix: true,
      });

      if (row.assessment) {
        if (!row.course_instance_id) {
          throw new Error(
            `Issue id ${row.issue_id} is associated with an assessment but not a course instance`,
          );
        }

        // Each issue is associated with a question variant. If an issue is also
        // associated with a course instance, then this question variant is from
        // some assessment in that course instance. We can provide a link to this
        // assessment, but we only want to do so if the effective user has access
        // to the corresponding course instance.
        //
        // Add a flag to each row saying if the effective user has this access.
        row.assessment.hide_link = !linkable_course_instance_ids.has(
          parseInt(row.course_instance_id),
        );

        // If necessary, construct the URL prefix to the appropriate course instance
        // (either if we are accessing the issue through the course page route, or if
        // we are accessing the issue through a different course instance page route).
        if (
          !res.locals.course_instance ||
          !idsEqual(res.locals.course_instance.id, row.course_instance_id)
        ) {
          row.assessment.urlPrefix = `${res.locals.plainUrlPrefix}/course_instance/${row.course_instance_id}/instructor`;
        }
      }

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
      row.show_user =
        !row.course_instance_id ||
        (res.locals.course_instance &&
          idsEqual(res.locals.course_instance.id, row.course_instance_id) &&
          res.locals.authz_data.has_course_instance_permission_view) ||
        ((!res.locals.course_instance ||
          !idsEqual(res.locals.course_instance.id, row.course_instance_id)) &&
          course_instances.some(
            (ci) =>
              idsEqual(ci.id, row.course_instance_id) && ci.has_course_instance_permission_view,
          ));
    });

    res.locals.rows = issues.rows;

    res.locals.filterQuery = req.query.q;
    res.locals.encodedFilterQuery = encodeURIComponent((req.query.q ?? '').toString());
    res.locals.filters = filters;
    res.locals.openFilteredIssuesCount = issues.rows.reduce(
      (acc, row) => (row.open ? acc + 1 : acc),
      0,
    );

    res.locals.commonQueries = {};
    _.assign(res.locals.commonQueries, formattedCommonQueries);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw error.make(403, 'Access denied (must be a course editor)');
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
      const closedCount = await sqldb.queryRow(
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
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

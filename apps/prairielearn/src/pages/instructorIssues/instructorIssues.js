const ERR = require('async-stacktrace');
const _ = require('lodash');
const { parseISO, formatDistance } = require('date-fns');
const express = require('express');
const router = express.Router();
const SearchString = require('search-string');

const error = require('@prairielearn/error');
const paginate = require('../../lib/paginate');
const sqldb = require('@prairielearn/postgres');
const { idsEqual } = require('../../lib/id');

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

router.get('/', function (req, res, next) {
  if (!('q' in req.query)) {
    req.query.q = 'is:open';
  }
  const filters = parseRawQuery(req.query.q);

  var params = {
    course_id: res.locals.course.id,
  };
  _.assign(params, filters);

  sqldb.query(sql.issues_count, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount !== 2) {
      return next(new Error('unable to obtain issue count, rowCount = ' + result.rowCount));
    }
    res.locals.closedCount = result.rows[0].count;
    res.locals.openCount = result.rows[1].count;

    var params = {
      course_id: res.locals.course.id,
      offset: 0,
      limit: PAGE_SIZE,
    };
    if (_.isInteger(Number(req.query.page))) {
      params.offset = (Number(req.query.page) - 1) * PAGE_SIZE;
    }
    _.assign(params, filters);

    sqldb.query(sql.select_issues, params, function (err, result) {
      if (ERR(err, next)) return;

      // Set of IDs of course instances to which the effective user has access
      const linkable_course_instance_ids = res.locals.authz_data.course_instances.reduce(
        (acc, ci) => {
          acc.add(ci.id);
          return acc;
        },
        new Set()
      );

      res.locals.issueCount = result.rowCount ? result.rows[0].issue_count : 0;

      _.assign(res.locals, paginate.pages(req.query.page, res.locals.issueCount, PAGE_SIZE));
      res.locals.shouldPaginate = res.locals.issueCount > PAGE_SIZE;

      result.rows.forEach((row) => {
        // Add human-readable relative dates to each row
        row.relative_date = formatDistance(parseISO(row.formatted_date), parseISO(row.now_date), {
          addSuffix: true,
        });

        if (row.assessment) {
          if (!row.course_instance_id) {
            return next(
              new Error(
                `Issue id ${row.issue_id} is associated with an assessment but not a course instance`
              )
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
            parseInt(row.course_instance_id)
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
            _.some(
              res.locals.authz_data.course_instances,
              (ci) =>
                idsEqual(ci.id, row.course_instance_id) && ci.has_course_instance_permission_view
            ));
      });

      res.locals.rows = result.rows;

      res.locals.filterQuery = req.query.q;
      res.locals.encodedFilterQuery = encodeURIComponent(req.query.q);
      res.locals.filters = filters;

      res.locals.commonQueries = {};
      _.assign(res.locals.commonQueries, formattedCommonQueries);

      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
  });
});

router.post('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be a course editor)'));
  }

  if (req.body.__action === 'open') {
    let params = [
      req.body.issue_id,
      true, // open status
      res.locals.course.id,
      res.locals.authn_user.user_id,
    ];
    sqldb.call('issues_update_open', params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'close') {
    let params = [
      req.body.issue_id,
      false, // open status
      res.locals.course.id,
      res.locals.authn_user.user_id,
    ];
    sqldb.call('issues_update_open', params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'close_all') {
    let params = [
      false, // open status
      res.locals.course.id,
      res.locals.authn_user.user_id,
    ];
    sqldb.call('issues_update_open_all', params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;

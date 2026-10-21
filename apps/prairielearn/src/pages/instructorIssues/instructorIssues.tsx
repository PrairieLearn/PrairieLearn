import { Router } from 'express';
import SearchString from 'search-string';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryOptionalScalar,
  queryRows,
  queryScalar,
  queryScalars,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { idsEqual } from '../../lib/id.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { InstructorIssues, IssueRowSchema, PAGE_SIZE } from './instructorIssues.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function formatForLikeClause(str: string) {
  // https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
  return str
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
    .replaceAll('*', '%');
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
    filter_assessments: null as string[] | null,
    filter_not_assessments: null as string[] | null,
    filter_course_instances: null as string[] | null,
    filter_not_course_instances: null as string[] | null,
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
      case 'assessment':
        if (!option.negated) {
          filters.filter_assessments = filters.filter_assessments || [];
          filters.filter_assessments.push(formatForLikeClause(option.value));
        } else {
          filters.filter_not_assessments = filters.filter_not_assessments || [];
          filters.filter_not_assessments.push(formatForLikeClause(option.value));
        }
        break;
      case 'ci':
        if (!option.negated) {
          filters.filter_course_instances = filters.filter_course_instances || [];
          filters.filter_course_instances.push(formatForLikeClause(option.value));
        } else {
          filters.filter_not_course_instances = filters.filter_not_course_instances || [];
          filters.filter_not_course_instances.push(formatForLikeClause(option.value));
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
  const updated_issue_id = await queryOptionalScalar(
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
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const filterQuery = typeof req.query.q === 'string' ? req.query.q : 'is:open';

    const {
      authz_data: authzData,
      course,
      __csrf_token,
      urlPrefix,
    } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const [closedCount, openCount] = await queryScalars(
      sql.issues_count,
      { course_id: course.id },
      z.number(),
    );

    // Compute the IDs of the course instances to which the effective user has access.
    const course_instances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
    });
    const linkableCourseInstanceIds = new Set(course_instances.map((ci) => ci.id));

    // There are three situations in which the issue need not be anonymized.
    //
    // 1. For issues associated with a course instance other than the one
    //    through which we are accessing this page, we check if the user has
    //    student data view access in that course instance.
    const courseInstancesShowUserInfo: (string | null)[] = course_instances
      .filter(
        (ci) =>
          !(res.locals.course_instance && idsEqual(res.locals.course_instance.id, ci.id)) &&
          ci.has_course_instance_permission_view,
      )
      .map((ci) => ci.id);
    // 2. For issues associated with the course instance through which we are
    //    accessing this page: we use the permissions from authz_data. This is
    //    distinguished from situation 1 above to ensure effective user roles
    //    are taken into account.
    if (
      res.locals.course_instance &&
      'has_course_instance_permission_view' in res.locals.authz_data &&
      res.locals.authz_data.has_course_instance_permission_view
    ) {
      courseInstancesShowUserInfo.push(res.locals.course_instance.id);
    }
    // 3. For issues not associated with a course instance: the only way for a
    //    user to generate an issue that is not associated with a course
    //    instance is if they are an instructor. In this case, the user data is
    //    other instructors, so we only need to check that the effective user
    //    has course preview access, which is required to view the question
    //    preview in the first place.
    if (authzData.has_course_permission_preview) {
      courseInstancesShowUserInfo.push(null);
    }

    const queryPageNumber = Number(req.query.page);
    const filters = parseRawQuery(filterQuery);
    const offset = Number.isInteger(queryPageNumber)
      ? Math.max(0, (queryPageNumber - 1) * PAGE_SIZE)
      : 0;
    const issueRows = await queryRows(
      sql.select_issues,
      {
        course_id: course.id,
        offset,
        limit: PAGE_SIZE,
        course_instances_show_user_info: courseInstancesShowUserInfo,
        ...filters,
      },
      IssueRowSchema,
    );
    // If the offset is not zero and there are no returned issues, this
    // typically means the page number was incorrectly set to a value larger
    // than the number of actual issues. In this case, redirect to the same page
    // without setting the page number.
    if (offset > 0 && issueRows.length === 0) {
      res.redirect(`${getUrl(req).pathname}?q=${encodeURIComponent(filterQuery)}`);
      return;
    }

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

      showUser: courseInstancesShowUserInfo.includes(row.course_instance_id),
    }));

    const openFilteredIssuesCount = issueRows.reduce((acc, row) => (row.open ? acc + 1 : acc), 0);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Issues',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'issues',
        },
        options: {
          fullWidth: true,
        },
        headContent: compiledStylesheetTag('instructorIssues.css'),
        content: (
          <InstructorIssues
            issues={issues}
            filterQuery={filterQuery}
            openFilteredIssuesCount={openFilteredIssuesCount}
            openCount={openCount}
            closedCount={closedCount}
            chosenPage={queryPageNumber}
            urlPrefix={urlPrefix}
            csrfToken={__csrf_token}
            hasCoursePermissionEdit={authzData.has_course_permission_edit}
            hasCoursePermissionPreview={authzData.has_course_permission_preview}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a course editor)');
    }

    if (req.body.__action === 'open') {
      await updateIssueOpen(
        req.body.issue_id,
        true, // open status
        res.locals.course.id,
        res.locals.authn_user.id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'close') {
      await updateIssueOpen(
        req.body.issue_id,
        false, // open status
        res.locals.course.id,
        res.locals.authn_user.id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'close_matching') {
      const issueIds = req.body.unsafe_issue_ids.split(',').filter((id: string) => id !== '');
      const closedCount = await queryScalar(
        sql.close_issues,
        {
          issue_ids: issueIds,
          course_id: res.locals.course.id,
          authn_user_id: res.locals.authn_user.id,
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

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';

import { CommentPopover } from '../../../components/CommentPopover.js';
import type { CourseInstance, CourseInstanceAccessRule } from '../../../lib/db-types.js';

export function LegacyAccessRuleCard({
  accessRules,
  showComments,
  courseInstance,
  hasCourseInstancePermissionView,
}: {
  accessRules: CourseInstanceAccessRule[];
  showComments: boolean;
  courseInstance: CourseInstance;
  hasCourseInstancePermissionView: boolean;
}) {
  return (
    <>
      <div className="alert alert-warning" role="alert">
        <strong>Legacy Access Rules Active:</strong> This course instance is using the legacy
        <code>allowAccess</code> system. To use the new publishing system, you must first remove the{' '}
        <code>allowAccess</code> section from your course instance configuration. For more
        information, please see the{' '}
        <a href="https://docs.prairielearn.com/courseInstance/#migrating-from-allowaccess">
          migration documentation
        </a>
        .
      </div>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1>Access rules</h1>
        </div>

        <div className="table-responsive">
          <table className="table table-sm table-hover" aria-label="Access rules">
            <thead>
              <tr>
                {showComments && (
                  <th style={{ width: '1%' }}>
                    <span className="visually-hidden">Comments</span>
                  </th>
                )}
                <th>UIDs</th>
                <th>Start date</th>
                <th>End date</th>
                <th>Institution</th>
              </tr>
            </thead>
            <tbody>
              {accessRules.map((accessRule) => (
                <AccessRuleRow
                  key={accessRule.id}
                  accessRule={accessRule}
                  timeZone={courseInstance.display_timezone}
                  hasCourseInstancePermissionView={hasCourseInstancePermissionView}
                  showComments={showComments}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AccessRuleRow({
  accessRule,
  timeZone,
  hasCourseInstancePermissionView,
  showComments,
}: {
  accessRule: CourseInstanceAccessRule;
  timeZone: string;
  hasCourseInstancePermissionView: boolean;
  showComments: boolean;
}) {
  const uidContent = run(() => {
    if (accessRule.uids == null) {
      return '—';
    }

    if (hasCourseInstancePermissionView) {
      return accessRule.uids.join(', ');
    }

    // Only users with permission to view student data are allowed to
    // see the list of uids associated with an access rule. Note,
    // however, that any user with permission to view course code (or
    // with access to the course git repository) will be able to see the
    // list of uids, because these access rules are defined in course
    // code. This should be changed in future, to protect student data.
    return (
      <button
        type="button"
        className="btn btn-xs btn-warning"
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-placement="auto"
        data-bs-title="Hidden UIDs"
        data-bs-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
      >
        Hidden
      </button>
    );
  });

  return (
    <tr>
      {showComments && (
        <td>
          <CommentPopover comment={accessRule.json_comment} />
        </td>
      )}
      <td>{uidContent}</td>
      <td>{accessRule.start_date == null ? '—' : formatDate(accessRule.start_date, timeZone)}</td>
      <td>{accessRule.end_date == null ? '—' : formatDate(accessRule.end_date, timeZone)}</td>
      <td>{accessRule.institution ?? '—'}</td>
    </tr>
  );
}

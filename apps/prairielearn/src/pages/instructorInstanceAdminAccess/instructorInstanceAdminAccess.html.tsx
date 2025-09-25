import { formatDate } from '@prairielearn/formatter';
import { Hydrate } from '@prairielearn/preact/server';

import { CommentPopover } from '../../components/CommentPopover.js';
import { isRenderableComment } from '../../lib/comments.js';
import { convertAccessRuleToJson } from '../../lib/course-instance-access.js';
import {
  type CourseInstance,
  type CourseInstanceAccessControlExtension,
  type CourseInstanceAccessRule,
} from '../../lib/db-types.js';
import { type AccessRuleJson } from '../../schemas/infoCourseInstance.js';

import { AccessControlForm } from './components/AccessControlForm.js';
import { AccessControlMigrationModal } from './components/AccessControlMigrationModal.js';

export function InstructorInstanceAdminAccess({
  accessRules,
  accessControlExtensions,
  courseInstance,
  hasCourseInstancePermissionView,
  hasCourseInstancePermissionEdit,
  csrfToken,
  origHash,
}: {
  courseInstance: CourseInstance;
  hasCourseInstancePermissionView: boolean;
  hasCourseInstancePermissionEdit: boolean;
  accessRules: CourseInstanceAccessRule[];
  accessControlExtensions: CourseInstanceAccessControlExtension[];
  csrfToken: string;
  origHash: string;
}) {
  const showComments = accessRules.some((access_rule) =>
    isRenderableComment(access_rule.json_comment),
  );

  // Convert access rules to JSON format for the migration modal
  const accessRuleJsonArray: AccessRuleJson[] = accessRules.map((rule) =>
    convertAccessRuleToJson(rule, courseInstance.display_timezone),
  );

  return (
    <>
      <Hydrate>
        <AccessControlForm
          courseInstance={courseInstance}
          hasAccessRules={accessRules.length > 0}
          canEdit={hasCourseInstancePermissionEdit}
          csrfToken={csrfToken}
          origHash={origHash}
          accessControlExtensions={accessControlExtensions}
        />
      </Hydrate>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1>{courseInstance.long_name} course instance access rules</h1>
          {hasCourseInstancePermissionEdit &&
            hasCourseInstancePermissionView &&
            accessRules.length > 0 && (
              <Hydrate>
                <AccessControlMigrationModal
                  accessRules={accessRuleJsonArray}
                  csrfToken={csrfToken}
                  origHash={origHash}
                />
              </Hydrate>
            )}
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Access rules">
            <thead>
              <tr>
                {showComments && (
                  <th style="width: 1%">
                    <span class="visually-hidden">Comments</span>
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
  return (
    <tr>
      {showComments && (
        <td>
          <CommentPopover comment={accessRule.json_comment} />
        </td>
      )}
      <td>
        {accessRule.uids == null ? (
          '—'
        ) : // Only users with permission to view student data are allowed to
        // see the list of uids associated with an access rule. Note,
        // however, that any user with permission to view course code (or
        // with access to the course git repository) will be able to see the
        // list of uids, because these access rules are defined in course
        // code. This should be changed in future, to protect student data.
        hasCourseInstancePermissionView ? (
          accessRule.uids.join(', ')
        ) : (
          <button
            type="button"
            class="btn btn-xs btn-warning"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-placement="auto"
            data-bs-title="Hidden UIDs"
            data-bs-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
          >
            Hidden
          </button>
        )}
      </td>
      <td>{accessRule.start_date == null ? '—' : formatDate(accessRule.start_date, timeZone)}</td>
      <td>{accessRule.end_date == null ? '—' : formatDate(accessRule.end_date, timeZone)}</td>
      <td>{accessRule.institution ?? '—'}</td>
    </tr>
  );
}

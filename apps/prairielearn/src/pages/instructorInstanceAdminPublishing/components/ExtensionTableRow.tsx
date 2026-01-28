import { formatDateFriendly } from '@prairielearn/formatter';
import { OverlayTrigger } from '@prairielearn/ui';

import { ExpandableUserList } from '../../../components/ExpandableUserList.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import type { CourseInstancePublishingExtensionRow } from '../instructorInstanceAdminPublishing.types.js';

export function ExtensionTableRow({
  extension,
  courseInstance,
  canEdit,
  onDelete,
  onEdit,
}: {
  extension: CourseInstancePublishingExtensionRow;
  courseInstance: StaffCourseInstance;
  canEdit: boolean;
  onDelete: (extension: CourseInstancePublishingExtensionRow) => void;
  onEdit: (extension: CourseInstancePublishingExtensionRow) => void;
}) {
  // Check if extension end date is before the course instance end date
  const isBeforeInstanceEndDate =
    courseInstance.publishing_end_date &&
    extension.course_instance_publishing_extension.end_date < courseInstance.publishing_end_date;

  return (
    <tr>
      <td className="col-1 align-middle">
        {extension.course_instance_publishing_extension.name ? (
          <strong>{extension.course_instance_publishing_extension.name}</strong>
        ) : (
          <span className="text-muted">Unnamed</span>
        )}
      </td>
      <td className="col-1 align-middle text-nowrap">
        <div className="d-flex align-items-center gap-1">
          {formatDateFriendly(
            extension.course_instance_publishing_extension.end_date,
            courseInstance.display_timezone,
          )}
          {isBeforeInstanceEndDate && (
            <OverlayTrigger
              tooltip={{
                props: {
                  id: `extension-end-date-warning-${extension.course_instance_publishing_extension.id}`,
                },
                body: 'This date is before the course instance end date and will be ignored',
              }}
            >
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                aria-label="Extension will be ignored"
              >
                <i className="fas fa-exclamation-triangle text-warning" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          )}
        </div>
      </td>
      <td className="col-3 align-middle">
        <ExpandableUserList
          users={extension.user_data}
          courseInstanceId={courseInstance.id}
          nameFallback="dash"
          emptyText=""
        />
      </td>
      <td className="col-1 align-middle">
        <div className="d-flex gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => onEdit(extension)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => onDelete(extension)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

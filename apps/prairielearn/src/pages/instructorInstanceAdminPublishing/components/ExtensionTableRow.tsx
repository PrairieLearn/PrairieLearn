import { useState } from 'preact/compat';

import { formatDateFriendly } from '@prairielearn/formatter';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import type { CourseInstancePublishingExtensionWithUsers } from '../instructorInstanceAdminPublishing.types.js';

export function ExtensionTableRow({
  extension,
  courseInstance,
  canEdit,
  onDelete,
  onEdit,
}: {
  extension: CourseInstancePublishingExtensionWithUsers;
  courseInstance: StaffCourseInstance;
  canEdit: boolean;
  onDelete: (extension: CourseInstancePublishingExtensionWithUsers) => void;
  onEdit: (extension: CourseInstancePublishingExtensionWithUsers) => void;
}) {
  const [showAllStudents, setShowAllStudents] = useState(false);
  // Check if extension end date is before the course instance end date
  const isBeforeInstanceEndDate =
    courseInstance.publishing_end_date && extension.end_date < courseInstance.publishing_end_date;

  return (
    <tr>
      <td class="col-1 align-middle">
        {extension.name ? (
          <strong>{extension.name}</strong>
        ) : (
          <span class="text-muted">Unnamed</span>
        )}
      </td>
      <td class="col-1 align-middle text-nowrap">
        <div class="d-flex align-items-center gap-1">
          {formatDateFriendly(extension.end_date, courseInstance.display_timezone)}
          {isBeforeInstanceEndDate && (
            <OverlayTrigger
              tooltip={{
                props: { id: `extension-end-date-warning-${extension.id}` },
                body: 'This date is before the course instance end date and will be ignored',
              }}
            >
              <button
                type="button"
                class="btn btn-xs btn-ghost"
                aria-label="Extension will be ignored"
              >
                <i class="fas fa-exclamation-triangle text-warning" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          )}
        </div>
      </td>
      <td class="col-3 align-middle">
        <div>
          {(() => {
            const studentsToShow = showAllStudents
              ? extension.user_data
              : extension.user_data.slice(0, 3);
            const hasMoreStudents = extension.user_data.length > 3;

            return (
              <>
                {extension.user_data.length > 0 && (
                  <div class="d-flex flex-wrap align-items-center gap-2">
                    {studentsToShow.map((user, index) => (
                      <div key={user.uid}>
                        <a
                          href={getStudentEnrollmentUrl(courseInstance.id, user.enrollment_id)}
                          class="text-decoration-none"
                        >
                          {user.name || '—'}
                        </a>
                        {index < studentsToShow.length - 1 && ', '}
                      </div>
                    ))}
                    {hasMoreStudents && (
                      <button
                        key={`button-${showAllStudents ? 'show-less' : 'show-more'}`}
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        onClick={() => setShowAllStudents(!showAllStudents)}
                      >
                        {showAllStudents ? (
                          <>
                            <i class="fas fa-chevron-up" aria-hidden="true" /> Show Less
                          </>
                        ) : (
                          <>
                            <i class="fas fa-chevron-down" aria-hidden="true" /> +
                            {extension.user_data.length - 3} More
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </td>
      <td class="col-1 align-middle">
        <div class="d-flex gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                onClick={() => onEdit(extension)}
              >
                Edit
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
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

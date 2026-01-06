import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-bootstrap';
import z from 'zod';

import { formatDateFriendly } from '@prairielearn/formatter';
import { useModalState } from '@prairielearn/ui';

import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import {
  type CourseInstancePublishingExtensionRow,
  CourseInstancePublishingExtensionRowSchema,
} from '../instructorInstanceAdminPublishing.types.js';
import { dateToPlainDateTime } from '../utils/dateUtils.js';

import { ExtensionDeleteModal, type ExtensionDeleteModalData } from './ExtensionDeleteModal.js';
import { ExtensionModifyModal, type ExtensionModifyModalData } from './ExtensionModifyModal.js';
import { ExtensionTableRow } from './ExtensionTableRow.js';

export function PublishingExtensions({
  courseInstance,
  initialExtensions,
  canEdit,
  csrfToken,
}: {
  courseInstance: StaffCourseInstance;
  initialExtensions: CourseInstancePublishingExtensionRow[];
  canEdit: boolean;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();

  const extensionsQuery = useQuery<CourseInstancePublishingExtensionRow[]>({
    queryKey: ['extensions'],
    queryFn: async () => {
      const res = await fetch(window.location.pathname + '/extension/data.json');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message);
      }
      const parsedData = z.array(CourseInstancePublishingExtensionRowSchema).safeParse(data);
      if (!parsedData.success) throw new Error('Failed to parse extensions');
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData: initialExtensions,
  });

  // Check if we have extensions but no publish end date
  const hasExtensionsWithoutPublishDate =
    extensionsQuery.data.length > 0 && !courseInstance.publishing_end_date;

  // State for deleting extensions
  const modifyModalState = useModalState<ExtensionModifyModalData>(null);
  const deleteModalState = useModalState<ExtensionDeleteModalData>(null);

  const currentInstanceEndDate = courseInstance.publishing_end_date
    ? formatDateFriendly(courseInstance.publishing_end_date, courseInstance.display_timezone)
    : '—';
  return (
    <>
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 key={`extensions-header-${extensionsQuery.isFetching}`} className="mb-0">
            Extensions
            {extensionsQuery.isFetching && (
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading extensions...</span>
              </div>
            )}
          </h5>
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm text-nowrap"
              onClick={() =>
                modifyModalState.showWithData({
                  type: 'add',
                  endDate: courseInstance.publishing_end_date
                    ? dateToPlainDateTime(
                        courseInstance.publishing_end_date,
                        courseInstance.display_timezone,
                      ).toString()
                    : '',
                })
              }
            >
              Add extension
            </button>
          )}
        </div>
        <small className="text-muted">
          Extend access to specific users beyond the original end date. If multiple extensions apply
          to a user, the latest extension date will take effect. If an extension is before the end
          date, it will be ignored.
        </small>
      </div>

      {hasExtensionsWithoutPublishDate && (
        <Alert variant="warning" className="mb-3">
          <i className="fas fa-exclamation-triangle me-2" aria-hidden="true" />
          Extensions will not take effect until you set a publishing end date.
        </Alert>
      )}

      {extensionsQuery.isError ? (
        <Alert variant="danger" dismissible onClose={() => void extensionsQuery.refetch()}>
          {extensionsQuery.error.message}
        </Alert>
      ) : extensionsQuery.data.length === 0 ? (
        <div className="text-center text-muted mb-3">
          <p className="mb-0">No extensions configured.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped">
            <thead>
              <tr>
                <th className="col-1">Extension name</th>
                <th className="col-1">End date</th>
                <th className="col-3">Students</th>
                <th className="col-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {extensionsQuery.data.map((extension) => (
                <ExtensionTableRow
                  key={extension.course_instance_publishing_extension.id}
                  extension={extension}
                  courseInstance={courseInstance}
                  canEdit={canEdit}
                  onEdit={() =>
                    modifyModalState.showWithData({
                      type: 'edit',
                      endDate: dateToPlainDateTime(
                        extension.course_instance_publishing_extension.end_date,
                        courseInstance.display_timezone,
                      ).toString(),
                      extensionId: extension.course_instance_publishing_extension.id,
                      name: extension.course_instance_publishing_extension.name ?? '',
                      uids: extension.user_data
                        .map((u) => u.uid)
                        .sort()
                        .join('\n'),
                    })
                  }
                  onDelete={() =>
                    deleteModalState.showWithData({
                      extensionId: extension.course_instance_publishing_extension.id,
                      extensionName: extension.course_instance_publishing_extension.name,
                      userData: extension.user_data,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExtensionModifyModal
        {...modifyModalState}
        currentUnpublishText={currentInstanceEndDate}
        courseInstanceEndDate={courseInstance.publishing_end_date}
        courseInstanceTimezone={courseInstance.display_timezone}
        csrfToken={csrfToken}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['extensions'] });
          modifyModalState.hide();
        }}
      />

      <ExtensionDeleteModal
        {...deleteModalState}
        csrfToken={csrfToken}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['extensions'] });
          deleteModalState.hide();
        }}
      />
    </>
  );
}

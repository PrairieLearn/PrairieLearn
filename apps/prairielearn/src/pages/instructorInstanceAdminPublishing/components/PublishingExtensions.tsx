import { useState } from 'preact/compat';
import { Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { formatDateFriendly } from '@prairielearn/formatter';

import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type CourseInstance } from '../../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-publishing-extensions.types.js';
import { dateToDatetimeLocalString } from '../utils/dateUtils.js';

interface PublishingExtensionsProps {
  courseInstance: CourseInstance;
  extensions: CourseInstancePublishingExtensionWithUsers[];
  canEdit: boolean;
  csrfToken: string;
}

export function PublishingExtensions({
  courseInstance,
  extensions,
  canEdit,
  csrfToken,
}: PublishingExtensionsProps) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingExtensionId, setEditingExtensionId] = useState<string | null>(null);
  const [editingExtensionData, setEditingExtensionData] = useState<{
    name: string;
    archiveDate: string;
  }>({ name: '', archiveDate: '' });
  const [newUserUid, setNewUserUid] = useState('');
  const [showAllStudents, setShowAllStudents] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newExtensionData, setNewExtensionData] = useState<{
    name: string;
    archiveDate: string;
    uids: string;
  }>({ name: '', archiveDate: '', uids: '' });

  const handleDelete = async (extensionId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this extension?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'delete_extension',
        extension_id: extensionId,
      };

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        throw new Error('Failed to delete extension');
      }
    } catch (error) {
      console.error('Error deleting extension:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to delete extension. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveStudent = async (extensionId: string, uid: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to remove this student from the extension?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('__action', 'remove_student_from_extension');
      formData.append('extension_id', extensionId);
      formData.append('uid', uid);

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (response.ok) {
        window.location.reload();
      } else {
        throw new Error('Failed to remove student from extension');
      }
    } catch (error) {
      console.error('Error removing student from extension:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to remove student from extension. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditExtension = (extension: CourseInstancePublishingExtensionWithUsers) => {
    setEditingExtensionId(extension.id);
    // Convert Date to YYYY-MM-DDTHH:mm:ss format for datetime-local input
    const archiveDate = dateToDatetimeLocalString(extension.archive_date);
    setEditingExtensionData({
      name: extension.name || '',
      archiveDate,
    });
  };

  const handleSaveExtension = async (extensionId: string) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('__action', 'update_extension');
      formData.append('extension_id', extensionId);
      formData.append('name', editingExtensionData.name.trim() || '');
      formData.append('archive_date', editingExtensionData.archiveDate || '');

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (response.ok) {
        window.location.reload();
      } else {
        throw new Error('Failed to update extension');
      }
    } catch (error) {
      console.error('Error updating extension:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to update extension. Please try again.');
    } finally {
      setIsSubmitting(false);
      setEditingExtensionId(null);
      setEditingExtensionData({ name: '', archiveDate: '' });
    }
  };

  const handleCancelEdit = () => {
    setEditingExtensionId(null);
    setEditingExtensionData({ name: '', archiveDate: '' });
  };

  const handleSaveUserToExtension = async (extensionId: string) => {
    if (!newUserUid.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Parse multiple UIDs (comma, space, or newline separated)
      const uids = newUserUid
        .split(/[,\s\n]+/)
        .map((uid) => uid.trim())
        .filter((uid) => uid.length > 0);

      if (uids.length === 0) {
        return;
      }

      // Add each UID to the extension
      for (const uid of uids) {
        const formData = new FormData();
        formData.append('__action', 'add_user_to_extension');
        formData.append('extension_id', extensionId);
        formData.append('uid', uid);

        const response = await fetch(window.location.pathname, {
          method: 'POST',
          headers: {
            'X-CSRF-Token': csrfToken,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to add user ${uid} to extension`);
        }
      }

      window.location.reload();
    } catch (error) {
      console.error('Error adding user to extension:', error);
      setErrorMessage(
        `Failed to add user to extension: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsSubmitting(false);
      setNewUserUid('');
    }
  };

  const handleToggleShowAllStudents = (extensionId: string) => {
    setShowAllStudents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(extensionId)) {
        newSet.delete(extensionId);
      } else {
        newSet.add(extensionId);
      }
      return newSet;
    });
  };

  const handleCreateExtension = async () => {
    if (!newExtensionData.archiveDate.trim() || !newExtensionData.uids.trim()) {
      setErrorMessage('Archive date and UIDs are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('__action', 'add_extension');
      formData.append('name', newExtensionData.name.trim());
      formData.append('archive_date', newExtensionData.archiveDate);
      formData.append('uids', newExtensionData.uids.trim());

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (response.ok) {
        window.location.reload();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create extension');
      }
    } catch (error) {
      console.error('Error creating extension:', error);
      setErrorMessage(
        `Failed to create extension: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAddExtension = () => {
    setShowAddRow(false);
    setNewExtensionData({ name: '', archiveDate: '', uids: '' });
    setErrorMessage(null);
  };

  return (
    <>
      <div class="mb-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h5 class="mb-0">Extensions</h5>
          {canEdit && !showAddRow && (
            <button
              type="button"
              class="btn btn-outline-primary btn-sm text-nowrap"
              disabled={isSubmitting}
              onClick={() => setShowAddRow(true)}
            >
              Add Extension
            </button>
          )}
        </div>
        <small class="text-muted">
          Extend access to specific users beyond the original archive date. If multiple extensions
          apply to a user, the latest extension date will take effect. If an extension is before the
          archive date, it will be ignored.
        </small>
      </div>

      {extensions.length === 0 && !showAddRow && (
        <div class="text-center text-muted mb-3">
          <p class="mb-0">No extensions configured.</p>
        </div>
      )}
      {errorMessage && (
        <Alert variant="danger" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
      {extensions.length > 0 && (
        <div class="table-responsive">
          <table class="table table-striped">
            <thead>
              <tr>
                <th class="col-1">Extension Name</th>
                <th class="col-1">Archive Date</th>
                <th class="col-3">Students</th>
                <th class="col-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {extensions.map((extension, idx) => (
                <ExtensionTableRow
                  key={extension.id}
                  idx={idx}
                  extension={extension}
                  courseInstance={courseInstance}
                  timeZone={courseInstance.display_timezone}
                  canEdit={canEdit}
                  isSubmitting={isSubmitting}
                  courseInstanceArchiveDate={courseInstance.publishing_archive_date}
                  editingExtensionId={editingExtensionId}
                  editingExtensionData={editingExtensionData}
                  newUserUid={newUserUid}
                  showAllStudents={showAllStudents}
                  onDelete={handleDelete}
                  onRemoveStudent={handleRemoveStudent}
                  onEditExtension={handleEditExtension}
                  onSaveExtension={handleSaveExtension}
                  onCancelEdit={handleCancelEdit}
                  onEditingExtensionDataChange={setEditingExtensionData}
                  onSaveUserToExtension={handleSaveUserToExtension}
                  onNewUserUidChange={setNewUserUid}
                  onToggleShowAllStudents={handleToggleShowAllStudents}
                />
              ))}
              {showAddRow && (
                <tr>
                  <td class="col-1">
                    <input
                      type="text"
                      class="form-control form-control-sm"
                      placeholder="Extension name (optional)"
                      value={newExtensionData.name}
                      onChange={(e) =>
                        setNewExtensionData({
                          ...newExtensionData,
                          name: (e.target as HTMLInputElement).value,
                        })
                      }
                    />
                  </td>
                  <td class="col-1">
                    <input
                      type="datetime-local"
                      class="form-control form-control-sm"
                      step="1"
                      value={newExtensionData.archiveDate}
                      onChange={(e) =>
                        setNewExtensionData({
                          ...newExtensionData,
                          archiveDate: (e.target as HTMLInputElement).value,
                        })
                      }
                    />
                  </td>
                  <td class="col-3">
                    <textarea
                      class="form-control form-control-sm"
                      placeholder="Enter UIDs (one per line, or comma/space separated)"
                      rows={3}
                      value={newExtensionData.uids}
                      onChange={(e) =>
                        setNewExtensionData({
                          ...newExtensionData,
                          uids: (e.target as HTMLTextAreaElement).value,
                        })
                      }
                    />
                  </td>
                  <td class="col-1">
                    <div class="d-flex gap-1">
                      <button
                        type="button"
                        class="btn btn-sm btn-success"
                        disabled={
                          isSubmitting ||
                          !newExtensionData.archiveDate.trim() ||
                          !newExtensionData.uids.trim()
                        }
                        onClick={handleCreateExtension}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        disabled={isSubmitting}
                        onClick={handleCancelAddExtension}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ExtensionTableRow({
  idx: _idx,
  extension,
  courseInstance,
  timeZone,
  canEdit,
  onDelete,
  onRemoveStudent,
  isSubmitting,
  courseInstanceArchiveDate,
  editingExtensionId,
  editingExtensionData,
  onEditExtension,
  onSaveExtension,
  onCancelEdit,
  onEditingExtensionDataChange,
  newUserUid,
  onSaveUserToExtension,
  onNewUserUidChange,
  showAllStudents,
  onToggleShowAllStudents,
}: {
  idx: number;
  extension: CourseInstancePublishingExtensionWithUsers;
  courseInstance: CourseInstance;
  timeZone: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onRemoveStudent: (extensionId: string, uid: string) => void;
  isSubmitting: boolean;
  courseInstanceArchiveDate: Date | null;
  editingExtensionId: string | null;
  editingExtensionData: { name: string; archiveDate: string };
  onEditExtension: (extension: CourseInstancePublishingExtensionWithUsers) => void;
  onSaveExtension: (extensionId: string) => void;
  onCancelEdit: () => void;
  onEditingExtensionDataChange: (data: { name: string; archiveDate: string }) => void;
  newUserUid: string;
  onSaveUserToExtension: (extensionId: string) => void;
  onNewUserUidChange: (uid: string) => void;
  showAllStudents: Set<string>;
  onToggleShowAllStudents: (extensionId: string) => void;
}) {
  // Check if extension archive date is before the course instance archive date
  const isBeforeInstanceArchiveDate =
    courseInstanceArchiveDate &&
    new Date(extension.archive_date) < new Date(courseInstanceArchiveDate);

  return (
    <tr>
      <td class="col-1">
        {editingExtensionId === extension.id ? (
          <input
            type="text"
            class="form-control form-control-sm"
            value={editingExtensionData.name}
            onChange={(e) =>
              onEditingExtensionDataChange({
                ...editingExtensionData,
                name: (e.target as HTMLInputElement).value,
              })
            }
          />
        ) : extension.name ? (
          <strong>{extension.name}</strong>
        ) : (
          <span class="text-muted">Unnamed</span>
        )}
      </td>
      <td class="col-1">
        {editingExtensionId === extension.id ? (
          <input
            type="datetime-local"
            class="form-control form-control-sm"
            step="1"
            value={editingExtensionData.archiveDate}
            onChange={(e) =>
              onEditingExtensionDataChange({
                ...editingExtensionData,
                archiveDate: (e.target as HTMLInputElement).value,
              })
            }
          />
        ) : (
          <span>
            {formatDateFriendly(extension.archive_date, timeZone)}
            {isBeforeInstanceArchiveDate && (
              <>
                {' '}
                <i
                  class="fas fa-exclamation-triangle text-warning"
                  aria-label="Warning: This date will be ignored"
                />
              </>
            )}
          </span>
        )}
      </td>
      <td class="col-3">
        <div>
          {(() => {
            const isShowingAll = showAllStudents.has(extension.id);
            const studentsToShow = isShowingAll
              ? extension.user_data
              : extension.user_data.slice(0, 3);
            const hasMoreStudents = extension.user_data.length > 3;

            return (
              <>
                {extension.user_data.length > 0 && (
                  <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                    {studentsToShow.map(
                      (user: { uid: string; name: string | null; enrollment_id: string }) => (
                        <div key={user.uid} class="d-flex align-items-center gap-1">
                          <a
                            href={getStudentEnrollmentUrl(
                              `/pl/course_instance/${courseInstance.id}/instructor`,
                              user.enrollment_id,
                            )}
                            class="text-decoration-none"
                          >
                            {user.name || '—'}
                          </a>
                          {canEdit && editingExtensionId === extension.id && (
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`remove-student-${user.uid}`}>
                                  Remove student from extension
                                </Tooltip>
                              }
                            >
                              <button
                                type="button"
                                class="btn btn-sm"
                                style="border: none; background: none; color: #dc3545; padding: 0.25rem;"
                                disabled={isSubmitting}
                                onClick={() => onRemoveStudent(extension.id, user.uid)}
                              >
                                <i class="fas fa-times fa-xs" aria-hidden="true" />
                              </button>
                            </OverlayTrigger>
                          )}
                        </div>
                      ),
                    )}
                    {hasMoreStudents && (
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        onClick={() => onToggleShowAllStudents(extension.id)}
                      >
                        {isShowingAll ? (
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
                {canEdit && editingExtensionId === extension.id && (
                  <div class="d-flex align-items-start gap-1">
                    <textarea
                      class="form-control form-control-sm"
                      placeholder="Enter UIDs (one per line, or comma/space separated)"
                      rows={3}
                      value={newUserUid}
                      onChange={(e) => onNewUserUidChange((e.target as HTMLTextAreaElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          onSaveUserToExtension(extension.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn-sm btn-success"
                      disabled={isSubmitting || !newUserUid.trim()}
                      title="Add users to extension (Ctrl+Enter)"
                      onClick={() => onSaveUserToExtension(extension.id)}
                    >
                      <i class="fas fa-plus" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </td>
      <td class="col-1">
        <div class="d-flex gap-1">
          {canEdit && (
            <>
              {editingExtensionId === extension.id ? (
                <>
                  <button
                    type="button"
                    class="btn btn-sm btn-success"
                    disabled={isSubmitting}
                    onClick={() => onSaveExtension(extension.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    disabled={isSubmitting}
                    onClick={onCancelEdit}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary"
                  disabled={isSubmitting}
                  onClick={() => onEditExtension(extension)}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                disabled={isSubmitting}
                onClick={() => onDelete(extension.id)}
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

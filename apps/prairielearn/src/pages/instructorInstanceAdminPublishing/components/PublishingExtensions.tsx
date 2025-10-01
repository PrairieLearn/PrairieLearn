import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { formatDateFriendly } from '@prairielearn/formatter';

import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type CourseInstance } from '../../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-publishing-extensions.types.js';

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingExtensionId, setEditingExtensionId] = useState<string | null>(null);
  const [editingExtensionData, setEditingExtensionData] = useState<{
    name: string;
    archiveDate: string;
  }>({ name: '', archiveDate: '' });
  const [addingUserToExtension, setAddingUserToExtension] = useState<string | null>(null);
  const [newUserUid, setNewUserUid] = useState('');
  const [showAllStudents, setShowAllStudents] = useState<Set<string>>(new Set());

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
    // Convert Date to YYYY-MM-DD format for date input
    let archiveDate = '';
    if (extension.archive_date) {
      const year = extension.archive_date.getFullYear();
      const month = String(extension.archive_date.getMonth() + 1).padStart(2, '0');
      const day = String(extension.archive_date.getDate()).padStart(2, '0');
      archiveDate = `${year}-${month}-${day}`;
    }
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

  const handleAddUserToExtension = (extensionId: string) => {
    setAddingUserToExtension(extensionId);
    setNewUserUid('');
  };

  const handleSaveUserToExtension = async (extensionId: string) => {
    if (!newUserUid.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('__action', 'add_user_to_extension');
      formData.append('extension_id', extensionId);
      formData.append('uid', newUserUid.trim());

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
        throw new Error(errorData.message || 'Failed to add user to extension');
      }
    } catch (error) {
      console.error('Error adding user to extension:', error);
      // eslint-disable-next-line no-alert
      alert(
        `Failed to add user to extension: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsSubmitting(false);
      setAddingUserToExtension(null);
      setNewUserUid('');
    }
  };

  const handleCancelAddUser = () => {
    setAddingUserToExtension(null);
    setNewUserUid('');
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

  return (
    <>
      <div class="mb-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h5 class="mb-0">Extensions</h5>
          {canEdit && (
            <button
              type="button"
              class="btn btn-outline-primary btn-sm text-nowrap"
              disabled={isSubmitting}
              onClick={() => setShowAddForm(true)}
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

      {extensions.length === 0 && !showAddForm && (
        <div class="text-center text-muted mb-3">
          <p class="mb-0">No extensions configured.</p>
        </div>
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
                  addingUserToExtension={addingUserToExtension}
                  newUserUid={newUserUid}
                  showAllStudents={showAllStudents}
                  onDelete={handleDelete}
                  onRemoveStudent={handleRemoveStudent}
                  onEditExtension={handleEditExtension}
                  onSaveExtension={handleSaveExtension}
                  onCancelEdit={handleCancelEdit}
                  onEditingExtensionDataChange={setEditingExtensionData}
                  onAddUserToExtension={handleAddUserToExtension}
                  onSaveUserToExtension={handleSaveUserToExtension}
                  onCancelAddUser={handleCancelAddUser}
                  onNewUserUidChange={setNewUserUid}
                  onToggleShowAllStudents={handleToggleShowAllStudents}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <div class="card mt-3">
          <div class="card-header">
            <h6 class="mb-0">Add Extension</h6>
          </div>
          <div class="card-body">
            <AddExtensionForm csrfToken={csrfToken} onClose={() => setShowAddForm(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function ExtensionTableRow({
  idx,
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
  addingUserToExtension,
  newUserUid,
  onAddUserToExtension,
  onSaveUserToExtension,
  onCancelAddUser,
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
  addingUserToExtension: string | null;
  newUserUid: string;
  onAddUserToExtension: (extensionId: string) => void;
  onSaveUserToExtension: (extensionId: string) => void;
  onCancelAddUser: () => void;
  onNewUserUidChange: (uid: string) => void;
  showAllStudents: Set<string>;
  onToggleShowAllStudents: (extensionId: string) => void;
}) {
  // Check if extension archive date is before the course instance archive date
  const isBeforeInstanceArchiveDate =
    extension.archive_date &&
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
            type="date"
            class="form-control form-control-sm"
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
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id={`tooltip-${extension.id}`}>
                      This date will be ignored, it is before the overall archive date
                    </Tooltip>
                  }
                >
                  <i
                    class="fas fa-exclamation-triangle text-warning"
                    aria-label="Warning: This date will be ignored"
                  />
                </OverlayTrigger>
              </>
            )}
          </span>
        )}
      </td>
      <td class="col-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          {(() => {
            const isShowingAll = showAllStudents.has(extension.id);
            const studentsToShow = isShowingAll
              ? extension.user_data
              : extension.user_data.slice(0, 3);
            const hasMoreStudents = extension.user_data.length > 3;

            return (
              <>
                {studentsToShow.map(
                  (user: { uid: string; name: string | null; enrollment_id: string }) => (
                    <div key={user.uid} class="d-flex align-items-center gap-1">
                      <OverlayTrigger
                        placement="top"
                        overlay={
                          <Tooltip
                            id={`tooltip-${user.enrollment_id}`}
                            style={{ whiteSpace: 'nowrap', width: 'auto' }}
                          >
                            {user.uid}
                          </Tooltip>
                        }
                      >
                        <a
                          href={getStudentEnrollmentUrl(
                            `/pl/course_instance/${courseInstance.id}/instructor`,
                            user.enrollment_id,
                          )}
                          class="text-decoration-none"
                        >
                          {user.name || '—'}
                        </a>
                      </OverlayTrigger>
                      {canEdit && editingExtensionId === extension.id && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger"
                          disabled={isSubmitting}
                          title="Remove student from extension"
                          onClick={() => onRemoveStudent(extension.id, user.uid)}
                        >
                          <i class="fas fa-times" aria-hidden="true" />
                        </button>
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
                {canEdit && (
                  <div class="d-flex align-items-center gap-1">
                    {addingUserToExtension === extension.id ? (
                      <>
                        <input
                          type="text"
                          class="form-control form-control-sm"
                          placeholder="Enter UID"
                          value={newUserUid}
                          autoFocus
                          onChange={(e) => onNewUserUidChange((e.target as HTMLInputElement).value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onSaveUserToExtension(extension.id);
                            } else if (e.key === 'Escape') {
                              onCancelAddUser();
                            }
                          }}
                        />
                        <button
                          type="button"
                          class="btn btn-sm btn-success"
                          disabled={isSubmitting || !newUserUid.trim()}
                          title="Add user to extension"
                          onClick={() => onSaveUserToExtension(extension.id)}
                        >
                          <i class="fas fa-plus" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary"
                          disabled={isSubmitting}
                          title="Cancel"
                          onClick={onCancelAddUser}
                        >
                          <i class="fas fa-times" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-success"
                        disabled={isSubmitting}
                        title="Add user to extension"
                        onClick={() => onAddUserToExtension(extension.id)}
                      >
                        <i class="fas fa-plus" aria-hidden="true" />
                      </button>
                    )}
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

function AddExtensionForm({ csrfToken, onClose }: { csrfToken: string; onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    archive_date: '',
    uids: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showError, setShowError] = useState(false);

  const addExtensionMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'add_extension',
        name: data.name,
        enabled: 'true',
        archive_date: data.archive_date || '',
        uids: data.uids,
      };

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // Get the response body as text first
        const responseText = await response.text();

        try {
          // Try to parse as JSON
          const errorData = JSON.parse(responseText);

          // Handle field-specific errors
          if (errorData.errors) {
            setErrors(errorData.errors);
            setShowError(true);
            throw new Error('Validation errors occurred');
          }

          // Handle general error with message
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // If JSON parsing fails, use the text response as the error message
          if (responseText.trim()) {
            errorMessage = responseText;
          }
        }

        setErrors({ general: errorMessage });
        setShowError(true);
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      // Reload the page to show the new extension
      window.location.reload();
    },
    onError: (error: Error) => {
      console.error('Error adding extension:', error);
      if (!errors.general) {
        setErrors({ general: error.message });
        setShowError(true);
      }
    },
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrors({});
    setShowError(false);
    addExtensionMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {showError && errors.general && (
        <Alert variant="danger" dismissible onClose={() => setShowError(false)}>
          {errors.general}
        </Alert>
      )}

      <div class="row">
        <div class="col-md-12">
          <div class="mb-3">
            <label for="extension-name" class="form-label">
              Name
            </label>
            <input
              type="text"
              class="form-control"
              id="extension-name"
              value={formData.name}
              placeholder="Optional name for this extension"
              onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
            />
            {errors.name && <div class="invalid-feedback d-block">{errors.name}</div>}
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col-md-6">
          <div class="mb-3">
            <label for="extension-archive-date" class="form-label">
              Archive Date
            </label>
            <input
              type="datetime-local"
              class="form-control"
              id="extension-archive-date"
              value={formData.archive_date}
              required
              onChange={(e) => setFormData({ ...formData, archive_date: e.currentTarget.value })}
            />
            {errors.archive_date && (
              <div class="invalid-feedback d-block">{errors.archive_date}</div>
            )}
          </div>
        </div>
        <div class="col-md-6">
          <div class="mb-3">
            <label for="extension-uids" class="form-label">
              User UIDs
            </label>
            <textarea
              class="form-control"
              id="extension-uids"
              rows={3}
              value={formData.uids}
              placeholder="user@example.com, another@example.com"
              required
              onChange={(e) => setFormData({ ...formData, uids: e.currentTarget.value })}
            />
            <div class="form-text">
              Enter email addresses (UIDs) of users, one per line or separated by commas.
            </div>
            {errors.uids && <div class="invalid-feedback d-block">{errors.uids}</div>}
          </div>
        </div>
      </div>

      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-secondary"
          disabled={addExtensionMutation.isPending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn btn-primary text-nowrap"
          disabled={addExtensionMutation.isPending}
        >
          {addExtensionMutation.isPending ? 'Adding...' : 'Add Extension'}
        </button>
      </div>
    </form>
  );
}

import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, ListGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { formatDateFriendly } from '@prairielearn/formatter';

import { type CourseInstance } from '../../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-access-control-extensions.types.js';

interface AccessControlExtensionsProps {
  courseInstance: CourseInstance;
  extensions: CourseInstancePublishingExtensionWithUsers[];
  canEdit: boolean;
  csrfToken: string;
}

export function AccessControlExtensions({
  courseInstance,
  extensions,
  canEdit,
  csrfToken,
}: AccessControlExtensionsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleToggleEnabled = async (extensionId: string, enabled: boolean) => {
    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'toggle_extension',
        extension_id: extensionId,
        enabled: enabled.toString(),
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
        throw new Error('Failed to toggle extension');
      }
    } catch (error) {
      console.error('Error toggling extension:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to toggle extension. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
          <p class="mb-0">No access control extensions configured.</p>
        </div>
      )}
      {extensions.length > 0 && (
        <ListGroup>
          {extensions.map((extension, idx) => (
            <ExtensionListItem
              key={extension.id}
              idx={idx}
              extension={extension}
              timeZone={courseInstance.display_timezone}
              canEdit={canEdit}
              isSubmitting={isSubmitting}
              courseInstanceArchiveDate={courseInstance.publishing_archive_date}
              onDelete={handleDelete}
              onToggleEnabled={handleToggleEnabled}
            />
          ))}
        </ListGroup>
      )}

      {showAddForm && (
        <div class="card mt-3">
          <div class="card-header">
            <h6 class="mb-0">Add Access Control Extension</h6>
          </div>
          <div class="card-body">
            <AddExtensionForm csrfToken={csrfToken} onClose={() => setShowAddForm(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function ExtensionListItem({
  idx,
  extension,
  timeZone,
  canEdit,
  onDelete,
  onToggleEnabled,
  isSubmitting,
  courseInstanceArchiveDate,
}: {
  idx: number;
  extension: CourseInstancePublishingExtensionWithUsers;
  timeZone: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  isSubmitting: boolean;
  courseInstanceArchiveDate: Date | null;
}) {
  // Check if extension archive date is before the course instance archive date
  const isBeforeInstanceArchiveDate =
    extension.archive_date &&
    courseInstanceArchiveDate &&
    new Date(extension.archive_date) < new Date(courseInstanceArchiveDate);

  return (
    <ListGroup.Item>
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center mb-2">
            <h4 class="mb-0 me-3">{extension.name || `Extension ${idx + 1}`}</h4>
          </div>

          <div class="mb-2">
            <strong>Archive Date:</strong> {formatDateFriendly(extension.archive_date, timeZone)}
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
          </div>

          <div>
            {extension.user_data.length > 0 ? (
              <details>
                <summary class="mb-1">
                  <strong>Students with extension ({extension.user_data.length})</strong>
                </summary>
                <div class="mt-2">
                  {extension.user_data.map((user: { uid: string; name: string | null }) => (
                    <span key={user.uid} class="badge bg-secondary me-1 mb-1">
                      {user.name ? `${user.name} (${user.uid})` : user.uid}
                    </span>
                  ))}
                </div>
              </details>
            ) : (
              <div class="mb-1">
                <strong>Students with extension (0)</strong>
                <span class="text-muted ms-2">No users assigned</span>
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div class="ms-3 d-flex gap-2">
            {extension.user_data.length > 0 && (
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                title="Copy UIDs as comma-separated list"
                onClick={() => {
                  const uids = extension.user_data
                    .map((user: { uid: string; name: string | null }) => user.uid)
                    .join(', ');
                  navigator.clipboard
                    .writeText(uids)
                    .then(() => {
                      // Could add a toast notification here if desired
                    })
                    .catch((err) => {
                      console.error('Failed to copy UIDs:', err);
                    });
                }}
              >
                <i class="fas fa-copy" aria-hidden="true" />
                Copy UIDs
              </button>
            )}
            <button
              type="button"
              class={`btn btn-sm ${extension.enabled ? 'btn-outline-danger' : 'btn-outline-success'}`}
              disabled={isSubmitting}
              onClick={() => onToggleEnabled(extension.id, !extension.enabled)}
            >
              {extension.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              disabled={isSubmitting}
              onClick={() => onDelete(extension.id)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </ListGroup.Item>
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
          if (responseText?.trim()) {
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

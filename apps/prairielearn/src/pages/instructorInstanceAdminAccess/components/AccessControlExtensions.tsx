import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { formatDateFriendly } from '@prairielearn/formatter';

import {
  type CourseInstance,
  type CourseInstanceAccessControlExtension,
} from '../../../lib/db-types.js';

interface AccessControlExtensionsProps {
  courseInstance: CourseInstance;
  extensions: CourseInstanceAccessControlExtension[];
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
          <h5 class="mb-0">Access Control Extensions</h5>
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
        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Access control extensions">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Archive Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {extensions.map((extension) => (
                <ExtensionRow
                  key={extension.id}
                  extension={extension}
                  timeZone={courseInstance.display_timezone}
                  canEdit={canEdit}
                  isSubmitting={isSubmitting}
                  courseInstanceArchiveDate={courseInstance.access_control_archive_date}
                  onDelete={handleDelete}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </tbody>
          </table>
        </div>
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

function ExtensionRow({
  extension,
  timeZone,
  canEdit,
  onDelete,
  onToggleEnabled,
  isSubmitting,
  courseInstanceArchiveDate,
}: {
  extension: CourseInstanceAccessControlExtension;
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
    <tr>
      <td>{extension.name || <em class="text-muted">Unnamed extension</em>}</td>
      <td>
        <div class="form-check form-switch">
          <input
            class="form-check-input"
            type="checkbox"
            checked={extension.enabled}
            disabled={!canEdit || isSubmitting}
            onChange={(e) => onToggleEnabled(extension.id, e.currentTarget.checked)}
          />
          <label class="form-check-label">{extension.enabled ? 'Enabled' : 'Disabled'}</label>
        </div>
      </td>
      <td>
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
      </td>
      <td>
        {canEdit && (
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            disabled={isSubmitting}
            onClick={() => onDelete(extension.id)}
          >
            Delete
          </button>
        )}
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

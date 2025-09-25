import { useState } from 'preact/compat';

import {
  type CourseInstance,
  type CourseInstanceAccessControlExtension,
} from '../../../lib/db-types.js';

interface AccessControlOverridesProps {
  courseInstance: CourseInstance;
  overrides: CourseInstanceAccessControlExtension[];
  canEdit: boolean;
  csrfToken: string;
}

export function AccessControlOverrides({
  courseInstance,
  overrides,
  canEdit,
  csrfToken,
}: AccessControlOverridesProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async (overrideId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this extension?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'delete_override',
        override_id: overrideId,
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

  const handleToggleEnabled = async (overrideId: string, enabled: boolean) => {
    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'toggle_override',
        override_id: overrideId,
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
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="mb-0">Access Control Extensions</h5>
        {canEdit && (
          <button
            type="button"
            class="btn btn-outline-primary btn-sm"
            disabled={isSubmitting}
            onClick={() => setShowAddForm(true)}
          >
            Add Extension
          </button>
        )}
      </div>

      {overrides.length === 0 ? (
        <div class="text-center text-muted mb-3">
          <p class="mb-0">No access control extensions configured.</p>
        </div>
      ) : (
        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Access control extensions">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>End Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => (
                <OverrideRow
                  key={override.id}
                  override={override}
                  timeZone={courseInstance.display_timezone}
                  canEdit={canEdit}
                  isSubmitting={isSubmitting}
                  onDelete={handleDelete}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <AddOverrideForm csrfToken={csrfToken} onClose={() => setShowAddForm(false)} />
      )}
    </>
  );
}

function OverrideRow({
  override,
  timeZone,
  canEdit,
  onDelete,
  onToggleEnabled,
  isSubmitting,
}: {
  override: CourseInstanceAccessControlExtension;
  timeZone: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  isSubmitting: boolean;
}) {
  return (
    <tr>
      <td>{override.name || <em class="text-muted">Unnamed extension</em>}</td>
      <td>
        <div class="form-check form-switch">
          <input
            class="form-check-input"
            type="checkbox"
            checked={override.enabled}
            disabled={!canEdit || isSubmitting}
            onChange={(e) => onToggleEnabled(override.id, e.currentTarget.checked)}
          />
          <label class="form-check-label">{override.enabled ? 'Enabled' : 'Disabled'}</label>
        </div>
      </td>
      <td>
        {override.published_end_date == null
          ? '—'
          : formatDate(override.published_end_date, timeZone)}
      </td>
      <td>
        {canEdit && (
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            disabled={isSubmitting}
            onClick={() => onDelete(override.id)}
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

function AddOverrideForm({ csrfToken, onClose }: { csrfToken: string; onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    published_end_date: '',
    uids: '',
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'add_override',
        name: formData.name,
        enabled: formData.enabled.toString(),
        published_end_date: formData.published_end_date || '',
        uids: formData.uids,
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
        throw new Error('Failed to add extension');
      }
    } catch (error) {
      console.error('Error adding extension:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to add extension. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div class="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Add Access Control Extension</h5>
            <button type="button" class="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div class="modal-body">
              <div class="mb-3">
                <label for="override-name" class="form-label">
                  Name
                </label>
                <input
                  type="text"
                  class="form-control"
                  id="override-name"
                  value={formData.name}
                  placeholder="Optional name for this extension"
                  onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                />
              </div>

              <div class="mb-3">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="override-enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.currentTarget.checked })}
                  />
                  <label class="form-check-label" for="override-enabled">
                    Enabled
                  </label>
                </div>
              </div>

              <div class="mb-3">
                <label for="override-end-date" class="form-label">
                  End Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  class="form-control"
                  id="override-end-date"
                  value={formData.published_end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, published_end_date: e.currentTarget.value })
                  }
                />
                <div class="form-text">
                  If set, this extension will automatically disable after this date.
                </div>
              </div>

              <div class="mb-3">
                <label for="override-uids" class="form-label">
                  User UIDs
                </label>
                <textarea
                  class="form-control"
                  id="override-uids"
                  rows={3}
                  value={formData.uids}
                  placeholder="Enter UIDs, one per line or separated by commas"
                  required
                  onChange={(e) => setFormData({ ...formData, uids: e.currentTarget.value })}
                />
                <div class="form-text">
                  Enter the UIDs of users who should have this extension applied.
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                disabled={isSubmitting}
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Extension'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper function to format dates
 */
function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

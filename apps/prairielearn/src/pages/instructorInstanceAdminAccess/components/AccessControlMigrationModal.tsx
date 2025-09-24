import { useState } from 'preact/compat';

import { migrateAccessRuleJsonToAccessControl } from '../../../lib/course-instance-access.js';
import type { AccessRuleJson } from '../../../schemas/infoCourseInstance.js';

interface AccessControlMigrationModalProps {
  accessRules: AccessRuleJson[];
  csrfToken: string;
}

export function AccessControlMigrationModal({
  accessRules,
  csrfToken,
}: AccessControlMigrationModalProps) {
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Attempt migration with the provided access rules
  const migrationResult = migrateAccessRuleJsonToAccessControl(accessRules);

  const handleConfirm = async () => {
    if (!migrationResult.success) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'migrate_access_rules',
        published: migrationResult.accessControl.published,
        publishedStartDateEnabled: migrationResult.accessControl.publishedStartDateEnabled,
        publishedStartDate: migrationResult.accessControl.publishedStartDate || null,
        publishedEndDate: migrationResult.accessControl.publishedEndDate || null,
      };

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        setShowMigrationModal(false);
        window.location.reload();
      } else {
        throw new Error('Failed to migrate access rules');
      }
    } catch (error) {
      console.error('Error migrating access rules:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to migrate access rules. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        class="btn btn-outline-light"
        onClick={() => setShowMigrationModal(true)}
      >
        Migrate to Access Control
      </button>
      {showMigrationModal && (
        <div class="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Migrate to Access Control</h5>
                <button
                  type="button"
                  class="btn-close"
                  onClick={() => setShowMigrationModal(false)}
                />
              </div>
              <div class="modal-body">
                {!migrationResult.success ? (
                  <div class="alert alert-danger" role="alert">
                    <strong>Cannot migrate access rules:</strong> {migrationResult.error}
                  </div>
                ) : (
                  <>
                    <div class="mb-4">
                      <h6>Current Access Rules</h6>
                      <pre class="bg-light p-3 rounded">
                        <code>{JSON.stringify(accessRules, null, 2)}</code>
                      </pre>
                    </div>

                    <div class="mb-4">
                      <h6>New Access Control Configuration</h6>
                      <pre class="bg-light p-3 rounded">
                        <code>{JSON.stringify(migrationResult.accessControl, null, 2)}</code>
                      </pre>
                    </div>

                    <div class="alert alert-info" role="alert">
                      <strong>Note:</strong> This will replace the legacy access rules with the new
                      access control system. The legacy access rules will be removed and cannot be
                      recovered.
                    </div>
                  </>
                )}
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => setShowMigrationModal(false)}
                >
                  Cancel
                </button>
                {migrationResult.success && (
                  <button
                    type="button"
                    class="btn btn-primary"
                    disabled={isSubmitting}
                    onClick={handleConfirm}
                  >
                    {isSubmitting ? 'Migrating...' : 'Confirm Migration'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

AccessControlMigrationModal.displayName = 'AccessControlMigrationModal';

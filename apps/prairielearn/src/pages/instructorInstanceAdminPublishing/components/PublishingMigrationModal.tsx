import { useState } from 'preact/compat';

import { migrateAccessRuleJsonToPublishingConfiguration } from '../../../lib/course-instance-access.shared.js';
import type { AccessRuleJson } from '../../../schemas/infoCourseInstance.js';

interface PublishingMigrationModalProps {
  accessRules: AccessRuleJson[];
  csrfToken: string;
  origHash: string;
}

export function PublishingMigrationModal({
  accessRules,
  csrfToken,
  origHash,
}: PublishingMigrationModalProps) {
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  // Attempt migration with the provided access rules
  const migrationResult = migrateAccessRuleJsonToPublishingConfiguration(accessRules);

  return (
    <>
      <form id="migration-form" method="POST" class="d-none">
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="migrate_access_rules" />
        <input type="hidden" name="orig_hash" value={origHash} />
      </form>
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
                        <code>
                          {JSON.stringify(migrationResult.publishingConfiguration, null, 2)}
                        </code>
                      </pre>
                    </div>

                    <div class="alert alert-info" role="alert">
                      <strong>Note:</strong> This will replace the legacy access rules in{' '}
                      <code>infoCourseInstance.json</code> with the new access control system. The
                      legacy access rules will be removed, and recoverable via Git operations.
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
                  <button type="submit" class="btn btn-primary" form="migration-form">
                    Confirm Migration
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

PublishingMigrationModal.displayName = 'PublishingMigrationModal';

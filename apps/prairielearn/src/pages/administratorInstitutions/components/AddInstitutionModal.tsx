import { Modal } from 'react-bootstrap';

import type { StaffAuthnProvider } from '../../../lib/client/safe-db-types.js';
import { type Timezone, formatTimezone } from '../../../lib/timezone.shared.js';

export function AddInstitutionModal({
  show,
  availableTimezones,
  supportedAuthenticationProviders,
  csrfToken,
  onClose,
}: {
  show: boolean;
  availableTimezones: Timezone[];
  supportedAuthenticationProviders: StaffAuthnProvider[];
  csrfToken: string;
  onClose: () => void;
}) {
  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Add Institution</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form method="POST" id="add-institution-form">
          <input type="hidden" name="__action" value="add_institution" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <div class="mb-3">
            <label class="form-label" for="short_name">
              Short name
            </label>
            <input type="text" class="form-control" id="short_name" name="short_name" required />
            <small id="short_name_help" class="form-text text-muted">
              An abbreviation or short name, e.g. "illinois.edu" or "ubc.ca". Usually this should be
              the institution's domain.
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="long_name">
              Long name
            </label>
            <input type="text" class="form-control" id="long_name" name="long_name" required />
            <small id="long_name_help" class="form-text text-muted">
              Use the full name of the university, e.g. "University of Illinois Urbana-Champaign".
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="display_timezone">
              Timezone
            </label>
            <select class="form-select" id="display_timezone" name="display_timezone" required>
              <option value="" selected disabled hidden>
                Timezone
              </option>
              {availableTimezones.map((tz, i) => (
                <option key={tz.name} value={tz.name} id={`timezone-${i}`}>
                  {formatTimezone(tz)}
                </option>
              ))}
            </select>
            <small id="display_timezone_help" class="form-text text-muted">
              The allowable timezones are from the{' '}
              <a
                href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                target="_blank"
                rel="noreferrer"
              >
                tz database
              </a>
              . It's best to use a city-based timezone that has the same times as the institution,
              e.g. "America/Chicago".
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="uid_regexp">
              UID regexp
            </label>
            <input type="text" class="form-control" id="uid_regexp" name="uid_regexp" />
            <small id="uid_regexp_help" class="form-text text-muted">
              Should match the non-username part of user UIDs, e.g. <code>@example\.com$</code>.
              This should be set for institution-based access restrictions to work correctly.
            </small>
          </div>
          {supportedAuthenticationProviders.length > 0 ? (
            <div class="mb-3">
              <div class="form-label">Authentication providers</div>
              <div class="mb-2">
                {supportedAuthenticationProviders.map((provider) => {
                  // Default Google and Azure/Microsoft to checked
                  const isDefaultChecked = provider.name === 'Google' || provider.name === 'Azure';

                  return (
                    <div key={provider.id} class="form-check">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        value={provider.id}
                        id={`authn-provider-${provider.id}`}
                        name="enabled_authn_provider_ids"
                        defaultChecked={isDefaultChecked}
                      />
                      <label class="form-check-label" for={`authn-provider-${provider.id}`}>
                        {provider.name}
                      </label>
                    </div>
                  );
                })}
              </div>
              <small class="form-text text-muted">
                Select which authentication methods users from this institution can use to log in.
                Google and Azure (Microsoft) are good defaults for most institutions. You can
                configure authentication providers after the institution is created.
              </small>
            </div>
          ) : (
            <div class="alert alert-info">
              Neither Google nor Microsoft authentication is configured for this PrairieLearn
              installation. Additional SSO authentication providers can be configured later.
            </div>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" form="add-institution-form">
          Add institution
        </button>
      </Modal.Footer>
    </Modal>
  );
}

AddInstitutionModal.displayName = 'AddInstitutionModal';

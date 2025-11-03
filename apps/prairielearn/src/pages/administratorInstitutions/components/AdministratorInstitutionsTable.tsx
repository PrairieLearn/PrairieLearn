import { useState } from 'preact/compat';

import type { AdminInstitution } from '../../../lib/client/safe-db-types.js';
import { type AuthnProvider } from '../../../lib/db-types.js';
import { type Timezone } from '../../../lib/timezone.shared.js';

import { AddInstitutionModal } from './AddInstitutionModal.js';

export interface InstitutionRow {
  institution: AdminInstitution;
  authn_providers: AuthnProvider['name'][];
}

export function AdministratorInstitutionsTable({
  institutions,
  availableTimezones,
  supportedAuthenticationProviders,
  csrfToken,
  isEnterprise,
}: {
  institutions: InstitutionRow[];
  availableTimezones: Timezone[];
  supportedAuthenticationProviders: AuthnProvider[];
  csrfToken: string;
  isEnterprise: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div id="institutions" class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Institutions</h1>
          <button
            type="button"
            class="btn btn-sm btn-light ms-auto"
            onClick={() => setShowModal(true)}
          >
            <i class="fas fa-plus" />
            <span class="d-none d-sm-inline">Add institution</span>
          </button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Institutions">
            <thead>
              <tr>
                <th>Short name</th>
                <th>Long name</th>
                <th>Timezone</th>
                <th>UID regexp</th>
                <th>Authn providers</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map(({ institution, authn_providers }) => (
                <tr key={institution.id}>
                  <td>
                    {isEnterprise ? (
                      <a href={`/pl/administrator/institution/${institution.id}`}>
                        {institution.short_name}
                      </a>
                    ) : (
                      institution.short_name
                    )}
                  </td>
                  <td>{institution.long_name}</td>
                  <td>{institution.display_timezone}</td>
                  <td>{institution.uid_regexp ? <code>{institution.uid_regexp}</code> : '—'}</td>
                  <td>{authn_providers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <AddInstitutionModal
        show={showModal}
        availableTimezones={availableTimezones}
        supportedAuthenticationProviders={supportedAuthenticationProviders}
        csrfToken={csrfToken}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}

AdministratorInstitutionsTable.displayName = 'AdministratorInstitutionsTable';

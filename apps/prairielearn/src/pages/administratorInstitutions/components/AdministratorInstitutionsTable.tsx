import { useState } from 'react';

import type { AdminInstitution, StaffAuthnProvider } from '../../../lib/client/safe-db-types.js';
import { type Timezone } from '../../../lib/timezone.shared.js';

import { AddInstitutionModal } from './AddInstitutionModal.js';

interface InstitutionRow {
  institution: AdminInstitution;
  authn_providers: StaffAuthnProvider['name'][];
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
  supportedAuthenticationProviders: StaffAuthnProvider[];
  csrfToken: string;
  isEnterprise: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div id="institutions" className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>Institutions</h1>
          <button
            type="button"
            className="btn btn-sm btn-light ms-auto"
            onClick={() => setShowModal(true)}
          >
            <i className="fas fa-plus" />
            <span className="d-none d-sm-inline">Add institution</span>
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover table-striped" aria-label="Institutions">
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
                  <td>
                    {institution.uid_regexp ? (
                      <span className="font-monospace">{institution.uid_regexp}</span>
                    ) : (
                      '—'
                    )}
                  </td>
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

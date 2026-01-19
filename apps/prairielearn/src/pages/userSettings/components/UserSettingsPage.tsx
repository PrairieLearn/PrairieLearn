import { useState } from 'react';

import { formatDate } from '@prairielearn/formatter';

import type { UserAccessToken } from '../../../lib/client/safe-db-types.js';

import { DeleteTokenModal } from './DeleteTokenModal.js';
import { GenerateTokenModal } from './GenerateTokenModal.js';

interface UserSettingsPageProps {
  user: {
    uid: string;
    name: string | null;
    uin: string | null;
    email: string | null;
  };
  institution: {
    long_name: string;
    short_name: string;
  };
  authnProviderName: string;
  accessTokens: UserAccessToken[];
  newAccessTokens: string[];
  isExamMode: boolean;
  csrfToken: string;
}

export function UserSettingsPage({
  user,
  institution,
  authnProviderName,
  accessTokens,
  newAccessTokens,
  isExamMode,
  csrfToken,
}: UserSettingsPageProps) {
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<UserAccessToken | null>(null);

  const handleResetMathJax = () => {
    localStorage.removeItem('MathJax-Menu-Settings');
    // eslint-disable-next-line no-alert -- Matches original behavior for user feedback
    alert('MathJax menu settings have been reset');
  };

  return (
    <>
      <h1 className="mb-4">Settings</h1>

      {/* User Profile Card */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>User profile</h2>
        </div>
        <div className="table-responsive">
          <table
            className="table table-sm two-column-description"
            aria-label="User profile information"
          >
            <tbody>
              <tr>
                <th>UID</th>
                <td>{user.uid}</td>
              </tr>
              <tr>
                <th>Name</th>
                <td>{user.name}</td>
              </tr>
              <tr>
                <th>Unique Identifier (UIN)</th>
                <td>{user.uin}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{user.email}</td>
              </tr>
              <tr>
                <th>Institution</th>
                <td>
                  {institution.long_name} ({institution.short_name})
                </td>
              </tr>
              <tr>
                <th>Authentication method</th>
                <td>{authnProviderName}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Personal Access Tokens Card */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>Personal access tokens</h2>
          {!isExamMode && (
            <button
              type="button"
              className="btn btn-light btn-sm ms-auto"
              data-testid="generate-token-button"
              onClick={() => setShowGenerateModal(true)}
            >
              <i className="fa fa-plus" aria-hidden="true" />
              <span className="d-none d-sm-inline">Generate new token</span>
            </button>
          )}
        </div>
        {newAccessTokens.length > 0 && (
          <div className="card-body">
            <div className="alert alert-primary" role="alert">
              New access token created! Be sure to copy it now, as you won't be able to see it
              later.
            </div>
            {newAccessTokens.map((token) => (
              <div key={token} className="alert alert-success mb-0 new-access-token" role="alert">
                {token}
              </div>
            ))}
          </div>
        )}
        <ul className="list-group list-group-flush">
          <TokenList
            accessTokens={accessTokens}
            isExamMode={isExamMode}
            onDeleteToken={setTokenToDelete}
          />
        </ul>
        <div className="card-footer small">
          Access tokens can be used to access the PrairieLearn API. Be sure to keep them secure.
        </div>
      </div>

      {/* Browser Configuration Card */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex">
          <h2>Browser configuration</h2>
        </div>
        <div className="card-body">
          <p>
            This section will let you reset browser settings related to technology inside
            PrairieLearn.
          </p>
          <p>
            If math formulas shows up as code like{' '}
            <strong>$ x = rac {'{-b pm sqrt {b^2 - 4ac}}{2a}'} $</strong> resetting the MathJax menu
            settings might help.
          </p>
          <button type="button" className="btn btn-sm btn-primary" onClick={handleResetMathJax}>
            Reset MathJax menu settings
          </button>
        </div>
      </div>

      <GenerateTokenModal
        show={showGenerateModal}
        csrfToken={csrfToken}
        onClose={() => setShowGenerateModal(false)}
      />

      <DeleteTokenModal
        token={tokenToDelete}
        csrfToken={csrfToken}
        onClose={() => setTokenToDelete(null)}
      />
    </>
  );
}

UserSettingsPage.displayName = 'UserSettingsPage';

function TokenList({
  accessTokens,
  isExamMode,
  onDeleteToken,
}: {
  accessTokens: UserAccessToken[];
  isExamMode: boolean;
  onDeleteToken: (token: UserAccessToken) => void;
}) {
  if (isExamMode) {
    return (
      <li className="list-group-item">
        <span className="text-muted">Access tokens are not available in exam mode.</span>
      </li>
    );
  }

  if (accessTokens.length === 0) {
    return (
      <li className="list-group-item">
        <span className="text-muted">You don't currently have any access tokens.</span>
      </li>
    );
  }

  return (
    <>
      {accessTokens.map((token) => (
        <li key={token.id} className="list-group-item d-flex align-items-center">
          <div className="d-flex flex-column me-3">
            <strong>{token.name}</strong>
            <span className="text-muted">Created at {formatDate(token.created_at, 'UTC')}</span>
            <span className="text-muted">
              {token.last_used_at !== null
                ? `Last used at ${formatDate(token.last_used_at, 'UTC')}`
                : 'Never used'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm ms-auto"
            onClick={() => onDeleteToken(token)}
          >
            Delete
          </button>
        </li>
      ))}
    </>
  );
}

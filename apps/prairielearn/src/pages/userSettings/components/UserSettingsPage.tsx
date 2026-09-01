import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';

import { formatDate } from '@prairielearn/formatter';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import type { UserAccessToken } from '../../../lib/client/safe-db-types.js';
import { createUserTrpcClient } from '../../../trpc/user/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/user/context.js';
import type { UserSettingsError } from '../../../trpc/user/user-settings.js';

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
  trpcCsrfToken: string;
  initialEnableSingleKeyShortcuts: boolean;
}

export function UserSettingsPage({
  user,
  institution,
  authnProviderName,
  accessTokens,
  newAccessTokens,
  isExamMode,
  csrfToken,
  trpcCsrfToken,
  initialEnableSingleKeyShortcuts,
}: UserSettingsPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createUserTrpcClient({ csrfToken: trpcCsrfToken }));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <h1 className="mb-4">Settings</h1>

        <UserProfileCard
          user={user}
          institution={institution}
          authnProviderName={authnProviderName}
        />

        <UserSettingsCard initialEnableSingleKeyShortcuts={initialEnableSingleKeyShortcuts} />

        <PersonalAccessTokensCard
          accessTokens={accessTokens}
          newAccessTokens={newAccessTokens}
          isExamMode={isExamMode}
          csrfToken={csrfToken}
        />

        <BrowserConfigurationCard />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

UserSettingsPage.displayName = 'UserSettingsPage';

function UserProfileCard({
  user,
  institution,
  authnProviderName,
}: {
  user: UserSettingsPageProps['user'];
  institution: UserSettingsPageProps['institution'];
  authnProviderName: string;
}) {
  return (
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
  );
}

function PersonalAccessTokensCard({
  accessTokens,
  newAccessTokens,
  isExamMode,
  csrfToken,
}: {
  accessTokens: UserAccessToken[];
  newAccessTokens: string[];
  isExamMode: boolean;
  csrfToken: string;
}) {
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<UserAccessToken | null>(null);

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>Personal access tokens</h2>
          {!isExamMode && (
            <button
              type="button"
              className="btn btn-light btn-sm ms-auto"
              data-testid="generate-token-button"
              aria-label="Generate access token"
              onClick={() => setShowGenerateModal(true)}
            >
              <i className="fa fa-plus" aria-hidden="true" />
              <span className="d-none d-sm-inline">Generate access token</span>
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
              <div key={token} className="alert alert-success mb-0" role="alert">
                <span className="new-access-token">{token}</span>
                <button
                  type="button"
                  className="ms-2 btn btn-sm btn-outline-success js-copy-button"
                  data-clipboard-text={token}
                  aria-label="Copy token to clipboard"
                >
                  <i className="bi bi-clipboard" />
                </button>
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

// Example of broken LaTeX rendering that users might see if MathJax isn't working.
const EXAMPLE_BROKEN_LATEX = String.raw`$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $`;

function BrowserConfigurationCard() {
  const handleResetMathJax = () => {
    localStorage.removeItem('MathJax-Menu-Settings');
    // eslint-disable-next-line no-alert -- Matches original behavior for user feedback
    alert('MathJax menu settings have been reset');
  };

  return (
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
          If math formulas show up as code like <strong>{EXAMPLE_BROKEN_LATEX}</strong> resetting
          the MathJax menu settings might help.
        </p>
        <button type="button" className="btn btn-sm btn-primary" onClick={handleResetMathJax}>
          Reset MathJax menu settings
        </button>
      </div>
    </div>
  );
}

function UserSettingsCard({
  initialEnableSingleKeyShortcuts,
}: {
  initialEnableSingleKeyShortcuts: boolean;
}) {
  const trpc = useTRPC();
  const [enableSingleKeyShortcuts, setEnableSingleKeyShortcuts] = useState(
    initialEnableSingleKeyShortcuts,
  );
  const [savedEnableSingleKeyShortcuts, setSavedEnableSingleKeyShortcuts] = useState(
    initialEnableSingleKeyShortcuts,
  );
  const updateMutation = useMutation({
    ...trpc.settings.update.mutationOptions(),
    onSuccess: ({ enableSingleKeyShortcuts: savedValue }) => {
      setEnableSingleKeyShortcuts(savedValue);
      setSavedEnableSingleKeyShortcuts(savedValue);
    },
  });
  const appError = getAppError<UserSettingsError['Update']>(updateMutation.error);
  const isDirty = enableSingleKeyShortcuts !== savedEnableSingleKeyShortcuts;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>User settings</h2>
      </div>
      <div className="card-body">
        <div className="form-check form-switch">
          <input
            id="enable-keyboard-shortcuts"
            className="form-check-input"
            type="checkbox"
            role="switch"
            aria-describedby="enable-keyboard-shortcuts-description"
            checked={enableSingleKeyShortcuts}
            disabled={updateMutation.isPending}
            onChange={(event) => {
              updateMutation.reset();
              setEnableSingleKeyShortcuts(event.currentTarget.checked);
            }}
          />
          <label className="form-check-label fw-semibold" htmlFor="enable-keyboard-shortcuts">
            Enable single-key shortcuts
          </label>
          <div id="enable-keyboard-shortcuts-description" className="form-text mt-1">
            Use single-character keyboard shortcuts where available, including manual grading.
            Available shortcuts are shown next to supported controls.
          </div>
        </div>

        <AppErrorAlert
          error={appError}
          className="mt-3 mb-0"
          render={{ UNKNOWN: ({ message }) => message }}
          onDismiss={() => updateMutation.reset()}
        />

        <div className="d-flex align-items-center gap-2 mt-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isDirty || updateMutation.isPending}
            onClick={() => updateMutation.mutate({ enableSingleKeyShortcuts })}
          >
            {updateMutation.isPending && (
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            )}
            {updateMutation.isPending ? 'Saving…' : 'Save settings'}
          </button>
          <span
            className={clsx('small text-success', {
              invisible: !updateMutation.isSuccess || isDirty,
            })}
            aria-hidden={!updateMutation.isSuccess || isDirty}
          >
            <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
            Saved
          </span>
          <span className="visually-hidden" role="status" aria-live="polite">
            {updateMutation.isSuccess && !isDirty ? 'Settings saved' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

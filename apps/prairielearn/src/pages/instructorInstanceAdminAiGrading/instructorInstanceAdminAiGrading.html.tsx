import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Form, Modal } from 'react-bootstrap';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import {
  AI_GRADING_PROVIDER_OPTIONS,
  type AiGradingApiKeyCredential,
} from './instructorInstanceAdminAiGrading.types.js';

async function postAction(csrfToken: string, body: Record<string, unknown>) {
  const resp = await fetch(window.location.pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ __csrf_token: csrfToken, ...body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Request failed');
  }
  return resp.json();
}

export function InstructorInstanceAdminAiGrading({
  csrfToken,
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
  isDevMode,
}: {
  csrfToken: string;
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  isDevMode: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <AiGradingSettingsContent
        csrfToken={csrfToken}
        initialUseCustomApiKeys={initialUseCustomApiKeys}
        initialApiKeyCredentials={initialApiKeyCredentials}
        canEdit={canEdit}
      />
    </QueryClientProviderDebug>
  );
}

InstructorInstanceAdminAiGrading.displayName = 'InstructorInstanceAdminAiGrading';

function AiGradingSettingsContent({
  csrfToken,
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
}: {
  csrfToken: string;
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
}) {
  const [useCustomApiKeys, setUseCustomApiKeys] = useState(initialUseCustomApiKeys);
  const [credentials, setCredentials] = useState(initialApiKeyCredentials);

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProvider, setAddProvider] = useState<string>(AI_GRADING_PROVIDER_OPTIONS[0].value);
  const [addApiKey, setAddApiKey] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<AiGradingApiKeyCredential | null>(null);

  const existingProviderForAdd = credentials.find((c) => c.providerValue === addProvider);

  const toggleMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      return postAction(csrfToken, {
        __action: 'update_use_custom_api_keys',
        ai_grading_use_custom_api_keys: newValue,
      });
    },
    onSuccess: (_data, newValue) => {
      setUseCustomApiKeys(newValue);
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ provider, secretKey }: { provider: string; secretKey: string }) => {
      return postAction(csrfToken, {
        __action: 'add_credential',
        provider,
        secret_key: secretKey,
      });
    },
    onSuccess: (data: { credential: AiGradingApiKeyCredential }) => {
      setCredentials((prev) => {
        const filtered = prev.filter((c) => c.providerValue !== data.credential.providerValue);
        return [...filtered, data.credential];
      });
      setShowAddModal(false);
      setAddApiKey('');
      setAddProvider(AI_GRADING_PROVIDER_OPTIONS[0].value);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      return postAction(csrfToken, {
        __action: 'delete_credential',
        credential_id: credentialId,
      });
    },
    onSuccess: () => {
      if (deleteTarget) {
        setCredentials((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    },
  });

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h1 className="h6 mb-0">AI grading settings</h1>
      </div>
      <div className="card-body">
        {toggleMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => toggleMutation.reset()}>
            {toggleMutation.error.message}
          </Alert>
        )}
        <Form.Check>
          <Form.Check.Input
            type="checkbox"
            id="use-custom-api-keys"
            checked={useCustomApiKeys}
            disabled={!canEdit || toggleMutation.isPending}
            onChange={() => toggleMutation.mutate(!useCustomApiKeys)}
          />
          <Form.Check.Label htmlFor="use-custom-api-keys">Use custom API keys</Form.Check.Label>
          <div className="small text-muted">
            Provide your own API keys instead of using the platform defaults.
          </div>
        </Form.Check>

        {useCustomApiKeys && (
          <div className="border-top pt-3 mt-3">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
              <div>
                <h2 className="h5 mb-1">API key credentials</h2>
                <p className="text-muted small mb-0">Manage your provider API keys.</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                  onClick={() => setShowAddModal(true)}
                >
                  <i className="bi-plus" aria-hidden="true" />
                  Add key
                </button>
              )}
            </div>

            <div className="table-responsive border rounded overflow-hidden">
              <table className="table table-sm table-hover mb-0" aria-label="API key credentials">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">API key</th>
                    <th className="px-3 py-2">Date added</th>
                    {canEdit && (
                      <th className="px-3 py-2" style={{ width: '1%' }}>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {credentials.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 4 : 3} className="text-muted text-center py-4 px-3">
                        No API keys added yet.
                      </td>
                    </tr>
                  ) : (
                    credentials.map((cred) => (
                      <tr key={cred.id}>
                        <td className="align-middle fw-bold px-3 py-2">{cred.provider}</td>
                        <td className="align-middle font-monospace px-3 py-2">
                          {cred.apiKeyMasked}
                        </td>
                        <td className="align-middle px-3 py-2">{cred.dateAdded}</td>
                        {canEdit && (
                          <td className="align-middle px-3 py-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              aria-label={`Delete ${cred.provider} API key`}
                              onClick={() => setDeleteTarget(cred)}
                            >
                              <i className="bi-trash" aria-hidden="true" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add key modal */}
      <Modal
        show={showAddModal}
        backdrop="static"
        onHide={() => {
          if (!addMutation.isPending) {
            setShowAddModal(false);
            addMutation.reset();
          }
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>Add API key</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {addMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => addMutation.reset()}>
              {addMutation.error.message}
            </Alert>
          )}
          <Form.Group className="mb-3">
            <Form.Label htmlFor="add-key-provider">Provider</Form.Label>
            <Form.Select
              id="add-key-provider"
              value={addProvider}
              onChange={(e) => setAddProvider(e.target.value)}
            >
              {AI_GRADING_PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="add-key-value">API key</Form.Label>
            <Form.Control
              id="add-key-value"
              type="password"
              value={addApiKey}
              placeholder="Enter your API key"
              autoComplete="off"
              onChange={(e) => setAddApiKey(e.target.value)}
            />
          </Form.Group>
          {existingProviderForAdd && (
            <Alert variant="warning" className="mb-0">
              <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />A key for{' '}
              <strong>{existingProviderForAdd.provider}</strong> already exists. Saving will
              overwrite the existing key.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={addMutation.isPending}
            onClick={() => setShowAddModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!addApiKey.trim() || addMutation.isPending}
            onClick={() =>
              addMutation.mutate({ provider: addProvider, secretKey: addApiKey.trim() })
            }
          >
            {addMutation.isPending ? 'Saving...' : 'Save key'}
          </button>
        </Modal.Footer>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        show={deleteTarget !== null}
        onHide={() => {
          if (!deleteMutation.isPending) {
            setDeleteTarget(null);
            deleteMutation.reset();
          }
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete API key</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
              {deleteMutation.error.message}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the <strong>{deleteTarget?.provider}</strong> API key?
            This action cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={deleteMutation.isPending}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.id);
              }
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

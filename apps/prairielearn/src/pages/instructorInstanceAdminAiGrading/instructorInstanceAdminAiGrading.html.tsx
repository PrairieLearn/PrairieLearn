import { useState } from 'react';
import { Form, Modal } from 'react-bootstrap';

import { AI_GRADING_PROVIDERS, type AiGradingApiKeyCredential, type AiGradingProvider} from './instructorInstanceAdminAiGrading.types.js';

function maskApiKey(key: string): string {
  if (key.length <= 7) return '•••••••';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

function formatDateAdded(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function InstructorInstanceAdminAiGrading({
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
}: {
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
}) {
  const [useCustomApiKeys, setUseCustomApiKeys] = useState(initialUseCustomApiKeys);
  const [credentials, setCredentials] = useState<AiGradingApiKeyCredential[]>(initialApiKeyCredentials);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProvider, setAddProvider] = useState<AiGradingProvider>('OpenAI');
  const [addApiKey, setAddApiKey] = useState('');

  const handleAddKey = () => {
    if (!addApiKey.trim()) return;
    const newCredential: AiGradingApiKeyCredential = {
      id: crypto.randomUUID(),
      provider: addProvider,
      apiKeyMasked: maskApiKey(addApiKey.trim()),
      dateAdded: formatDateAdded(new Date()),
    };
    setCredentials((prev) => [...prev, newCredential]);
    setShowAddModal(false);
    setAddApiKey('');
    setAddProvider('OpenAI');
  };

  const handleDeleteKey = (id: string) => {
    setCredentials((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h1 className="mb-0">AI grading settings</h1>
      </div>
      <div className="card-body">
        <Form.Check>
          <Form.Check.Input
            type="checkbox"
            id="use-custom-api-keys"
            checked={useCustomApiKeys}
            onChange={(e) => setUseCustomApiKeys(e.target.checked)}
          />
          <Form.Check.Label htmlFor="use-custom-api-keys">
            Use custom API keys
          </Form.Check.Label>
          <div className="small text-muted">
            Provide your own API keys instead of using the platform defaults.
          </div>
        </Form.Check>

        {
          useCustomApiKeys ? (
            <>
              <div className="border-top pt-3 mt-3">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                  <div>
                    <h2 className="h5 mb-1">API key credentials</h2>
                    <p className="text-muted small mb-0">Manage your provider API keys.</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-primary d-flex align-items-center gap-2"
                      onClick={() => setShowAddModal(true)}
                    >
                      <i className="fas fa-plus" aria-hidden="true" />
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
                          <td className="align-middle font-monospace px-3 py-2">{cred.apiKeyMasked}</td>
                          <td className="align-middle px-3 py-2">{cred.dateAdded}</td>
                          {canEdit && (
                            <td className="align-middle px-3 py-2">
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost text-danger"
                                aria-label={`Delete ${cred.provider} API key`}
                                onClick={() => handleDeleteKey(cred.id)}
                              >
                                <i className="fas fa-trash" aria-hidden="true" />
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
            </>
          ) : <></>
        }
      </div>

      <Modal show={showAddModal} backdrop="static" onHide={() => setShowAddModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add API key</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="add-key-provider">Provider</Form.Label>
            <Form.Select
              id="add-key-provider"
              value={addProvider}
              onChange={(e) => setAddProvider(e.target.value as AiGradingProvider)}
            >
              {AI_GRADING_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group>
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
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setShowAddModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!addApiKey.trim()}
            onClick={handleAddKey}
          >
            Add key
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

InstructorInstanceAdminAiGrading.displayName = 'InstructorInstanceAdminAiGrading';

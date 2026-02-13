import { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

interface CustomApiKeysModalProps {
  show: boolean;
  csrfToken: string;
  onClose: () => void;
  hasOpenAiKey: boolean;
  hasGoogleKey: boolean;
  hasAnthropicKey: boolean;
}

export function CustomApiKeysModal({
  show,
  csrfToken,
  onClose,
  hasOpenAiKey,
  hasGoogleKey,
  hasAnthropicKey,
}: CustomApiKeysModalProps) {
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiOrganization, setOpenAiOrganization] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // This is a mockup - no actual backend endpoint
    onClose();
  };

  return (
    <Modal size="lg" show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Update AI grading API keys</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form id="custom-api-keys-form" onSubmit={handleSubmit}>
          <input type="hidden" name="__action" value="update_api_keys" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />

          {/* OpenAI Section */}
          <div className="mb-3">
            <div className="row align-items-center">
              <div className="col-md-2">
                <strong>OpenAI</strong>
                <div className="small">
                  {hasOpenAiKey ? (
                    <span className="text-success">
                      <i className="fa fa-check" aria-hidden="true" /> Added
                    </span>
                  ) : (
                    <span className="text-muted">
                      <i className="fa fa-times" aria-hidden="true" /> Not added
                    </span>
                  )}
                </div>
              </div>
              <div className="col-md-5">
                <label className="form-label" htmlFor="openai_api_key">
                  Secret key
                </label>
                <Form.Control
                  type="password"
                  id="openai_api_key"
                  name="openai_api_key"
                  autoComplete="off"
                  placeholder="sk-..."
                  value={openAiApiKey}
                  onChange={(e) => setOpenAiApiKey(e.target.value)}
                />
              </div>
              <div className="col-md-5">
                <label className="form-label" htmlFor="openai_organization">
                  Organization ID
                </label>
                <Form.Control
                  type="password"
                  id="openai_organization"
                  name="openai_organization"
                  autoComplete="off"
                  placeholder="org-..."
                  value={openAiOrganization}
                  onChange={(e) => setOpenAiOrganization(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Google Section */}
          <div className="mb-3">
            <div className="row align-items-center">
              <div className="col-md-2">
                <strong>Google</strong>
                <div className="small">
                  {hasGoogleKey ? (
                    <span className="text-success">
                      <i className="fa fa-check" aria-hidden="true" /> Added
                    </span>
                  ) : (
                    <span className="text-muted">
                      <i className="fa fa-times" aria-hidden="true" /> Not added
                    </span>
                  )}
                </div>
              </div>
              <div className="col-md-10">
                <label className="form-label" htmlFor="google_api_key">
                  Secret key
                </label>
                <Form.Control
                  type="password"
                  id="google_api_key"
                  name="google_api_key"
                  autoComplete="off"
                  placeholder="AIza..."
                  value={googleApiKey}
                  onChange={(e) => setGoogleApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Anthropic Section */}
          <div className="mb-3">
            <div className="row align-items-center">
              <div className="col-md-2">
                <strong>Anthropic</strong>
                <div className="small">
                  {hasAnthropicKey ? (
                    <span className="text-success">
                      <i className="fa fa-check" aria-hidden="true" /> Added
                    </span>
                  ) : (
                    <span className="text-muted">
                      <i className="fa fa-times" aria-hidden="true" /> Not added
                    </span>
                  )}
                </div>
              </div>
              <div className="col-md-10">
                <label className="form-label" htmlFor="anthropic_api_key">
                  Secret key
                </label>
                <Form.Control
                  type="password"
                  id="anthropic_api_key"
                  name="anthropic_api_key"
                  autoComplete="off"
                  placeholder="sk-ant-..."
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="custom-api-keys-form">
            Update API keys
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

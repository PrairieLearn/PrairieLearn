import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import { useTRPC as useCourseInstanceTRPC } from '../../../trpc/courseInstance/context.js';
import {
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  AI_GRADING_PROVIDER_OPTIONS,
} from '../../lib/ai-grading/ai-grading-models.shared.js';

import type { AiGradingApiKeyCredential } from './utils/format.js';
import { useTRPC } from './utils/trpc-context.js';

export function AddApiKeyModal({
  show,
  credentials,
  onHide,
  onExited,
  onSuccess,
}: {
  show: boolean;
  credentials: AiGradingApiKeyCredential[];
  onHide: () => void;
  onExited: () => void;
  onSuccess: (credential: AiGradingApiKeyCredential) => void;
}) {
  const trpc = useTRPC();
  const courseInstanceTRPC = useCourseInstanceTRPC();
  const [confirmation, setConfirmation] = useState<{
    models: string[];
    base_url: string;
    secret_key: string;
    expected_credential_id: string | null;
  } | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<{ provider: EnumAiGradingProvider; apiKey: string; baseUrl: string }>({
    defaultValues: { provider: AI_GRADING_PROVIDER_OPTIONS[0].value, apiKey: '', baseUrl: '' },
  });
  const selectedProvider = watch('provider');
  const isCustom = selectedProvider === 'openai-compatible';
  const validateBaseUrl = (value: string) =>
    !isCustom || value.trim().length > 0 || 'Base URL is required';
  const existingProvider = credentials.find((c) => c.provider === selectedProvider);
  const addMutation = useMutation({
    ...trpc.addCredential.mutationOptions(),
    onSuccess: (data) => onSuccess(data.credential),
  });
  const discoverMutation = useMutation(
    courseInstanceTRPC.aiGradingProviders.discover.mutationOptions(),
  );
  const saveMutation = useMutation({
    ...courseInstanceTRPC.aiGradingProviders.save.mutationOptions(),
    onSuccess: (data) =>
      onSuccess({
        id: data.credential.id,
        provider: data.credential.provider,
        base_url: data.credential.base_url,
        apiKeyMasked: data.credential.apiKeyMasked,
        dateAdded: data.credential.dateAdded,
      }),
  });
  const isPending = addMutation.isPending || discoverMutation.isPending || saveMutation.isPending;
  const error = addMutation.error ?? discoverMutation.error ?? saveMutation.error;

  return (
    <Modal
      show={show}
      backdrop="static"
      onHide={() => {
        if (!isPending) onHide();
      }}
      onExited={() => {
        reset();
        setConfirmation(null);
        addMutation.reset();
        discoverMutation.reset();
        saveMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton={!isPending}>
        <Modal.Title>{confirmation ? 'Confirm provider models' : 'Add API key'}</Modal.Title>
      </Modal.Header>
      <Form
        onSubmit={handleSubmit((data) => {
          if (confirmation) {
            const { models: _models, ...connection } = confirmation;
            saveMutation.mutate(connection);
          } else if (data.provider === 'openai-compatible') {
            const connection = { base_url: data.baseUrl.trim(), secret_key: data.apiKey.trim() };
            discoverMutation.mutate(connection, {
              onSuccess: ({ models }) =>
                setConfirmation({
                  ...connection,
                  models,
                  expected_credential_id: existingProvider?.id ?? null,
                }),
            });
          } else {
            addMutation.mutate({ provider: data.provider, secret_key: data.apiKey.trim() });
          }
        })}
      >
        <Modal.Body>
          {error && <Alert variant="danger">{error.message}</Alert>}
          {confirmation ? (
            <>
              <p>
                Models found at <span className="text-break">{confirmation.base_url}</span>:
              </p>
              {confirmation.models.length === 0 ? (
                <Alert variant="warning">
                  No models were found. You can save the configuration, but grading requires an
                  available model.
                </Alert>
              ) : (
                <div
                  className="border rounded p-3 mb-3 overflow-auto"
                  style={{ maxHeight: '18rem' }}
                >
                  <ul className="mb-0" aria-label="Provider models">
                    {confirmation.models.map((id) => (
                      <li key={id} className="text-break">
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="small text-muted mb-0">
                Use models that support structured outputs. We recommend models that also support
                images and PDFs. Pricing is unavailable for custom models.
              </p>
            </>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="add-key-provider">Provider</Form.Label>
                <Form.Select
                  id="add-key-provider"
                  defaultValue={AI_GRADING_PROVIDER_OPTIONS[0].value}
                  disabled={isPending}
                  {...register('provider', {
                    onChange: () => {
                      addMutation.reset();
                      discoverMutation.reset();
                      saveMutation.reset();
                    },
                  })}
                >
                  {AI_GRADING_PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="openai-compatible">OpenAI-compatible</option>
                </Form.Select>
              </Form.Group>
              {isCustom && (
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="add-key-url">Base URL</Form.Label>
                  <Form.Control
                    id="add-key-url"
                    type="url"
                    placeholder="https://provider.example/v1"
                    defaultValue=""
                    disabled={isPending}
                    className={clsx(errors.baseUrl && 'is-invalid')}
                    aria-invalid={!!errors.baseUrl}
                    aria-errormessage={errors.baseUrl ? 'add-key-url-error' : undefined}
                    {...register('baseUrl', { validate: validateBaseUrl })}
                  />
                  {errors.baseUrl && (
                    <div className="invalid-feedback" id="add-key-url-error">
                      {errors.baseUrl.message}
                    </div>
                  )}
                  <Form.Text>
                    Enter the HTTPS API base URL, including /v1 if required by your provider.
                  </Form.Text>
                </Form.Group>
              )}
              <Form.Group className="mb-3">
                <Form.Label htmlFor="add-key-value">API key</Form.Label>
                <Form.Control
                  id="add-key-value"
                  type="password"
                  placeholder="Enter your API key"
                  autoComplete="off"
                  defaultValue=""
                  disabled={isPending}
                  className={clsx(errors.apiKey && 'is-invalid')}
                  aria-invalid={!!errors.apiKey}
                  aria-errormessage={errors.apiKey ? 'add-key-value-error' : undefined}
                  {...register('apiKey', {
                    validate: (value) => value.trim().length > 0 || 'API key is required',
                  })}
                />
                {errors.apiKey && (
                  <div className="invalid-feedback" id="add-key-value-error">
                    {errors.apiKey.message}
                  </div>
                )}
              </Form.Group>
              {isCustom && (
                <p className="small text-muted">
                  Models must support structured outputs. We recommend support for images and PDFs.
                  You can review the discovered models before saving.
                </p>
              )}
            </>
          )}
          {existingProvider && (
            <Alert variant="warning" className="mb-0">
              <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />A key for{' '}
              <strong>{AI_GRADING_PROVIDER_DISPLAY_NAMES[existingProvider.provider]}</strong>{' '}
              already exists. Saving will{' '}
              {isCustom ? 'replace the existing configuration' : 'overwrite the existing key'}.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={isPending} onClick={onHide}>
            Cancel
          </Button>
          {confirmation && (
            <Button
              variant="outline-secondary"
              disabled={isPending}
              onClick={() => {
                setConfirmation(null);
                saveMutation.reset();
              }}
            >
              Back
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending
              ? discoverMutation.isPending
                ? 'Loading models...'
                : 'Saving...'
              : isCustom && !confirmation
                ? 'Next'
                : 'Save key'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

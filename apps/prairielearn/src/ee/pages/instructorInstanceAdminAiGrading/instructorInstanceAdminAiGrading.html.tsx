import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Alert, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { useModalState } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import { CreditPoolDashboard } from '../../components/ai-grading-credits/CreditPoolDashboard.js';
import {
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  AI_GRADING_PROVIDER_OPTIONS,
} from '../../lib/ai-grading/ai-grading-models.shared.js';

import type { AiGradingApiKeyCredential } from './utils/format.js';
import { createAiGradingSettingsTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

function AddApiKeyModal({
  show,
  providerOptions,
  credentials,
  onHide,
  onExited,
  onSuccess,
}: {
  show: boolean;
  providerOptions: readonly { value: string; label: string }[];
  credentials: AiGradingApiKeyCredential[];
  onHide: () => void;
  onExited: () => void;
  onSuccess: (credential: AiGradingApiKeyCredential) => void;
}) {
  const trpc = useTRPC();

  const addMutation = useMutation({
    ...trpc.addCredential.mutationOptions(),
    onSuccess: (data) => {
      onSuccess(data.credential);
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<{ provider: string; apiKey: string }>({
    defaultValues: {
      provider: providerOptions[0].value,
      apiKey: '',
    },
  });

  const selectedProvider = watch('provider');
  const existingProvider = credentials.find((c) => c.provider === selectedProvider);

  return (
    <Modal
      show={show}
      backdrop="static"
      onHide={onHide}
      onExited={() => {
        reset();
        addMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Add API key</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((data) =>
          addMutation.mutate({
            provider: data.provider as EnumAiGradingProvider,
            secret_key: data.apiKey.trim(),
          }),
        )}
      >
        <Modal.Body>
          {addMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => addMutation.reset()}>
              {addMutation.error.message}
            </Alert>
          )}
          <Form.Group className="mb-3">
            <Form.Label htmlFor="add-key-provider">Provider</Form.Label>
            <Form.Select id="add-key-provider" {...register('provider')}>
              {providerOptions.map((p) => (
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
              placeholder="Enter your API key"
              autoComplete="off"
              className={clsx(errors.apiKey && 'is-invalid')}
              aria-invalid={!!errors.apiKey}
              aria-errormessage={errors.apiKey ? 'add-key-value-error' : undefined}
              {...register('apiKey', { required: 'API key is required' })}
            />
            {errors.apiKey && (
              <div className="invalid-feedback" id="add-key-value-error">
                {errors.apiKey.message}
              </div>
            )}
          </Form.Group>
          {existingProvider && (
            <Alert variant="warning" className="mb-0">
              <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />A key for{' '}
              <strong>{AI_GRADING_PROVIDER_DISPLAY_NAMES[existingProvider.provider]}</strong>{' '}
              already exists. Saving will overwrite the existing key.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={addMutation.isPending}
            onClick={onHide}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Saving...' : 'Save key'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function DeleteApiKeyModal({
  data,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: AiGradingApiKeyCredential | null;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: () => void;
}) {
  const trpc = useTRPC();

  const deleteMutation = useMutation({
    ...trpc.deleteCredential.mutationOptions(),
    onSuccess,
  });

  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
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
          Are you sure you want to delete the{' '}
          <strong>{data ? AI_GRADING_PROVIDER_DISPLAY_NAMES[data.provider] : ''}</strong> API key?
          This action cannot be undone.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={deleteMutation.isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (!data) return;
            deleteMutation.mutate({ credential_id: data.id });
          }}
        >
          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export function InstructorInstanceAdminAiGrading({
  trpcCsrfToken,
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
  isDevMode,
  aiGradingModelSelectionEnabled,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountCents,
}: {
  trpcCsrfToken: string;
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  isDevMode: boolean;
  aiGradingModelSelectionEnabled: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountCents: number | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAiGradingSettingsTrpcClient({ csrfToken: trpcCsrfToken }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AiGradingSettingsContent
          initialUseCustomApiKeys={initialUseCustomApiKeys}
          initialApiKeyCredentials={initialApiKeyCredentials}
          canEdit={canEdit}
          aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
          stripePurchasingEnabled={stripePurchasingEnabled}
          initialCheckoutStatus={initialCheckoutStatus}
          initialCheckoutAmountCents={initialCheckoutAmountCents}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorInstanceAdminAiGrading.displayName = 'InstructorInstanceAdminAiGrading';

function AiGradingSettingsContent({
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
  aiGradingModelSelectionEnabled,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountCents,
}: {
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  aiGradingModelSelectionEnabled: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountCents: number | null;
}) {
  const trpc = useTRPC();

  const [useCustomApiKeys, setUseCustomApiKeys] = useState(initialUseCustomApiKeys);
  const [credentials, setCredentials] = useState(initialApiKeyCredentials);

  const providerOptions = aiGradingModelSelectionEnabled
    ? AI_GRADING_PROVIDER_OPTIONS
    : AI_GRADING_PROVIDER_OPTIONS.filter((p) => p.value === 'openai');

  const addModalState = useModalState();
  const deleteModalState = useModalState<AiGradingApiKeyCredential>();

  const toggleMutation = useMutation({
    ...trpc.updateUseCustomApiKeys.mutationOptions(),
    onSuccess: (data) => {
      setUseCustomApiKeys(data.useCustomApiKeys);
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
            onChange={() => toggleMutation.mutate({ enabled: !useCustomApiKeys })}
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
                  onClick={() => addModalState.showWithData(null)}
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
                        <td className="align-middle fw-bold px-3 py-2">
                          {AI_GRADING_PROVIDER_DISPLAY_NAMES[cred.provider]}
                        </td>
                        <td className="align-middle font-monospace px-3 py-2">
                          {cred.apiKeyMasked}
                        </td>
                        <td className="align-middle px-3 py-2">{cred.dateAdded}</td>
                        {canEdit && (
                          <td className="align-middle px-3 py-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              aria-label={`Delete ${AI_GRADING_PROVIDER_DISPLAY_NAMES[cred.provider]} API key`}
                              onClick={() => deleteModalState.showWithData(cred)}
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
            {!canEdit && (
              <Alert variant="warning" className="mt-3 mb-0">
                You must be a course owner to edit provider API keys.
              </Alert>
            )}
          </div>
        )}

        <CreditPoolSection
          useCustomApiKeys={useCustomApiKeys}
          canEdit={canEdit}
          stripePurchasingEnabled={stripePurchasingEnabled}
          initialCheckoutStatus={initialCheckoutStatus}
          initialCheckoutAmountCents={initialCheckoutAmountCents}
        />
      </div>

      <AddApiKeyModal
        {...addModalState}
        providerOptions={providerOptions}
        credentials={credentials}
        onSuccess={(credential) => {
          // The server upserts by provider, so replace any existing credential
          // for the same provider with the newly returned one.
          setCredentials((prev) => {
            const filtered = prev.filter((c) => c.provider !== credential.provider);
            return [...filtered, credential];
          });
          addModalState.hide();
        }}
      />

      <DeleteApiKeyModal
        {...deleteModalState}
        onSuccess={() => {
          // Read the target from modal state before hiding, since hide() clears it.
          const target = deleteModalState.data;
          if (target) {
            setCredentials((prev) => prev.filter((c) => c.id !== target.id));
          }
          deleteModalState.hide();
        }}
      />
    </div>
  );
}

// Estimated average cost per AI-graded submission (in dollars).
// This is approximate and may be updated after benchmarking.
const COST_PER_SUBMISSION = 0.03;

const CREDIT_PACKAGES = [
  { dollars: 10, tagline: 'Best for testing AI grading' },
  { dollars: 25, tagline: 'Best for small courses' },
  { dollars: 100, tagline: 'Best for large courses' },
] as const;

function roundSubmissionEstimate(dollars: number): number {
  const raw = Math.floor(dollars / COST_PER_SUBMISSION);
  if (raw >= 1000) return Math.floor(raw / 100) * 100;
  if (raw >= 100) return Math.floor(raw / 50) * 50;
  if (raw >= 10) return Math.floor(raw / 10) * 10;
  return raw;
}

function formatSubmissionCount(count: number): string {
  if (count >= 1_000_000) return '1,000,000+';
  return count.toLocaleString();
}

type SelectedPackage = { type: 'preset'; dollars: number } | { type: 'custom' };

function PurchaseCreditsModal({
  show,
  onHide,
  onExited,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
}) {
  const trpc = useTRPC();
  const [customAmount, setCustomAmount] = useState('50');
  const [selected, setSelected] = useState<SelectedPackage>({ type: 'preset', dollars: 25 });

  const checkoutMutation = useMutation({
    ...trpc.createCreditCheckoutSession.mutationOptions(),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
  });

  const customDollars = Math.max(0, Math.floor(Number.parseFloat(customAmount) || 0));
  const purchaseDollars = selected.type === 'preset' ? selected.dollars : customDollars;
  const canProceed = purchaseDollars >= 1 && purchaseDollars <= 10000;

  function handleProceed() {
    const amountCents = purchaseDollars * 100;
    checkoutMutation.mutate({ amount_cents: amountCents });
  }

  const customEstimate = customDollars >= 1 ? roundSubmissionEstimate(customDollars) : null;

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={onHide}
      onExited={() => {
        setCustomAmount('50');
        setSelected({ type: 'preset', dollars: 25 });
        checkoutMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Purchase AI grading credits</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {checkoutMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => checkoutMutation.reset()}>
            {checkoutMutation.error.message}
          </Alert>
        )}
        <div className="mb-2 fw-semibold" style={{ fontSize: '0.85rem' }}>
          Package
        </div>
        <div className="d-flex flex-column gap-2" role="radiogroup" aria-label="Credit package">
          {CREDIT_PACKAGES.map((pkg) => {
            const isSelected = selected.type === 'preset' && selected.dollars === pkg.dollars;
            return (
              <div
                key={pkg.dollars}
                className={clsx('card', {
                  'border-primary bg-primary bg-opacity-10': isSelected,
                })}
                style={{ cursor: 'pointer' }}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelected({ type: 'preset', dollars: pkg.dollars })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected({ type: 'preset', dollars: pkg.dollars });
                  }
                }}
              >
                <div className="card-body py-3 px-4">
                  <div className="d-none d-md-flex align-items-center gap-3">
                    <div className="fw-bold" style={{ fontSize: '1.15rem', flexShrink: 0 }}>
                      {`$${pkg.dollars}`}
                    </div>
                    <div className="text-muted me-auto">{pkg.tagline}</div>
                    <div>
                      Grades about{' '}
                      <strong>{formatSubmissionCount(roundSubmissionEstimate(pkg.dollars))}</strong>{' '}
                      submissions
                    </div>
                  </div>
                  <div className="d-md-none">
                    <div className="fw-bold mb-1" style={{ fontSize: '1.15rem' }}>
                      {`$${pkg.dollars}`}
                    </div>
                    <div className="text-muted">{pkg.tagline}</div>
                    <div>
                      Grades about{' '}
                      <strong>{formatSubmissionCount(roundSubmissionEstimate(pkg.dollars))}</strong>{' '}
                      submissions
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-2 mb-1 fw-semibold" style={{ fontSize: '0.85rem' }}>
            Custom package
          </div>
          <div
            className={clsx('card', {
              'border-primary bg-primary bg-opacity-10': selected.type === 'custom',
            })}
            style={{ cursor: 'pointer' }}
            role="radio"
            aria-checked={selected.type === 'custom'}
            tabIndex={0}
            onClick={() => setSelected({ type: 'custom' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected({ type: 'custom' });
              }
            }}
          >
            <div className="card-body py-3 px-4">
              <div className="d-flex flex-column flex-md-row align-items-md-center gap-2 gap-md-3">
                {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions */}
                <div
                  className="input-group"
                  style={{ width: '120px', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    step="1"
                    min="1"
                    max="10000"
                    value={customAmount}
                    aria-label="Custom dollar amount"
                    onFocus={() => setSelected({ type: 'custom' })}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setCustomAmount('');
                        return;
                      }
                      const num = Number.parseInt(raw, 10);
                      if (!Number.isFinite(num) || num < 0) {
                        return;
                      }
                      if (num > 10000) {
                        setCustomAmount('10000');
                        return;
                      }
                      setCustomAmount(raw);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === '.' || e.key === '-' || e.key === 'e') {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
                <div className="text-muted me-md-auto">Enter your own amount</div>
                <div>
                  {customEstimate != null ? (
                    <span>
                      Grades about <strong>{formatSubmissionCount(customEstimate)}</strong>{' '}
                      submissions
                    </span>
                  ) : (
                    <span className="text-muted">Enter amount for estimate</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-muted mt-3 small">
          Actual number of graded submissions will vary based on submission content.
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={checkoutMutation.isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={checkoutMutation.isPending || !canProceed}
          onClick={handleProceed}
        >
          {checkoutMutation.isPending ? 'Redirecting...' : 'Proceed to payment'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function CreditPoolEmptyState({
  canPurchase,
  onPurchase,
}: {
  canPurchase: boolean;
  onPurchase?: () => void;
}) {
  return (
    <div className="text-center py-5">
      <i
        className="bi bi-stars d-block mb-3 text-muted"
        aria-hidden="true"
        style={{ fontSize: '2.5rem' }}
      />
      <h3 className="h5 mb-2">Get started with AI grading</h3>
      <p className="text-muted mb-3">Buy credits to start grading submissions with AI.</p>
      {canPurchase && onPurchase && (
        <button
          type="button"
          className="btn btn-primary d-inline-flex align-items-center gap-2"
          onClick={onPurchase}
        >
          <i className="bi bi-cart-plus" aria-hidden="true" />
          Purchase credits
        </button>
      )}
    </div>
  );
}

function CreditPoolSection({
  useCustomApiKeys,
  canEdit,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountCents,
}: {
  useCustomApiKeys: boolean;
  canEdit: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountCents: number | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const purchaseModalState = useModalState();
  const [checkoutStatus, setCheckoutStatus] = useState(initialCheckoutStatus);

  useEffect(() => {
    if (initialCheckoutStatus === 'success') {
      // Refetch credit pool data after a successful purchase.
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({
        queryKey: trpc.creditPoolChanges.queryKey({ page: 1 }),
      });
    }
  }, [initialCheckoutStatus, queryClient, trpc]);

  return (
    <div className="border-top pt-3 mt-3">
      {checkoutStatus === 'success' && (
        <Alert variant="success" dismissible onClose={() => setCheckoutStatus(null)}>
          <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
          {initialCheckoutAmountCents != null
            ? `${formatCents(initialCheckoutAmountCents)} in credits were`
            : 'Credits have been'}{' '}
          added to your course instance.
        </Alert>
      )}
      {checkoutStatus === 'cancelled' && (
        <Alert variant="info" dismissible onClose={() => setCheckoutStatus(null)}>
          Payment was cancelled. No credits were added.
        </Alert>
      )}
      <CreditPoolDashboard
        trpc={trpc}
        balanceContext="instructor"
        dimmed={useCustomApiKeys}
        emptyState={
          stripePurchasingEnabled ? (
            <CreditPoolEmptyState
              canPurchase={canEdit}
              onPurchase={canEdit ? () => purchaseModalState.showWithData(null) : undefined}
            />
          ) : undefined
        }
        header={({ isEmpty: isPoolEmpty }) => (
          <>
            <div
              className={clsx(
                'd-flex justify-content-between align-items-center',
                useCustomApiKeys ? 'mb-1' : 'mb-3',
              )}
            >
              <div className="d-flex align-items-center gap-2">
                <h2 className="h5 mb-0">AI grading credits</h2>
                {useCustomApiKeys && <span className="badge text-bg-secondary">Inactive</span>}
              </div>
              {stripePurchasingEnabled && canEdit && !isPoolEmpty && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                  onClick={() => purchaseModalState.showWithData(null)}
                >
                  <i className="bi bi-cart-plus" aria-hidden="true" />
                  Purchase credits
                </button>
              )}
            </div>
            {useCustomApiKeys && (
              <p className="text-muted small mb-3">
                While custom API keys are active, PrairieLearn AI grading credits are not deducted.
              </p>
            )}
          </>
        )}
      />
      <PurchaseCreditsModal {...purchaseModalState} />
    </div>
  );
}

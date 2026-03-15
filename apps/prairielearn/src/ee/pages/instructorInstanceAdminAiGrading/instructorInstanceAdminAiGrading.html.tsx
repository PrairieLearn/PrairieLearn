import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Dropdown, Form, Modal, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { useModalState } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import { BalanceCards } from '../../components/ai-grading-credits/BalanceCards.js';
import {
  DailySpendingChart,
  type GroupByOption,
} from '../../components/ai-grading-credits/DailySpendingChart.js';
import { TransactionHistoryTable } from '../../components/ai-grading-credits/TransactionHistoryTable.js';
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
}: {
  trpcCsrfToken: string;
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  isDevMode: boolean;
  aiGradingModelSelectionEnabled: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAiGradingSettingsTrpcClient(trpcCsrfToken));

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AiGradingSettingsContent
          initialUseCustomApiKeys={initialUseCustomApiKeys}
          initialApiKeyCredentials={initialApiKeyCredentials}
          canEdit={canEdit}
          aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
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
}: {
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  aiGradingModelSelectionEnabled: boolean;
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

        <CreditPoolSection useCustomApiKeys={useCustomApiKeys} />
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

function CreditPoolSection({ useCustomApiKeys }: { useCustomApiKeys: boolean }) {
  const trpc = useTRPC();
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(30);
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');

  const poolQuery = useQuery(trpc.creditPool.queryOptions());
  const changesQuery = useQuery({
    ...trpc.creditPoolChanges.queryOptions({ page }),
    enabled: showHistory,
  });
  const dailySpendingQuery = useQuery(trpc.dailySpending.queryOptions({ days: chartDays }));
  const groupedSpendingQuery = useQuery({
    ...trpc.dailySpendingGrouped.queryOptions({
      days: chartDays,
      group_by: groupBy as 'user' | 'assessment' | 'question',
    }),
    enabled: groupBy !== 'none',
  });

  if (poolQuery.isError) {
    return (
      <Alert variant="danger" className="border-top mt-3 pt-3">
        Failed to load credit pool data.
      </Alert>
    );
  }

  if (!poolQuery.data) {
    return (
      <div className="border-top pt-3 mt-3 text-center py-4">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading AI grading credits...
      </div>
    );
  }

  const pool = poolQuery.data;

  const creditPoolContent = (
    <>
      {useCustomApiKeys && (
        <p className="text-muted small mb-3">
          While custom API keys are active, PrairieLearn AI grading credits are not deducted.
        </p>
      )}

      <BalanceCards pool={pool} context="instructor" />

      <div>
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h3 className="h6 mb-0">Daily usage</h3>
            <div className="d-flex align-items-center gap-2">
              <Dropdown onSelect={(key) => setGroupBy((key ?? 'none') as GroupByOption)}>
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  {groupBy === 'none' && 'Group by'}
                  {groupBy === 'user' && 'Group by user'}
                  {groupBy === 'assessment' && 'Group by assessment'}
                  {groupBy === 'question' && 'Group by question'}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item eventKey="none" active={groupBy === 'none'}>
                    Group by
                  </Dropdown.Item>
                  <Dropdown.Item eventKey="user" active={groupBy === 'user'}>
                    Group by user
                  </Dropdown.Item>
                  <Dropdown.Item eventKey="assessment" active={groupBy === 'assessment'}>
                    Group by assessment
                  </Dropdown.Item>
                  <Dropdown.Item eventKey="question" active={groupBy === 'question'}>
                    Group by question
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <div className="btn-group btn-group-sm" role="group" aria-label="Time range">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={clsx(
                      'btn',
                      d === chartDays ? 'btn-primary' : 'btn-outline-secondary',
                    )}
                    onClick={() => setChartDays(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>
          {dailySpendingQuery.data && (
            <DailySpendingChart
              data={dailySpendingQuery.data}
              groupedData={groupBy !== 'none' ? groupedSpendingQuery.data : undefined}
            />
          )}
        </div>

        <TransactionHistory
          showHistory={showHistory}
          setShowHistory={(v) => {
            setShowHistory(v);
            if (v) setPage(1);
          }}
          changesQuery={changesQuery}
          page={page}
          setPage={setPage}
        />
      </div>
    </>
  );

  return (
    <div className="border-top pt-3 mt-3">
      <div className={
        clsx(
          'd-flex align-items-center gap-2',
          useCustomApiKeys ? 'mb-1': 'mb-3'
        )
      }>
        <h2 className="h5 mb-0">AI grading credits</h2>
        {useCustomApiKeys && <span className="badge text-bg-secondary">Inactive</span>}
      </div>
      {creditPoolContent}
    </div>
  );
}

function TransactionHistory({
  showHistory,
  setShowHistory,
  changesQuery,
  page,
  setPage,
}: {
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  changesQuery: {
    isLoading: boolean;
    isError: boolean;
    data?: {
      rows: {
        id: string;
        created_at: Date;
        delta_milli_dollars: number;
        credit_after_milli_dollars: number;
        submission_count: number;
        reason: string;
        user_name: string | null;
        user_uid: string | null;
      }[];
      totalCount: number;
    };
  };
  page: number;
  setPage: (p: number) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={() => setShowHistory(!showHistory)}
      >
        {showHistory ? 'Hide transaction history' : 'Show transaction history'}
      </button>

      {showHistory && (
        <div className="mt-3">
          {changesQuery.isLoading && <p className="text-muted">Loading transaction history...</p>}
          {changesQuery.isError && (
            <Alert variant="danger">Failed to load transaction history.</Alert>
          )}
          {changesQuery.data && (
            <TransactionHistoryTable
              rows={changesQuery.data.rows}
              totalCount={changesQuery.data.totalCount}
              page={page}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
}

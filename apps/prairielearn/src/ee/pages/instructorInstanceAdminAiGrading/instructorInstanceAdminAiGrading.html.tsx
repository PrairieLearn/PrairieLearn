import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
// @ts-expect-error -- echarts ships `export = echarts` types but ESM runtime; `import *` works at runtime via esbuild
import * as echarts from 'echarts';
import { useEffect, useRef, useState } from 'react';
import { Alert, Form, Modal, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { useModalState } from '@prairielearn/ui';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
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

  const poolQuery = useQuery(trpc.creditPool.queryOptions());
  const changesQuery = useQuery({
    ...trpc.creditPoolChanges.queryOptions({ page }),
    enabled: showHistory,
  });
  const timeSeriesQuery = useQuery(trpc.creditPoolBalanceTimeSeries.queryOptions());

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
  const dimmed = useCustomApiKeys;

  return (
    <div className="border-top pt-3 mt-3">
      <h2 className="h5 mb-3">AI grading credits</h2>

      {useCustomApiKeys ? (
        <Alert variant="danger">
          This course instance is using custom API keys. Credits are not consumed when custom keys
          are in use.
        </Alert>
      ) : (
        <Alert variant="info">
          This course instance is using platform API keys. Credits are consumed for each AI grading
          request.
        </Alert>
      )}

      <div className={clsx('row mb-3 g-3', dimmed && 'opacity-50')}>
        <div className="col-md-4">
          <div className="border rounded p-3 text-center">
            <div className="text-muted small">Total available</div>
            <div className="h4 mb-0">{formatMilliDollars(pool.total_milli_dollars)}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="border rounded p-3 text-center">
            <div className="text-muted small">Transferable</div>
            <div className="h5 mb-0">
              {formatMilliDollars(pool.credit_transferable_milli_dollars)}
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="border rounded p-3 text-center">
            <div className="text-muted small">Non-transferable</div>
            <div className="h5 mb-0">
              {formatMilliDollars(pool.credit_non_transferable_milli_dollars)}
            </div>
          </div>
        </div>
      </div>

      <div className={clsx(dimmed && 'opacity-50')}>
        {timeSeriesQuery.data && timeSeriesQuery.data.length > 1 && (
          <div className="mb-3">
            <h3 className="h6">Balance over time</h3>
            <BalanceChart data={timeSeriesQuery.data} />
          </div>
        )}

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
  const pageSize = 25;
  const totalPages = changesQuery.data ? Math.ceil(changesQuery.data.totalCount / pageSize) : 0;

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
            <>
              <div className="table-responsive border rounded overflow-hidden">
                <table className="table table-sm table-hover mb-0" aria-label="Transaction history">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Change</th>
                      <th className="px-3 py-2">Balance after</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changesQuery.data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted text-center py-4 px-3">
                          No transactions yet.
                        </td>
                      </tr>
                    ) : (
                      changesQuery.data.rows.map((change) => (
                        <tr key={change.id}>
                          <td className="align-middle px-3 py-2">
                            {new Date(change.created_at).toLocaleString()}
                          </td>
                          <td
                            className={clsx(
                              'align-middle px-3 py-2 fw-bold',
                              change.delta_milli_dollars > 0 ? 'text-success' : 'text-danger',
                            )}
                          >
                            {change.delta_milli_dollars > 0 ? '+' : '-'}
                            {formatMilliDollars(Math.abs(change.delta_milli_dollars))}
                          </td>
                          <td className="align-middle px-3 py-2">
                            {formatMilliDollars(change.credit_after_milli_dollars)}
                          </td>
                          <td className="align-middle px-3 py-2">
                            {change.submission_count > 1
                              ? `${change.reason} (${change.submission_count} submissions)`
                              : change.reason}
                          </td>
                          <td className="align-middle px-3 py-2">
                            {change.user_name ?? change.user_uid ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <nav aria-label="Transaction history pagination" className="mt-3">
                  <ul className="pagination pagination-sm justify-content-center mb-0">
                    <li className={clsx('page-item', page <= 1 && 'disabled')}>
                      <button
                        type="button"
                        className="page-link"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </button>
                    </li>
                    <li className="page-item disabled">
                      <span className="page-link">
                        Page {page} of {totalPages}
                      </span>
                    </li>
                    <li className={clsx('page-item', page >= totalPages && 'disabled')}>
                      <button
                        type="button"
                        className="page-link"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </button>
                    </li>
                  </ul>
                </nav>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceChart({ data }: { data: { date: Date; balance_milli_dollars: number }[] }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length < 2) return;

    const chart = echarts.init(chartRef.current);

    chart.setOption({
      grid: { top: 10, right: 10, bottom: 30, left: 60 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: { value: [string, number] }[]) => {
          const p = params[0];
          const d = new Date(p.value[0]);
          return `${d.toLocaleString()}<br/>${formatMilliDollars(p.value[1])}`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          formatter: (v: number) => formatMilliDollars(v),
        },
        min: 0,
      },
      series: [
        {
          type: 'line',
          data: data.map((d) => [new Date(d.date).toISOString(), d.balance_milli_dollars]),
          smooth: false,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.1 },
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data]);

  if (data.length < 2) return null;

  return <div ref={chartRef} style={{ height: '200px', width: '100%' }} />;
}

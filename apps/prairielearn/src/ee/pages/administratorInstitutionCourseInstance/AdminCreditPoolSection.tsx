import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { BalanceCards } from '../../components/ai-grading-credits/BalanceCards.js';
import { DailySpendingChart } from '../../components/ai-grading-credits/DailySpendingChart.js';
import { TransactionHistoryTable } from '../../components/ai-grading-credits/TransactionHistoryTable.js';

import { createAdminCreditPoolTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

export function AdminCreditPoolSection({
  trpcCsrfToken,
  useCustomApiKeys,
  isDeleted,
}: {
  trpcCsrfToken: string;
  useCustomApiKeys: boolean;
  isDeleted: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdminCreditPoolTrpcClient(trpcCsrfToken));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AdminCreditPoolContent useCustomApiKeys={useCustomApiKeys} isDeleted={isDeleted} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdminCreditPoolSection.displayName = 'AdminCreditPoolSection';

function AdminCreditPoolContent({
  useCustomApiKeys,
  isDeleted,
}: {
  useCustomApiKeys: boolean;
  isDeleted: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(30);

  const poolQuery = useQuery(trpc.creditPool.queryOptions());
  const changesQuery = useQuery({
    ...trpc.creditPoolChanges.queryOptions({ page }),
    enabled: showHistory,
  });
  const dailySpendingQuery = useQuery(trpc.dailySpending.queryOptions({ days: chartDays }));

  const adjustMutation = useMutation({
    ...trpc.adjustCreditPool.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.dailySpending.queryKey() });
      if (showHistory) {
        void queryClient.invalidateQueries({ queryKey: trpc.creditPoolChanges.queryKey() });
      }
    },
  });

  if (poolQuery.isError) {
    return <Alert variant="danger">Failed to load credit pool data.</Alert>;
  }

  if (!poolQuery.data) {
    return (
      <div className="text-center py-4">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading AI grading credits...
      </div>
    );
  }

  const pool = poolQuery.data;
  const dimmed = useCustomApiKeys;

  return (
    <>
      <h2 className="h4 mt-4">AI grading credits</h2>

      {useCustomApiKeys && (
        <div className="alert alert-danger" role="alert">
          AI grading credits are not deducted while custom API keys are active. Usage is billed
          directly by the API provider.
        </div>
      )}

      <BalanceCards pool={pool} dimmed={dimmed} />

      <AdjustCreditsForm
        isDeleted={isDeleted}
        isPending={adjustMutation.isPending}
        error={adjustMutation.isError ? adjustMutation.error.message : null}
        onSubmit={(data) => adjustMutation.mutate(data)}
        onDismissError={() => adjustMutation.reset()}
      />

      <div className={clsx(dimmed && 'opacity-50')}>
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h3 className="h6 mb-0">Daily usage</h3>
            <div className="btn-group btn-group-sm" role="group" aria-label="Time range">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={clsx('btn', d === chartDays ? 'btn-primary' : 'btn-outline-secondary')}
                  onClick={() => setChartDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {dailySpendingQuery.data && <DailySpendingChart data={dailySpendingQuery.data} />}
        </div>

        <div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) {
                setPage(1);
              }
            }}
          >
            {showHistory ? 'Hide transaction history' : 'Show transaction history'}
          </button>

          {showHistory && (
            <div className="mt-3">
              {changesQuery.isLoading && (
                <p className="text-muted">Loading transaction history...</p>
              )}
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
      </div>
    </>
  );
}

function AdjustCreditsForm({
  isDeleted,
  isPending,
  error,
  onSubmit,
  onDismissError,
}: {
  isDeleted: boolean;
  isPending: boolean;
  error: string | null;
  onSubmit: (data: {
    action: 'add' | 'deduct';
    amount_dollars: number;
    credit_type: 'transferable' | 'non_transferable';
  }) => void;
  onDismissError: () => void;
}) {
  const [action, setAction] = useState<'add' | 'deduct'>('add');
  const [amountStr, setAmountStr] = useState('');
  const [creditType, setCreditType] = useState<'transferable' | 'non_transferable'>(
    'non_transferable',
  );

  return (
    <div className="border rounded p-3 mb-3">
      <h3 className="h6 mb-3">Adjust credits</h3>
      {error && (
        <Alert variant="danger" dismissible onClose={onDismissError}>
          {error}
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Number(amountStr);
          if (!Number.isFinite(amount) || amount <= 0) return;
          onSubmit({ action, amount_dollars: amount, credit_type: creditType });
          setAmountStr('');
        }}
      >
        <div className="row g-3 align-items-end">
          <div className="col-auto">
            <label className="form-label" htmlFor="adjustment_action">
              Action
            </label>
            <select
              className="form-select"
              id="adjustment_action"
              value={action}
              disabled={isDeleted || isPending}
              onChange={(e) => setAction(e.target.value as 'add' | 'deduct')}
            >
              <option value="add">Add</option>
              <option value="deduct">Deduct</option>
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label" htmlFor="amount_dollars">
              Amount (USD)
            </label>
            <div className="input-group">
              <span className="input-group-text">$</span>
              <input
                type="number"
                className="form-control"
                id="amount_dollars"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                disabled={isDeleted || isPending}
                required
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
          </div>
          <div className="col-auto">
            <label className="form-label" htmlFor="credit_type">
              Credit type
            </label>
            <select
              className="form-select"
              id="credit_type"
              value={creditType}
              disabled={isDeleted || isPending}
              onChange={(e) => setCreditType(e.target.value as 'transferable' | 'non_transferable')}
            >
              <option value="non_transferable">Non-transferable</option>
              <option value="transferable">Transferable</option>
            </select>
          </div>
          {!isDeleted && (
            <div className="col-auto">
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Applying...' : 'Apply'}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

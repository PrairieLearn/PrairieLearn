import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Alert, Dropdown, Spinner } from 'react-bootstrap';

import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { BalanceCards } from '../../components/ai-grading-credits/BalanceCards.js';
import {
  DailySpendingChart,
  type GroupByOption,
} from '../../components/ai-grading-credits/DailySpendingChart.js';
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

  const adjustMutation = useMutation({
    ...trpc.adjustCreditPool.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      if (showHistory) {
        void queryClient.invalidateQueries({ queryKey: trpc.creditPoolChanges.queryKey() });
      }
    },
  });

  const { isSuccess: adjustIsSuccess, reset: adjustReset } = adjustMutation;
  useEffect(() => {
    if (!adjustIsSuccess) return;
    const timer = setTimeout(() => adjustReset(), 5000);
    return () => clearTimeout(timer);
  }, [adjustIsSuccess, adjustReset]);

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

  return (
    <div className="mb-5">
      <h2 className="h4 mt-4">AI grading credits</h2>

      {useCustomApiKeys && (
        <p className="text-muted">
          While custom API keys are active, PrairieLearn AI grading credits are not deducted.
        </p>
      )}

      <BalanceCards pool={pool} context="admin" />

      <AdjustCreditsForm
        isDeleted={isDeleted}
        isPending={adjustMutation.isPending}
        error={adjustMutation.isError ? adjustMutation.error.message : null}
        isSuccess={adjustMutation.isSuccess}
        onSubmit={(data) => adjustMutation.mutate(data)}
        onDismissError={() => adjustMutation.reset()}
        onDismissSuccess={() => adjustMutation.reset()}
      />

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
    </div>
  );
}

function AdjustCreditsForm({
  isDeleted,
  isPending,
  error,
  isSuccess,
  onSubmit,
  onDismissError,
  onDismissSuccess,
}: {
  isDeleted: boolean;
  isPending: boolean;
  error: string | null;
  isSuccess: boolean;
  onSubmit: (data: {
    action: 'add' | 'deduct';
    amount_dollars: number;
    credit_type: 'transferable' | 'non_transferable';
  }) => void;
  onDismissError: () => void;
  onDismissSuccess: () => void;
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
              disabled={isDeleted}
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
                disabled={isDeleted}
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
              disabled={isDeleted}
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
      {isSuccess && (
        <Alert
          variant="success"
          className="mt-3 mb-0 d-flex align-items-center"
          dismissible
          onClose={onDismissSuccess}
        >
          Credits updated successfully.
        </Alert>
      )}
    </div>
  );
}

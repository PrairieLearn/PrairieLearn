import { useQuery } from '@tanstack/react-query';
import { type createTRPCContext } from '@trpc/tanstack-react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Dropdown, Spinner } from 'react-bootstrap';

import type { CreditPoolRouter } from '../../lib/credit-pool-trpc.js';

import { BalanceCards } from './BalanceCards.js';
import { DailySpendingChart, type GroupByOption } from './DailySpendingChart.js';
import { TransactionHistoryTable } from './TransactionHistoryTable.js';
import { CHART_DAYS_OPTIONS, type ChartDays, DEFAULT_CHART_DAYS } from './constants.js';

type CreditPoolContext = ReturnType<typeof createTRPCContext<CreditPoolRouter>>;
type CreditPoolTRPC = ReturnType<CreditPoolContext['useTRPC']>;

export function CreditPoolDashboard({
  trpc,
  balanceContext,
  dimmed,
  header,
  children,
}: {
  trpc: CreditPoolTRPC;
  balanceContext: 'admin' | 'instructor';
  dimmed?: boolean;
  header?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [chartDays, setChartDays] = useState<ChartDays>(DEFAULT_CHART_DAYS);
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');

  const poolQuery = useQuery(trpc.creditPool.queryOptions());
  const changesQuery = useQuery({
    ...trpc.creditPoolChanges.queryOptions({ page }),
    enabled: showHistory,
  });
  const dailySpendingQuery = useQuery(trpc.dailySpending.queryOptions({ days: chartDays }));
  const validGroupBy = groupBy !== 'none' ? groupBy : undefined;
  const groupedSpendingQuery = useQuery({
    ...trpc.dailySpendingGrouped.queryOptions({
      days: chartDays,
      group_by: validGroupBy ?? 'user',
    }),
    enabled: validGroupBy != null,
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

  return (
    <>
      {header}
      <BalanceCards pool={pool} context={balanceContext} dimmed={dimmed} />
      {children}
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
                {CHART_DAYS_OPTIONS.map((d) => (
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
              if (!showHistory) setPage(1);
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

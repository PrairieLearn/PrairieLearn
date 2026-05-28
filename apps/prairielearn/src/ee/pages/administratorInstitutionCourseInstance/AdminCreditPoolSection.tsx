import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { run } from '@prairielearn/run';

import { type CreditPoolLimits, formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { CreditPoolDashboard } from '../../components/ai-grading-credits/CreditPoolDashboard.js';

import { createAdminCreditPoolTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

export function AdminCreditPoolSection({
  trpcCsrfToken,
  useCustomApiKeys,
  isDeleted,
  refundsEnabled,
  creditPoolLimits,
}: {
  trpcCsrfToken: string;
  useCustomApiKeys: boolean;
  isDeleted: boolean;
  refundsEnabled: boolean;
  creditPoolLimits: CreditPoolLimits;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdminCreditPoolTrpcClient(trpcCsrfToken));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AdminCreditPoolContent
          useCustomApiKeys={useCustomApiKeys}
          isDeleted={isDeleted}
          refundsEnabled={refundsEnabled}
          creditPoolLimits={creditPoolLimits}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdminCreditPoolSection.displayName = 'AdminCreditPoolSection';

function AdminCreditPoolContent({
  useCustomApiKeys,
  isDeleted,
  refundsEnabled,
  creditPoolLimits,
}: {
  useCustomApiKeys: boolean;
  isDeleted: boolean;
  refundsEnabled: boolean;
  creditPoolLimits: CreditPoolLimits;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const poolQuery = useQuery(trpc.creditPool.queryOptions());

  const adjustMutation = useMutation({
    ...trpc.adjustCreditPool.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.creditPoolChanges.queryKey() });
    },
  });

  const refundMutation = useMutation({
    ...trpc.refundCreditPurchase.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.creditPoolChanges.queryKey() });
    },
  });

  const { isSuccess: adjustIsSuccess, reset: adjustReset } = adjustMutation;
  useEffect(() => {
    if (!adjustIsSuccess) return;
    const timer = setTimeout(() => adjustReset(), 5000);
    return () => clearTimeout(timer);
  }, [adjustIsSuccess, adjustReset]);

  const { isSuccess: refundIsSuccess, reset: refundReset } = refundMutation;
  useEffect(() => {
    if (!refundIsSuccess) return;
    const timer = setTimeout(() => refundReset(), 5000);
    return () => clearTimeout(timer);
  }, [refundIsSuccess, refundReset]);

  return (
    <div className="mb-5">
      <CreditPoolDashboard
        trpc={trpc}
        balanceContext="admin"
        dimmed={useCustomApiKeys}
        header={
          <>
            <h2 className="h4 mt-4">AI grading credits</h2>
            {useCustomApiKeys && (
              <p className="text-muted">
                While custom API keys are active, PrairieLearn AI grading credits are not deducted.
              </p>
            )}
          </>
        }
        isRefunding={refundMutation.isPending}
        showRefundActions={refundsEnabled}
        onRefund={(checkoutSessionId) =>
          refundMutation.mutate({ checkout_session_id: checkoutSessionId })
        }
      >
        <AdjustCreditsForm
          isDeleted={isDeleted}
          isPending={adjustMutation.isPending}
          error={adjustMutation.isError ? adjustMutation.error.message : null}
          isSuccess={adjustMutation.isSuccess}
          poolData={poolQuery.data ?? null}
          creditPoolLimits={creditPoolLimits}
          onSubmit={(data) =>
            adjustMutation.mutate(
              data.action === 'set'
                ? {
                    action: 'set',
                    balance_dollars: data.amount,
                    credit_type: data.credit_type,
                  }
                : {
                    action: data.action,
                    amount_dollars: data.amount,
                    credit_type: data.credit_type,
                  },
            )
          }
          onDismissError={() => adjustMutation.reset()}
          onDismissSuccess={() => adjustMutation.reset()}
        />
        {refundMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => refundMutation.reset()}>
            Refund failed: {refundMutation.error.message}
          </Alert>
        )}
        {refundMutation.isSuccess && (
          <Alert variant="success" dismissible onClose={() => refundMutation.reset()}>
            Refund processed successfully.
          </Alert>
        )}
      </CreditPoolDashboard>
    </div>
  );
}

type AdjustAction = 'add' | 'deduct' | 'set';

function AdjustCreditsForm({
  isDeleted,
  isPending,
  error,
  isSuccess,
  poolData,
  creditPoolLimits,
  onSubmit,
  onDismissError,
  onDismissSuccess,
}: {
  isDeleted: boolean;
  isPending: boolean;
  error: string | null;
  isSuccess: boolean;
  poolData: {
    credit_transferable_milli_dollars: number;
    credit_non_transferable_milli_dollars: number;
  } | null;
  creditPoolLimits: CreditPoolLimits;
  onSubmit: (data: {
    action: AdjustAction;
    amount: number;
    credit_type: 'transferable' | 'non_transferable';
  }) => void;
  onDismissError: () => void;
  onDismissSuccess: () => void;
}) {
  const [action, setAction] = useState<AdjustAction>('add');
  const [amountStr, setAmountStr] = useState('');
  const [creditType, setCreditType] = useState<'transferable' | 'non_transferable'>(
    'non_transferable',
  );

  const amountEntered = amountStr !== '';
  const parsedAmount = Number(amountStr);
  const parsedAmountMilliDollars = Math.round(parsedAmount * 1000);

  const currentBalanceMilliDollars = run(() => {
    if (poolData == null) return null;
    if (creditType === 'transferable') return poolData.credit_transferable_milli_dollars;
    return poolData.credit_non_transferable_milli_dollars;
  });

  const { minMilliDollars: amountMinMilliDollars, maxMilliDollars: amountMaxMilliDollars } = run(
    () => {
      if (action === 'set') {
        return creditType === 'transferable'
          ? creditPoolLimits.setTransferable
          : creditPoolLimits.setNonTransferable;
      }
      return action === 'add' ? creditPoolLimits.add : creditPoolLimits.deduct;
    },
  );

  // An amount is valid when it is within the [amountMinMilliDollars, amountMaxMilliDollars]
  // range for the current action and has at most cent-level precision (no sub-cent fractions).
  const amountValid = run(() => {
    // Treat an empty input as valid so the user doesn't see an error before they've typed anything.
    // Submission is separately gated by `amountEntered` in `isSubmitEnabled`.
    if (!amountEntered) return true;
    if (!Number.isFinite(parsedAmount)) return false;
    if (parsedAmountMilliDollars % 10 !== 0) return false;
    return (
      parsedAmountMilliDollars >= amountMinMilliDollars &&
      parsedAmountMilliDollars <= amountMaxMilliDollars
    );
  });

  const setBalanceDelta =
    action === 'set' && amountEntered && amountValid && currentBalanceMilliDollars != null
      ? parsedAmountMilliDollars - currentBalanceMilliDollars
      : null;

  const isDeductBlocked =
    action === 'deduct' && currentBalanceMilliDollars !== null && currentBalanceMilliDollars <= 0;

  const isSubmitEnabled = run(() => {
    if (isPending || !amountEntered || !amountValid) return false;
    if (isDeductBlocked) return false;
    if (action === 'set' && setBalanceDelta === 0) return false;
    return true;
  });

  function handleSubmit() {
    if (!isSubmitEnabled) return;
    onSubmit({ action, amount: parsedAmount, credit_type: creditType });
    setAmountStr('');
  }

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
          handleSubmit();
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
              onChange={(e) => {
                setAction(e.target.value as AdjustAction);
                setAmountStr('');
              }}
            >
              <option value="add">Add</option>
              <option value="deduct">Deduct</option>
              <option value="set">Set balance</option>
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label" htmlFor="amount_dollars">
              {action === 'set' ? 'New balance (USD)' : 'Amount (USD)'}
            </label>
            <div className="input-group">
              <span className="input-group-text">$</span>
              <input
                type="number"
                className="form-control"
                id="amount_dollars"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                disabled={isDeleted || isDeductBlocked}
                min={action === 'set' ? amountMinMilliDollars / 1000 : undefined}
                max={action === 'set' ? amountMaxMilliDollars / 1000 : undefined}
                aria-invalid={!amountValid || undefined}
                aria-errormessage={!amountValid ? 'amount-error' : undefined}
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
              <button type="submit" className="btn btn-primary" disabled={!isSubmitEnabled}>
                {isPending ? 'Applying...' : 'Apply'}
              </button>
            </div>
          )}
        </div>
        <AdjustCreditsFormFeedback
          creditType={creditType}
          action={action}
          amountValid={amountValid}
          amountEntered={amountEntered}
          amountMinMilliDollars={amountMinMilliDollars}
          amountMaxMilliDollars={amountMaxMilliDollars}
          currentBalanceMilliDollars={currentBalanceMilliDollars}
          parsedAmountMilliDollars={parsedAmountMilliDollars}
          setBalanceDelta={setBalanceDelta}
        />
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

function AdjustCreditsFormFeedback({
  creditType,
  action,
  amountValid,
  amountEntered,
  amountMinMilliDollars,
  amountMaxMilliDollars,
  currentBalanceMilliDollars,
  parsedAmountMilliDollars,
  setBalanceDelta,
}: {
  creditType: 'transferable' | 'non_transferable';
  action: AdjustAction;
  amountValid: boolean;
  amountEntered: boolean;
  amountMinMilliDollars: number;
  amountMaxMilliDollars: number;
  currentBalanceMilliDollars: number | null;
  parsedAmountMilliDollars: number;
  setBalanceDelta: number | null;
}) {
  const creditTypeLabel = creditType.replace('_', '-');

  if (!amountValid) {
    return (
      <div id="amount-error" className="text-danger small mt-3">
        Enter an amount between {formatMilliDollars(amountMinMilliDollars)} and{' '}
        {formatMilliDollars(amountMaxMilliDollars)}, with at most 2 decimal places.
      </div>
    );
  }

  if (action === 'deduct' && currentBalanceMilliDollars !== null) {
    if (currentBalanceMilliDollars <= 0) {
      return (
        <div className="text-warning-emphasis small mt-3">
          The {creditTypeLabel} balance is {formatMilliDollars(currentBalanceMilliDollars)}.
          Deductions are only allowed from a positive balance.
        </div>
      );
    }
    if (amountEntered && parsedAmountMilliDollars > currentBalanceMilliDollars) {
      return (
        <div className="text-warning-emphasis small mt-3">
          Amount exceeds the {creditTypeLabel} balance.{' '}
          {formatMilliDollars(currentBalanceMilliDollars)} will be deducted.
        </div>
      );
    }
  }

  if (setBalanceDelta != null && setBalanceDelta !== 0) {
    return (
      <div className="text-muted small mt-3">
        Will record {setBalanceDelta > 0 ? '+' : '−'}
        {formatMilliDollars(Math.abs(setBalanceDelta))} in transaction history.
      </div>
    );
  }

  return null;
}

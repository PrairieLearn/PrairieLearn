import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { CreditPoolDashboard } from '../../components/ai-grading-credits/CreditPoolDashboard.js';

import { createAdminCreditPoolTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

export function AdminCreditPoolSection({
  trpcCsrfToken,
  useCustomApiKeys,
  isDeleted,
  maxAddDollars,
  maxDeductDollars,
  refundsEnabled,
}: {
  trpcCsrfToken: string;
  useCustomApiKeys: boolean;
  isDeleted: boolean;
  maxAddDollars: number;
  maxDeductDollars: number;
  refundsEnabled: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAdminCreditPoolTrpcClient(trpcCsrfToken));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AdminCreditPoolContent
          useCustomApiKeys={useCustomApiKeys}
          isDeleted={isDeleted}
          maxAddDollars={maxAddDollars}
          maxDeductDollars={maxDeductDollars}
          refundsEnabled={refundsEnabled}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AdminCreditPoolSection.displayName = 'AdminCreditPoolSection';

function AdminCreditPoolContent({
  useCustomApiKeys,
  isDeleted,
  maxAddDollars,
  maxDeductDollars,
  refundsEnabled,
}: {
  useCustomApiKeys: boolean;
  isDeleted: boolean;
  maxAddDollars: number;
  maxDeductDollars: number;
  refundsEnabled: boolean;
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
          maxAddDollars={maxAddDollars}
          maxDeductDollars={maxDeductDollars}
          poolData={poolQuery.data ?? null}
          onSubmit={(data) =>
            adjustMutation.mutate(
              // TRPC expects a discriminated union; narrow by `action`.
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

const SET_BALANCE_MAX_ABS_DOLLARS = 1_000_000;

function AdjustCreditsForm({
  isDeleted,
  isPending,
  error,
  isSuccess,
  maxAddDollars,
  maxDeductDollars,
  poolData,
  onSubmit,
  onDismissError,
  onDismissSuccess,
}: {
  isDeleted: boolean;
  isPending: boolean;
  error: string | null;
  isSuccess: boolean;
  maxAddDollars: number;
  maxDeductDollars: number;
  poolData: {
    credit_transferable_milli_dollars: number;
    credit_non_transferable_milli_dollars: number;
  } | null;
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

  const parsedAmount = Number(amountStr);
  const currentBalanceMilliDollars =
    poolData == null
      ? null
      : creditType === 'transferable'
        ? poolData.credit_transferable_milli_dollars
        : poolData.credit_non_transferable_milli_dollars;

  const isAddOrDeduct = action === 'add' || action === 'deduct';
  const maxForAction = action === 'add' ? maxAddDollars : maxDeductDollars;
  const isAddDeductAmountInvalid =
    isAddOrDeduct &&
    amountStr !== '' &&
    (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > maxForAction);

  const setBalanceMinDollars = creditType === 'non_transferable' ? 0 : -SET_BALANCE_MAX_ABS_DOLLARS;
  const isSetAmountInvalid =
    action === 'set' &&
    amountStr !== '' &&
    (!Number.isFinite(parsedAmount) ||
      parsedAmount < setBalanceMinDollars ||
      parsedAmount > SET_BALANCE_MAX_ABS_DOLLARS);

  const isAmountInvalid = isAddDeductAmountInvalid || isSetAmountInvalid;

  const isDeductBlocked =
    action === 'deduct' && currentBalanceMilliDollars !== null && currentBalanceMilliDollars <= 0;

  const setBalanceDelta =
    action === 'set' && amountStr !== '' && !isAmountInvalid && currentBalanceMilliDollars != null
      ? Math.round(parsedAmount * 1000) - currentBalanceMilliDollars
      : null;

  const isSubmitDisabled =
    isPending ||
    amountStr === '' ||
    isAmountInvalid ||
    isDeductBlocked ||
    (action === 'set' && setBalanceDelta === 0);

  function handleSubmit() {
    if (!Number.isFinite(parsedAmount)) return;
    if (isAddOrDeduct && parsedAmount <= 0) return;
    onSubmit({ action, amount: parsedAmount, credit_type: creditType });
    setAmountStr('');
  }

  const amountLabel = action === 'set' ? 'New balance (USD)' : 'Amount (USD)';

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
              {amountLabel}
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
                disabled={isDeleted}
                min={action === 'set' ? setBalanceMinDollars : undefined}
                max={action === 'set' ? SET_BALANCE_MAX_ABS_DOLLARS : undefined}
                aria-invalid={isAmountInvalid || undefined}
                aria-errormessage={isAmountInvalid ? 'amount-error' : undefined}
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
              <button type="submit" className="btn btn-primary" disabled={isSubmitDisabled}>
                {isPending ? 'Applying...' : 'Apply'}
              </button>
            </div>
          )}
        </div>
        {isAddDeductAmountInvalid && (
          <div id="amount-error" className="text-danger small mt-1">
            Enter an amount between $0.01 and {formatMilliDollars(maxForAction * 1000)}.
          </div>
        )}
        {isSetAmountInvalid && (
          <div id="amount-error" className="text-danger small mt-1">
            {creditType === 'non_transferable'
              ? `Enter a balance between $0 and $${SET_BALANCE_MAX_ABS_DOLLARS.toLocaleString()}.`
              : `Enter a balance between -$${SET_BALANCE_MAX_ABS_DOLLARS.toLocaleString()} and $${SET_BALANCE_MAX_ABS_DOLLARS.toLocaleString()}.`}
          </div>
        )}
        {action === 'deduct' &&
          currentBalanceMilliDollars !== null &&
          currentBalanceMilliDollars <= 0 && (
            <div className="text-warning-emphasis small mt-3">
              The {creditType.replace('_', '-')} balance is{' '}
              {formatMilliDollars(currentBalanceMilliDollars)}. Deductions are only allowed from a
              positive balance.
            </div>
          )}
        {action === 'deduct' &&
          !isAmountInvalid &&
          amountStr !== '' &&
          currentBalanceMilliDollars !== null &&
          currentBalanceMilliDollars > 0 &&
          Math.round(parsedAmount * 1000) > currentBalanceMilliDollars && (
            <div className="text-warning-emphasis small mt-3">
              Amount exceeds the {creditType.replace('_', '-')} balance.{' '}
              {formatMilliDollars(currentBalanceMilliDollars)} will be deducted.
            </div>
          )}
        {action === 'set' && setBalanceDelta != null && setBalanceDelta !== 0 && (
          <div className="text-muted small mt-3">
            Will record {setBalanceDelta > 0 ? '+' : '−'}
            {formatMilliDollars(Math.abs(setBalanceDelta))} in transaction history.
          </div>
        )}
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

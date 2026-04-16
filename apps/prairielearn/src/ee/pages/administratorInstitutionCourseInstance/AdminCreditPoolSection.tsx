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
          onSubmit={(data) => adjustMutation.mutate(data)}
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

  const parsedAmount = Number(amountStr);
  const maxForAction = action === 'add' ? maxAddDollars : maxDeductDollars;
  const currentBalanceMilliDollars =
    poolData == null
      ? null
      : creditType === 'transferable'
        ? poolData.credit_transferable_milli_dollars
        : poolData.credit_non_transferable_milli_dollars;
  const isAmountInvalid =
    amountStr !== '' &&
    (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > maxForAction);
  const isDeductionCapped =
    action === 'deduct' &&
    !isAmountInvalid &&
    amountStr !== '' &&
    currentBalanceMilliDollars != null &&
    Math.round(parsedAmount * 1000) > currentBalanceMilliDollars;
  const isSubmitDisabled =
    isPending || isAmountInvalid || (action === 'deduct' && !currentBalanceMilliDollars);

  function handleSubmit() {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    onSubmit({ action, amount_dollars: parsedAmount, credit_type: creditType });
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
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                disabled={isDeleted}
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
        {isAmountInvalid && (
          <div id="amount-error" className="text-danger small mt-1">
            Enter an amount between $0.01 and {formatMilliDollars(maxForAction * 1000)}.
          </div>
        )}
        {isDeductionCapped && (
          <div className="text-warning-emphasis small mt-3">
            {currentBalanceMilliDollars === 0
              ? `The ${creditType.replace('_', '-')} balance is $0.00. No credits are available to deduct.`
              : `Amount exceeds the ${creditType.replace('_', '-')} balance. ${formatMilliDollars(currentBalanceMilliDollars)} will be deducted.`}
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

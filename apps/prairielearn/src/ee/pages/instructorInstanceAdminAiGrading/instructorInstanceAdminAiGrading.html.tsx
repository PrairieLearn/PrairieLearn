import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Accordion, Alert, Form, Modal } from 'react-bootstrap';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { useModalState } from '@prairielearn/ui';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { createCourseInstanceTrpcClient } from '../../../trpc/courseInstance/client.js';
import {
  TRPCProvider as CourseInstanceTRPCProvider,
  useTRPC as useCourseInstanceTRPC,
} from '../../../trpc/courseInstance/context.js';
import { CreditPoolDashboard } from '../../components/ai-grading-credits/CreditPoolDashboard.js';
import { AI_GRADING_PROVIDER_DISPLAY_NAMES } from '../../lib/ai-grading/ai-grading-models.shared.js';

import { AddApiKeyModal } from './AddApiKeyModal.js';
import { PurchaseCreditsModal } from './PurchaseCreditsModal.js';
import { RedeemFreeCreditModal } from './RedeemFreeCreditModal.js';
import type { AiGradingApiKeyCredential } from './utils/format.js';
import { createAiGradingSettingsTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

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

  const courseInstanceTRPC = useCourseInstanceTRPC();
  const customDeleteMutation = useMutation({
    ...courseInstanceTRPC.aiGradingProviders.destroy.mutationOptions(),
    onSuccess,
  });
  const deleteMutation = useMutation({
    ...trpc.deleteCredential.mutationOptions(),
    onSuccess,
  });

  const isPending = deleteMutation.isPending || customDeleteMutation.isPending;
  const deleteError = deleteMutation.error ?? customDeleteMutation.error;
  return (
    <Modal
      show={show}
      onHide={() => {
        if (!isPending) onHide();
      }}
      onExited={() => {
        deleteMutation.reset();
        customDeleteMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton={!isPending}>
        <Modal.Title>Delete API key</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {deleteError && (
          <Alert
            variant="danger"
            dismissible
            onClose={() => {
              deleteMutation.reset();
              customDeleteMutation.reset();
            }}
          >
            {deleteError.message}
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
          disabled={isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={isPending}
          onClick={() => {
            if (!data) return;
            if (data.provider === 'openai-compatible') {
              customDeleteMutation.mutate({ credential_id: data.id });
            } else {
              deleteMutation.mutate({ credential_id: data.id });
            }
          }}
        >
          {isPending ? 'Deleting...' : 'Delete'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export function InstructorInstanceAdminAiGrading({
  trpcCsrfToken,
  courseInstanceTrpcCsrfToken,
  courseInstanceId,
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountMilliDollars,
  courseLabel,
}: {
  trpcCsrfToken: string;
  courseInstanceTrpcCsrfToken: string;
  courseInstanceId: string;
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountMilliDollars: number | null;
  courseLabel: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAiGradingSettingsTrpcClient({ csrfToken: trpcCsrfToken }),
  );

  const [courseInstanceTrpcClient] = useState(() =>
    createCourseInstanceTrpcClient({ csrfToken: courseInstanceTrpcCsrfToken, courseInstanceId }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <CourseInstanceTRPCProvider trpcClient={courseInstanceTrpcClient} queryClient={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AiGradingSettingsContent
            initialUseCustomApiKeys={initialUseCustomApiKeys}
            initialApiKeyCredentials={initialApiKeyCredentials}
            canEdit={canEdit}
            stripePurchasingEnabled={stripePurchasingEnabled}
            initialCheckoutStatus={initialCheckoutStatus}
            initialCheckoutAmountMilliDollars={initialCheckoutAmountMilliDollars}
            courseLabel={courseLabel}
          />
        </TRPCProvider>
      </CourseInstanceTRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorInstanceAdminAiGrading.displayName = 'InstructorInstanceAdminAiGrading';

function AiGradingSettingsContent({
  initialUseCustomApiKeys,
  initialApiKeyCredentials,
  canEdit,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountMilliDollars,
  courseLabel,
}: {
  initialUseCustomApiKeys: boolean;
  initialApiKeyCredentials: AiGradingApiKeyCredential[];
  canEdit: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountMilliDollars: number | null;
  courseLabel: string;
}) {
  const trpc = useTRPC();

  const [useCustomApiKeys, setUseCustomApiKeys] = useState(initialUseCustomApiKeys);
  const [credentials, setCredentials] = useState(initialApiKeyCredentials);

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
            {canEdit
              ? 'Provide your own API keys instead of using the platform defaults.'
              : 'You must be a course owner to manage custom API keys.'}
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
                          {cred.base_url && (
                            <div className="small fw-normal text-muted text-break">
                              {cred.base_url}
                            </div>
                          )}
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
          initialCheckoutAmountMilliDollars={initialCheckoutAmountMilliDollars}
          courseLabel={courseLabel}
        />
      </div>

      <AddApiKeyModal
        {...addModalState}
        credentials={credentials}
        onSuccess={(credential) => {
          // Replace the local entry for this provider with the returned configuration.
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

function CreditPoolSection({
  useCustomApiKeys,
  canEdit,
  stripePurchasingEnabled,
  initialCheckoutStatus,
  initialCheckoutAmountMilliDollars,
  courseLabel,
}: {
  useCustomApiKeys: boolean;
  canEdit: boolean;
  stripePurchasingEnabled: boolean;
  initialCheckoutStatus: 'success' | 'cancelled' | null;
  initialCheckoutAmountMilliDollars: number | null;
  courseLabel: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const purchaseModalState = useModalState();
  const redeemModalState = useModalState();
  const [checkoutStatus, setCheckoutStatus] = useState(initialCheckoutStatus);
  const [redeemSuccessAmount, setRedeemSuccessAmount] = useState<number | null>(null);

  const freeCreditStatusQuery = useQuery(trpc.freeCreditStatus.queryOptions());

  // Reuses CreditPoolDashboard's TanStack cache to detect the empty state.
  const poolQuery = useQuery(trpc.creditPool.queryOptions());
  const changesQuery = useQuery({
    ...trpc.creditPoolChanges.queryOptions({ page: 1 }),
    enabled: poolQuery.data != null,
  });
  const hasNoBalance =
    poolQuery.data?.credit_transferable_milli_dollars === 0 &&
    poolQuery.data.credit_non_transferable_milli_dollars === 0;
  // While the balance is zero, wait for `changesQuery` before deciding whether
  // we're in the empty state — otherwise the top-right Purchase button flickers
  // in for one render between the two queries resolving.
  const isLoading =
    poolQuery.data == null || (hasNoBalance && !useCustomApiKeys && !changesQuery.isFetched);
  const isCreditPoolEmpty =
    hasNoBalance &&
    !useCustomApiKeys &&
    changesQuery.isFetched &&
    !changesQuery.isError &&
    (changesQuery.data?.totalCount ?? 0) === 0;

  useEffect(() => {
    if (initialCheckoutStatus === 'success') {
      // Refetch credit pool data after a successful purchase.
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({
        queryKey: trpc.creditPoolChanges.queryKey({ page: 1 }),
      });
    }
  }, [initialCheckoutStatus, queryClient, trpc]);

  const freeCreditStatus = freeCreditStatusQuery.data;
  const hasFreeCreditAvailable = (freeCreditStatus?.redemptions_remaining ?? 0) > 0;

  const successAlertAmount = redeemSuccessAmount ?? initialCheckoutAmountMilliDollars;
  const showSuccessAlert = redeemSuccessAmount != null || checkoutStatus === 'success';
  const dismissSuccessAlert = () => {
    setRedeemSuccessAmount(null);
    setCheckoutStatus(null);
  };

  return (
    <div className="border-top pt-3 mt-3">
      {showSuccessAlert && (
        <Alert variant="success" dismissible onClose={dismissSuccessAlert}>
          <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
          {successAlertAmount != null
            ? `${formatMilliDollars(successAlertAmount)} in credits were`
            : 'Credits have been'}{' '}
          added to your course instance.
        </Alert>
      )}
      {checkoutStatus === 'cancelled' && (
        <Alert variant="info" dismissible onClose={() => setCheckoutStatus(null)}>
          Payment cancelled. No credits were added.
        </Alert>
      )}
      <Accordion
        key={String(useCustomApiKeys)}
        defaultActiveKey={useCustomApiKeys ? undefined : 'credits'}
      >
        <Accordion.Item eventKey="credits">
          <Accordion.Header>
            <span className="d-flex align-items-center gap-2">
              AI grading credits
              {useCustomApiKeys && <span className="badge text-bg-secondary">Inactive</span>}
            </span>
          </Accordion.Header>
          <Accordion.Body>
            <div
              className={clsx(
                'd-flex justify-content-between align-items-center flex-wrap gap-2',
                useCustomApiKeys || (!canEdit && !isLoading && !isCreditPoolEmpty)
                  ? 'mb-1'
                  : 'mb-3',
              )}
            >
              {!isLoading && !isCreditPoolEmpty && (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {hasFreeCreditAvailable && (
                    <button
                      type="button"
                      className="btn btn-sm btn-success d-flex align-items-center gap-2"
                      disabled={!canEdit}
                      onClick={() => redeemModalState.showWithData(null)}
                    >
                      <i className="bi bi-gift" aria-hidden="true" />
                      Redeem free credit
                    </button>
                  )}
                  {stripePurchasingEnabled && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                      disabled={!canEdit}
                      onClick={() => purchaseModalState.showWithData(null)}
                    >
                      <i className="bi bi-cart-plus" aria-hidden="true" />
                      Purchase credits
                    </button>
                  )}
                </div>
              )}
            </div>
            {useCustomApiKeys && (
              <p className="text-muted small mb-3">
                While custom API keys are active, PrairieLearn AI grading credits are not deducted.
              </p>
            )}
            {!canEdit && !isLoading && !isCreditPoolEmpty && (
              <p className="text-muted small mb-3">
                You must be a course owner to purchase or redeem AI grading credits.
              </p>
            )}
            <CreditPoolDashboard
              trpc={trpc}
              balanceContext="instructor"
              dimmed={useCustomApiKeys}
              canEdit={canEdit}
              onPurchaseClick={
                stripePurchasingEnabled ? () => purchaseModalState.showWithData(null) : undefined
              }
              onRedeemFreeCreditClick={
                hasFreeCreditAvailable ? () => redeemModalState.showWithData(null) : undefined
              }
            />
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
      <PurchaseCreditsModal {...purchaseModalState} />
      <RedeemFreeCreditModal
        {...redeemModalState}
        redemptionsRemaining={freeCreditStatus?.redemptions_remaining ?? 0}
        maxRedemptions={freeCreditStatus?.max_redemptions ?? 0}
        courseLabel={courseLabel}
        onSuccess={setRedeemSuccessAmount}
      />
    </div>
  );
}

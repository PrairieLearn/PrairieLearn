import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal } from 'react-bootstrap';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION } from '../../lib/ai-grading-free-credit-constants.js';

import { useTRPC } from './utils/trpc-context.js';

export function RedeemFreeCreditModal({
  show,
  onHide,
  onExited,
  onSuccess,
  redemptionsRemaining,
  maxRedemptions,
  courseLabel,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: (amountMilliDollars: number) => void;
  redemptionsRemaining: number;
  maxRedemptions: number;
  courseLabel: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const redeemMutation = useMutation({
    ...trpc.redeemFreeCredit.mutationOptions(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: trpc.creditPool.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.creditPoolChanges.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.freeCreditStatus.queryKey() });
      onSuccess(data.amount_milli_dollars);
      onHide();
    },
  });

  const hasRedemptionsAvailable = redemptionsRemaining > 0;

  return (
    <Modal
      show={show}
      backdrop="static"
      onHide={onHide}
      onExited={() => {
        redeemMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Redeem free credits</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {redeemMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => redeemMutation.reset()}>
            {redeemMutation.error.message}
          </Alert>
        )}
        <dl className="row mb-0">
          <dt className="col-sm-5 fw-normal">Credits to add:</dt>
          <dd className="col-sm-7 mb-2 fw-bold">
            {formatMilliDollars(FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION)}
          </dd>
          <dt className="col-sm-5 fw-normal">Free credit remaining:</dt>
          <dd className="col-sm-7 mb-0 fw-bold">
            {redemptionsRemaining} of {maxRedemptions}
          </dd>
        </dl>
        {hasRedemptionsAvailable && (
          <p className="text-muted small mt-3 mb-0">
            You may redeem {maxRedemptions} times across all {courseLabel} course instances.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={redeemMutation.isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={redeemMutation.isPending || redemptionsRemaining <= 0}
          onClick={() => redeemMutation.mutate()}
        >
          {redeemMutation.isPending ? 'Redeeming...' : 'Redeem'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

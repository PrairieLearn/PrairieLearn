import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';

import {
  APPROX_COST_PER_SUBMISSION_DOLLARS,
  CREDIT_PACKAGES,
  MAX_PURCHASE_MILLI_DOLLARS,
  MIN_PURCHASE_MILLI_DOLLARS,
} from '../../lib/ai-grading-credit-purchase-constants.js';

import { useTRPC } from './utils/trpc-context.js';

/**
 * Rounds a raw submission estimate to a "friendly" number for display.
 * Progressively coarsens rounding as numbers grow so estimates feel natural
 * (e.g. 3,333 → 3,300).
 */
function roundEstimate(dollars: number): number {
  const raw = Math.floor(dollars / APPROX_COST_PER_SUBMISSION_DOLLARS);
  if (raw >= 1000) return Math.floor(raw / 100) * 100;
  if (raw >= 100) return Math.floor(raw / 50) * 50;
  if (raw >= 10) return Math.floor(raw / 10) * 10;
  return raw;
}

/** Cap at 1,000,000 to prevent horizontal overflow. */
function formatSubmissionCount(count: number): string {
  if (count >= 1_000_000) return '1,000,000+';
  return count.toLocaleString();
}

type SelectedPackage = { type: 'preset'; dollars: number } | { type: 'custom' };

function PresetPackageCard({
  dollars,
  tagline,
  isSelected,
  onSelect,
}: {
  dollars: number;
  tagline: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const estimate = formatSubmissionCount(roundEstimate(dollars));

  return (
    <div
      className={clsx('card', {
        'border-primary bg-primary bg-opacity-10': isSelected,
      })}
      style={{ cursor: 'pointer' }}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="card-body py-3 px-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-1 gap-sm-3">
          <div className="fw-bold" style={{ fontSize: '1.15rem', flexShrink: 0, minWidth: '45px' }}>
            {`$${dollars}`}
          </div>
          <div className="d-flex flex-column flex-lg-row flex-lg-fill gap-lg-3">
            <div className="text-muted me-lg-auto">{tagline}</div>
            <div>
              Grades about <strong>{estimate}</strong> submissions
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomPackageCard({
  isSelected,
  customAmount,
  onSelect,
  onAmountChange,
}: {
  isSelected: boolean;
  customAmount: string;
  onSelect: () => void;
  onAmountChange: (value: string) => void;
}) {
  const minDollars = MIN_PURCHASE_MILLI_DOLLARS / 1000;
  const maxDollars = MAX_PURCHASE_MILLI_DOLLARS / 1000;
  const customDollars = Math.max(0, Number.parseInt(customAmount || '0', 10));
  const estimate = customDollars >= 1 ? roundEstimate(customDollars) : null;

  return (
    <div
      className={clsx('card', {
        'border-primary bg-primary bg-opacity-10': isSelected,
      })}
      style={{ cursor: 'pointer' }}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="card-body py-3 px-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2 gap-sm-3">
          {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions */}
          <div style={{ width: '120px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="input-group">
              <span className="input-group-text">$</span>
              <input
                type="number"
                className="form-control"
                step="1"
                min={minDollars}
                max={maxDollars}
                value={customAmount}
                aria-label="Custom dollar amount"
                onFocus={onSelect}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onAmountChange('');
                    return;
                  }
                  const num = Number.parseInt(raw, 10);
                  if (!Number.isFinite(num) || num < 0) {
                    return;
                  }
                  onAmountChange(raw);
                }}
                // Block decimal/negative/exponent keys so users can only type integers.
                onKeyDown={(e) => {
                  if (e.key === '.' || e.key === '-' || e.key === 'e') {
                    e.preventDefault();
                  }
                }}
              />
            </div>
          </div>
          <div className="d-flex flex-column flex-lg-row flex-lg-fill gap-lg-3">
            <div className="text-muted me-lg-auto">Enter your own amount</div>
            <div>
              {estimate != null ? (
                <span>
                  Grades about <strong>{formatSubmissionCount(estimate)}</strong> submissions
                </span>
              ) : (
                <span className="text-muted">Enter amount for estimate</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PurchaseCreditsModal({
  show,
  onHide,
  onExited,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
}) {
  const trpc = useTRPC();
  // Stored as a string so the input field can show an empty value while typing.
  const [customAmount, setCustomAmount] = useState('50');
  const [selected, setSelected] = useState<SelectedPackage>({
    type: 'preset',
    dollars: CREDIT_PACKAGES[1].dollars,
  });

  const checkoutMutation = useMutation({
    ...trpc.createCheckout.mutationOptions(),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
  });

  const customDollars = Math.max(0, Number.parseInt(customAmount || '0', 10));
  const purchaseDollars = selected.type === 'preset' ? selected.dollars : customDollars;
  const amountMilliDollars = purchaseDollars * 1000;
  const minDollars = MIN_PURCHASE_MILLI_DOLLARS / 1000;
  const maxDollars = MAX_PURCHASE_MILLI_DOLLARS / 1000;
  const canProceed = purchaseDollars >= minDollars && purchaseDollars <= maxDollars;

  const isCustomOutOfRange = selected.type === 'custom' && customAmount !== '' && !canProceed;
  const [showHint, setShowHint] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    // Delay showing the hint so it doesn't flash while the user is still
    // typing through an invalid intermediate state. Hide immediately when valid.
    debounceRef.current = setTimeout(
      () => {
        setShowHint(isCustomOutOfRange);
      },
      isCustomOutOfRange ? 200 : 0,
    );
    return () => clearTimeout(debounceRef.current);
  }, [isCustomOutOfRange]);

  const hintMessage = showHint
    ? purchaseDollars < minDollars
      ? `Enter an amount of at least $${minDollars}.`
      : `Enter an amount of at most $${maxDollars.toLocaleString()}.`
    : null;

  function handleProceed() {
    checkoutMutation.mutate({ amount_milli_dollars: amountMilliDollars });
  }

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={onHide}
      onExited={() => {
        setCustomAmount('50');
        setSelected({ type: 'preset', dollars: CREDIT_PACKAGES[1].dollars });
        checkoutMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Purchase AI grading credits</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {checkoutMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => checkoutMutation.reset()}>
            {checkoutMutation.error.message}
          </Alert>
        )}
        <div className="mb-2 fw-semibold" style={{ fontSize: '0.85rem' }}>
          Package
        </div>
        <div className="d-flex flex-column gap-2" role="radiogroup" aria-label="Credit package">
          {CREDIT_PACKAGES.map((pkg) => (
            <PresetPackageCard
              key={pkg.dollars}
              dollars={pkg.dollars}
              tagline={pkg.tagline}
              isSelected={selected.type === 'preset' && selected.dollars === pkg.dollars}
              onSelect={() => setSelected({ type: 'preset', dollars: pkg.dollars })}
            />
          ))}

          <div className="mt-2 mb-1 fw-semibold" style={{ fontSize: '0.85rem' }}>
            Custom package
          </div>
          <CustomPackageCard
            isSelected={selected.type === 'custom'}
            customAmount={customAmount}
            onSelect={() => setSelected({ type: 'custom' })}
            onAmountChange={setCustomAmount}
          />
          {hintMessage && (
            <Alert variant="warning" className="mt-2 mb-0 py-2 small">
              {hintMessage}
            </Alert>
          )}
        </div>

        <p className="text-muted mt-3 mb-0 small">
          Actual number of graded submissions varies based on question, submission, and rubric size.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={checkoutMutation.isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={checkoutMutation.isPending || !canProceed}
          onClick={handleProceed}
        >
          {checkoutMutation.isPending ? 'Redirecting...' : 'Proceed to payment'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

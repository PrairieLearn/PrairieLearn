import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';
import { assertNever } from '@prairielearn/utils';

import {
  AI_GRADING_MODELS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION } from '../../../../ee/lib/ai-grading-free-credit-constants.js';
import { formatMilliDollars } from '../../../../lib/ai-grading-credits.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';

type AiGradingAvailabilityState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'concurrency_limit'; maxConcurrentJobs: number }
  | { kind: 'no_keys' }
  | { kind: 'ready_with_keys' }
  | { kind: 'no_credits'; freeCreditRedemptionsRemaining: number }
  | { kind: 'ready_with_credits'; creditBalanceMilliDollars: number };

export type AiGradingModelSelectionModalState =
  | { type: 'all'; numToGrade: number }
  | { type: 'human_graded'; numToGrade: number }
  | { type: 'selected'; ids: string[]; numToGrade: number }
  | null;

function getSelection(
  state: NonNullable<AiGradingModelSelectionModalState>,
): 'all' | 'human_graded' | string[] {
  if (state.type === 'selected') return state.ids;
  return state.type;
}

/**
 * Returns the preferred model if available, otherwise falls back to the first
 * model whose provider is in the available list. A previously preferred model
 * might not be available (e.g. if the user switched from PrairieLearn-managed
 * to custom API keys).
 */
function getDefaultModel(
  aiGradingLastSelectedModel: string | null,
  availableProviders: EnumAiGradingProvider[],
): AiGradingModelId {
  const preferred = AI_GRADING_MODELS.find((m) => m.modelId === aiGradingLastSelectedModel);
  if (preferred && availableProviders.includes(preferred.provider)) {
    return preferred.modelId;
  }
  const firstAvailable = AI_GRADING_MODELS.find((m) => availableProviders.includes(m.provider));
  if (firstAvailable) {
    return firstAvailable.modelId;
  }
  return DEFAULT_AI_GRADING_MODEL;
}

function ModelOption({
  model,
  isSelected,
  isAvailable,
  aiGradingEnabled,
  relativeCost,
  onSelect,
}: {
  model: (typeof AI_GRADING_MODELS)[number];
  isSelected: boolean;
  isAvailable: boolean;
  aiGradingEnabled: boolean;
  relativeCost: string;
  onSelect: () => void;
}) {
  const isInteractive = isAvailable && aiGradingEnabled;
  const option = (
    <label
      key={model.modelId}
      htmlFor={`model-${model.modelId}`}
      className={clsx('rounded-2 px-3 py-2 mb-0 border', {
        'border-primary bg-primary bg-opacity-10': isSelected,
        'border-transparent': !isSelected && isInteractive,
        'opacity-75 border-transparent': !isInteractive,
      })}
      style={{ cursor: isInteractive ? 'pointer' : 'default' }}
    >
      <div className="d-flex align-items-center justify-content-between">
        <Form.Check
          type="radio"
          id={`model-${model.modelId}`}
          name="ai-grading-model"
          className="mb-0"
          disabled={!isInteractive}
          checked={isSelected}
          label={
            <div>
              <span className="fw-medium">{model.name}</span>
              <div className="text-muted small">{model.sublabel}</div>
              {/* Cost shown below sublabel on xs viewports */}
              <div className="text-muted small d-sm-none">{relativeCost}</div>
            </div>
          }
          onChange={onSelect}
        />
        {/* Cost shown inline on sm+ viewports */}
        <span className="text-muted small text-nowrap ms-3 d-none d-sm-inline">{relativeCost}</span>
      </div>
    </label>
  );

  return isAvailable ? (
    option
  ) : (
    <OverlayTrigger
      key={model.modelId}
      placement="top"
      tooltip={{
        props: { id: `model-tooltip-${model.modelId}` },
        body: 'No API key configured for this provider',
      }}
    >
      {option}
    </OverlayTrigger>
  );
}

function ModelList({
  selectedModel,
  availableProviders,
  aiGradingEnabled,
  relativeCosts,
  onSelect,
}: {
  selectedModel: AiGradingModelId;
  availableProviders: EnumAiGradingProvider[];
  aiGradingEnabled: boolean;
  relativeCosts: Record<string, string>;
  onSelect: (modelId: AiGradingModelId) => void;
}) {
  const recommended = AI_GRADING_MODELS.filter((m) => m.recommended);
  const other = AI_GRADING_MODELS.filter((m) => !m.recommended);
  const hasOtherSelected = other.some((m) => m.modelId === selectedModel);
  const [otherExpanded, setOtherExpanded] = useState(hasOtherSelected);

  return (
    <div className="d-flex flex-column gap-4">
      <div>
        <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
          <span className="fw-semibold">Recommended models</span>
          <span className="text-muted small text-end">
            Relative cost{' '}
            <OverlayTrigger
              placement="top"
              tooltip={{
                props: { id: 'cost-tooltip' },
                body: 'Relative cost compared to the default model, based on standard token usage.',
              }}
            >
              <i className="bi bi-question-circle" aria-hidden="true" />
            </OverlayTrigger>
          </span>
        </div>
        <div className="d-flex flex-column gap-1">
          {recommended.map((model) => (
            <ModelOption
              key={model.modelId}
              model={model}
              isSelected={selectedModel === model.modelId}
              isAvailable={availableProviders.includes(model.provider)}
              aiGradingEnabled={aiGradingEnabled}
              relativeCost={relativeCosts[model.modelId]}
              onSelect={() => onSelect(model.modelId)}
            />
          ))}
        </div>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-link p-0 text-muted text-decoration-none"
          onClick={() => setOtherExpanded((prev) => !prev)}
        >
          <i
            className={`bi bi-chevron-${otherExpanded ? 'down' : 'right'} me-1`}
            aria-hidden="true"
          />
          Other models
        </button>
        {otherExpanded && (
          <div className="d-flex flex-column gap-1 mt-2">
            {other.map((model) => (
              <ModelOption
                key={model.modelId}
                model={model}
                isSelected={selectedModel === model.modelId}
                isAvailable={availableProviders.includes(model.provider)}
                aiGradingEnabled={aiGradingEnabled}
                relativeCost={relativeCosts[model.modelId]}
                onSelect={() => onSelect(model.modelId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsLink({ url, text }: { url: string; text: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
}

function expandRubricSettings() {
  const panel = document.getElementById('rubric-setting');
  if (!panel) return;
  const target = document.getElementById('rubric-editor') ?? panel;
  const scroll = () => target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (panel.classList.contains('show')) {
    scroll();
    return;
  }
  // Wait for the Bootstrap collapse animation to finish so the post-expansion
  // layout is what gets scrolled to, not the pre-expansion (zero-height) one.
  panel.addEventListener('shown.bs.collapse', scroll, { once: true });
  const toggle = document.querySelector<HTMLElement>('[data-bs-target="#rubric-setting"]');
  toggle?.click();
}

function NoCreditsAlert({
  freeCreditRedemptionsRemaining,
  aiGradingSettingsUrl,
  isRedeeming,
  redeemErrorMessage,
  onRedeem,
  onDismissError,
}: {
  freeCreditRedemptionsRemaining: number;
  aiGradingSettingsUrl: string;
  isRedeeming: boolean;
  redeemErrorMessage: string | null;
  onRedeem: () => void;
  onDismissError: () => void;
}) {
  const canRedeem = freeCreditRedemptionsRemaining > 0;
  return (
    <>
      <div>No AI grading credits added.</div>
      <div className="d-flex flex-wrap gap-2 mt-2">
        {canRedeem && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isRedeeming}
            onClick={onRedeem}
          >
            {isRedeeming
              ? 'Redeeming...'
              : `Redeem ${formatMilliDollars(FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION)} in free credit`}
          </Button>
        )}
        <Button
          type="button"
          variant="outline-secondary"
          size="sm"
          href={aiGradingSettingsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {canRedeem ? 'Purchase more' : 'Purchase credits'}
        </Button>
      </div>
      {redeemErrorMessage && (
        <Alert variant="danger" className="mt-2 mb-0 py-2" dismissible onClose={onDismissError}>
          {redeemErrorMessage}
        </Alert>
      )}
    </>
  );
}

interface BeforeYouGradeItem {
  key: string;
  title: React.ReactNode;
  description: React.ReactNode;
  onClick?: () => void;
  variant?: 'warning';
}

function buildBeforeYouGradeItems({
  hasRubric,
  hasPriorJobs,
  numToGrade,
  totalSubmissionCount,
  onCreateRubric,
  onAutoSelectForTest,
}: {
  hasRubric: boolean;
  hasPriorJobs: boolean;
  numToGrade: number;
  totalSubmissionCount: number;
  onCreateRubric: () => void;
  onAutoSelectForTest: (n: number) => void;
}): BeforeYouGradeItem[] {
  const items: BeforeYouGradeItem[] = [];
  if (!hasRubric) {
    items.push({
      key: 'no_rubric',
      title: 'Create a rubric',
      description: 'Rubrics significantly improve accuracy and consistency.',
      onClick: onCreateRubric,
      variant: 'warning',
    });
  }
  if (!hasPriorJobs && numToGrade > 5 && totalSubmissionCount >= 2) {
    const n = Math.min(5, totalSubmissionCount);
    items.push({
      key: 'test_with_n',
      title: `Test with ${n} ${n === 1 ? 'submission' : 'submissions'}`,
      description: 'Confirm your rubric works well before running on all submissions.',
      onClick: () => onAutoSelectForTest(n),
      variant: 'warning',
    });
  }
  return items;
}

function BeforeYouGradeCard({ item }: { item: BeforeYouGradeItem }) {
  const isWarning = item.variant === 'warning';
  const titleNode = item.onClick ? (
    <div>
      <Button
        type="button"
        variant="link"
        className="p-0 align-baseline fw-medium text-decoration-none"
        style={{ fontSize: 'inherit' }}
        onClick={item.onClick}
      >
        {item.title}
      </Button>
    </div>
  ) : (
    <div className="fw-medium">{item.title}</div>
  );
  return (
    <div
      className={clsx(
        'rounded-2 px-3 py-2',
        isWarning
          ? 'border border-warning bg-warning bg-opacity-10 d-flex align-items-start gap-2'
          : 'border',
      )}
    >
      {isWarning && (
        <i className="bi bi-exclamation-triangle-fill text-warning mt-1" aria-hidden="true" />
      )}
      <div className="flex-grow-1">
        {titleNode}
        <div className="text-muted small">{item.description}</div>
      </div>
    </div>
  );
}

function BeforeYouGradeSection({ items }: { items: BeforeYouGradeItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
        <span className="fw-semibold">Before you grade</span>
      </div>
      <div className="d-flex flex-column gap-2">
        {items.map((item) => (
          <BeforeYouGradeCard key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

interface ModalAlert {
  key: string;
  variant: 'info' | 'warning' | 'danger' | 'success';
  body: React.ReactNode;
  small?: boolean;
}

function buildModalAlerts({
  state,
  isRedeemSuccess,
  isRedeeming,
  redeemErrorMessage,
  aiGradingSettingsUrl,
  onRetryAvailability,
  onRedeem,
  onDismissRedeemError,
}: {
  state: AiGradingAvailabilityState;
  isRedeemSuccess: boolean;
  isRedeeming: boolean;
  redeemErrorMessage: string | null;
  aiGradingSettingsUrl: string;
  onRetryAvailability: () => void;
  onRedeem: () => void;
  onDismissRedeemError: () => void;
}): ModalAlert[] {
  switch (state.kind) {
    case 'loading':
      return [
        {
          key: 'loading',
          variant: 'info',
          body: (
            <span className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              Loading AI grading status...
            </span>
          ),
        },
      ];
    case 'error':
      return [
        {
          key: 'error',
          variant: 'danger',
          body: (
            <>
              Unable to load AI grading status.{' '}
              <Button
                type="button"
                variant="link"
                className="p-0 align-baseline"
                style={{ fontSize: 'inherit' }}
                onClick={onRetryAvailability}
              >
                Try again.
              </Button>
            </>
          ),
        },
      ];
    case 'concurrency_limit':
      return [
        {
          key: 'concurrency_limit',
          variant: 'warning',
          body: (
            <>
              You've reached the limit of {state.maxConcurrentJobs} concurrent AI grading jobs.
              Please wait for running jobs to finish.
            </>
          ),
        },
      ];
    case 'ready_with_keys':
      return [
        {
          key: 'billing_keys',
          variant: 'info',
          body: (
            <>
              Billing to custom API key &middot;{' '}
              <SettingsLink url={aiGradingSettingsUrl} text="Manage keys" />
            </>
          ),
        },
      ];
    case 'no_keys':
      return [
        {
          key: 'no_keys',
          variant: 'danger',
          body: (
            <>
              No custom API keys configured &middot;{' '}
              <SettingsLink url={aiGradingSettingsUrl} text="Manage keys" />
            </>
          ),
        },
      ];
    case 'no_credits':
      return [
        {
          key: 'no_credits',
          variant: 'info',
          body: (
            <NoCreditsAlert
              freeCreditRedemptionsRemaining={state.freeCreditRedemptionsRemaining}
              aiGradingSettingsUrl={aiGradingSettingsUrl}
              isRedeeming={isRedeeming}
              redeemErrorMessage={redeemErrorMessage}
              onRedeem={onRedeem}
              onDismissError={onDismissRedeemError}
            />
          ),
        },
      ];
    case 'ready_with_credits': {
      const alerts: ModalAlert[] = [];
      if (isRedeemSuccess) {
        alerts.push({
          key: 'redeem_success',
          variant: 'success',
          small: true,
          body: (
            <>
              {formatMilliDollars(FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION)} in credit
              added!
            </>
          ),
        });
      }
      alerts.push({
        key: 'billing_credits',
        variant: 'info',
        small: true,
        body: (
          <>
            Billing to credit pool &middot; {formatMilliDollars(state.creditBalanceMilliDollars)}{' '}
            available &middot; <SettingsLink url={aiGradingSettingsUrl} text="Manage credits" />
          </>
        ),
      });
      return alerts;
    }
    default:
      return assertNever(state);
  }
}

export function AiGradingModelSelectionModal({
  modalState,
  availableProviders,
  aiGradingLastSelectedModel,
  relativeCosts,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  hasRubric,
  totalSubmissionCount,
  onAutoSelectForTest,
  onSuccess,
  onHide,
}: {
  modalState: AiGradingModelSelectionModalState;
  availableProviders: EnumAiGradingProvider[];
  aiGradingLastSelectedModel: string | null;
  relativeCosts: Record<string, string>;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  hasRubric: boolean;
  totalSubmissionCount: number;
  onAutoSelectForTest: (n: number) => void;
  onSuccess: (
    data: { job_sequence_id: string; job_sequence_token: string },
    modelId: AiGradingModelId,
  ) => void;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutate, reset, isPending, isError, error } = useMutation(
    trpc.manualGrading.aiGradeInstanceQuestions.mutationOptions(),
  );
  const {
    mutate: redeemFreeCredit,
    reset: resetRedeem,
    isPending: isRedeeming,
    isSuccess: isRedeemSuccess,
    isError: isRedeemError,
    error: redeemError,
  } = useMutation({
    ...trpc.manualGrading.redeemFreeCredit.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.manualGrading.aiGradingAvailabilityInfo.queryKey(),
      });
    },
  });
  const isModalOpen = modalState != null;
  const {
    data: aiGradingAvailabilityInfo,
    isFetching: isAvailabilityFetching,
    isError: isAvailabilityError,
    refetch: refetchAvailabilityInfo,
  } = useQuery({
    ...trpc.manualGrading.aiGradingAvailabilityInfo.queryOptions(),
    enabled: isModalOpen,
    refetchOnMount: 'always',
  });
  const defaultModel = getDefaultModel(aiGradingLastSelectedModel, availableProviders);
  const [selectedModel, setSelectedModel] = useState<AiGradingModelId>(defaultModel);

  const handleClose = useCallback(() => {
    setSelectedModel(defaultModel);
    reset();
    resetRedeem();
    onHide();
  }, [onHide, reset, resetRedeem, defaultModel]);

  const handleCreateRubric = useCallback(() => {
    onHide();
    setTimeout(expandRubricSettings, 250);
  }, [onHide]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!modalState) return;

      mutate(
        {
          selection: getSelection(modalState),
          model_id: selectedModel,
        },
        {
          onSuccess: (data) => {
            onSuccess(data, selectedModel);
            onHide();
          },
        },
      );
    },
    [modalState, selectedModel, mutate, onSuccess, onHide],
  );

  const selectedModelProvider = AI_GRADING_MODELS.find(
    (m) => m.modelId === selectedModel,
  )?.provider;

  const isSelectedModelAvailable = selectedModelProvider
    ? availableProviders.includes(selectedModelProvider)
    : false;

  const aiGradingAvailabilityState = run<AiGradingAvailabilityState>(() => {
    // Show the spinner while a refetch is in flight so the error UI doesn't
    // persist after the user clicks "Try again".
    if (isAvailabilityFetching || aiGradingAvailabilityInfo == null) return { kind: 'loading' };
    if (isAvailabilityError) return { kind: 'error' };

    const {
      running_job_count,
      max_concurrent_jobs,
      credit_balance_milli_dollars,
      free_credit_redemptions_remaining,
    } = aiGradingAvailabilityInfo;

    if (running_job_count >= max_concurrent_jobs) {
      return { kind: 'concurrency_limit', maxConcurrentJobs: max_concurrent_jobs };
    }
    if (useCustomApiKeys) {
      if (availableProviders.length === 0) return { kind: 'no_keys' };
      return { kind: 'ready_with_keys' };
    }
    if (credit_balance_milli_dollars <= 0) {
      return {
        kind: 'no_credits',
        freeCreditRedemptionsRemaining: free_credit_redemptions_remaining,
      };
    }
    return { kind: 'ready_with_credits', creditBalanceMilliDollars: credit_balance_milli_dollars };
  });

  const aiGradingEnabled =
    aiGradingAvailabilityState.kind === 'ready_with_keys' ||
    aiGradingAvailabilityState.kind === 'ready_with_credits';

  const modalAlerts = buildModalAlerts({
    state: aiGradingAvailabilityState,
    isRedeemSuccess,
    isRedeeming,
    redeemErrorMessage: isRedeemError ? redeemError.message : null,
    aiGradingSettingsUrl,
    onRetryAvailability: () => {
      void refetchAvailabilityInfo();
    },
    onRedeem: () => redeemFreeCredit(),
    onDismissRedeemError: () => resetRedeem(),
  });

  const beforeYouGradeItems = aiGradingEnabled
    ? buildBeforeYouGradeItems({
        hasRubric,
        hasPriorJobs: aiGradingAvailabilityInfo?.has_prior_jobs ?? true,
        numToGrade: modalState?.numToGrade ?? 0,
        totalSubmissionCount,
        onCreateRubric: handleCreateRubric,
        onAutoSelectForTest,
      })
    : [];

  return (
    <Modal show={isModalOpen} size="lg" backdrop="static" keyboard={false} onHide={handleClose}>
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Select grading model</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {modalAlerts.map((alert) => (
            <Alert
              key={alert.key}
              variant={alert.variant}
              className={clsx('mb-3', alert.small ? 'py-2 small' : 'py-3')}
            >
              {alert.body}
            </Alert>
          ))}
          <ModelList
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            aiGradingEnabled={aiGradingEnabled}
            relativeCosts={relativeCosts}
            onSelect={setSelectedModel}
          />
          <BeforeYouGradeSection items={beforeYouGradeItems} />
        </Modal.Body>

        <Modal.Footer>
          <div className="m-0 w-100">
            {isError && (
              <Alert variant="danger" className="mb-2" dismissible onClose={() => reset()}>
                <strong>Error:</strong> {error.message}
              </Alert>
            )}
            <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center justify-content-end gap-2 mb-1">
              <Button variant="secondary" disabled={isPending} onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isPending || !isSelectedModelAvailable || !aiGradingEnabled}
                type="submit"
              >
                {isPending
                  ? 'Submitting...'
                  : modalState
                    ? `Grade ${modalState.numToGrade} ${modalState.numToGrade === 1 ? 'submission' : 'submissions'}`
                    : 'Grade submissions'}
              </Button>
            </div>
            <small className="text-muted mt-2 mb-0 text-end d-block">
              AI can make mistakes. Review grades before finalizing.
            </small>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

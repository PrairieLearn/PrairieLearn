import { useMutation, useQuery } from '@tanstack/react-query';
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
import { formatMilliDollars } from '../../../../lib/ai-grading-credits.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';

type ModelSelectorStatus =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'concurrency_limit'; maxConcurrentJobs: number }
  | { kind: 'no_keys' }
  | { kind: 'ready_with_keys' }
  | { kind: 'no_credits' }
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
  relativeCost,
  onSelect,
}: {
  model: (typeof AI_GRADING_MODELS)[number];
  isSelected: boolean;
  isAvailable: boolean;
  relativeCost: string;
  onSelect: () => void;
}) {
  const option = (
    <label
      key={model.modelId}
      htmlFor={`model-${model.modelId}`}
      className={clsx('rounded-2 px-3 py-2 mb-0 border', {
        'border-primary bg-primary bg-opacity-10': isSelected,
        'border-transparent': !isSelected && isAvailable,
        'opacity-75 border-transparent': !isAvailable,
      })}
      style={{ cursor: isAvailable ? 'pointer' : 'default' }}
    >
      <div className="d-flex align-items-center justify-content-between">
        <Form.Check
          type="radio"
          id={`model-${model.modelId}`}
          name="ai-grading-model"
          className="mb-0"
          disabled={!isAvailable}
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
  relativeCosts,
  onSelect,
}: {
  selectedModel: AiGradingModelId;
  availableProviders: EnumAiGradingProvider[];
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
          <span className="fw-semibold">Recommended</span>
          <span className="text-muted small text-end">
            Relative cost{' '}
            <OverlayTrigger
              placement="top"
              tooltip={{
                props: { id: 'cost-tooltip' },
                body: 'Relative cost compared to the least expensive model, based on standard token usage.',
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

function BillingAlert({
  status,
  aiGradingSettingsUrl,
  onRetryStatus,
}: {
  status: ModelSelectorStatus;
  aiGradingSettingsUrl: string;
  onRetryStatus: () => void;
}) {
  switch (status.kind) {
    case 'loading':
      return (
        <Alert variant="info" className="mb-3 py-2 small d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" />
          Loading AI grading status...
        </Alert>
      );
    case 'error':
      return (
        <Alert variant="danger" className="mb-3 py-2 small">
          Unable to load AI grading status.{' '}
          <Button
            type="button"
            variant="link"
            className="p-0 align-baseline"
            onClick={onRetryStatus}
          >
            Try again.
          </Button>
        </Alert>
      );
    case 'concurrency_limit':
      return (
        <Alert variant="warning" className="mb-3 py-2 small">
          You've reached the limit of {status.maxConcurrentJobs} concurrent AI grading jobs. Please
          try again later.
        </Alert>
      );
    case 'ready_with_keys':
      return (
        <Alert variant="info" className="mb-3 py-2 small">
          Billing to custom API key &middot;{' '}
          <a href={aiGradingSettingsUrl} target="_blank" rel="noopener noreferrer">
            Manage keys
          </a>
        </Alert>
      );
    case 'no_keys':
      return (
        <Alert variant="danger" className="mb-3 py-2 small">
          No custom API keys configured &middot;{' '}
          <a href={aiGradingSettingsUrl} target="_blank" rel="noopener noreferrer">
            Manage keys
          </a>
        </Alert>
      );
    case 'ready_with_credits':
      return (
        <Alert variant="info" className="mb-3 py-2 small">
          Billing to credit pool &middot; {formatMilliDollars(status.creditBalanceMilliDollars)}{' '}
          available &middot;{' '}
          <a href={aiGradingSettingsUrl} target="_blank" rel="noopener noreferrer">
            Manage credits
          </a>
        </Alert>
      );
    case 'no_credits':
      // TODO: Update to "No credits remaining. Purchase credits in the
      // AI grading settings page." when the Stripe integration PR is merged.
      return (
        <Alert variant="danger" className="mb-3 py-2 small">
          No credits remaining. Request for more credits to continue grading.{' '}
          <a href={aiGradingSettingsUrl} target="_blank" rel="noopener noreferrer">
            More info
          </a>
        </Alert>
      );
    default:
      assertNever(status);
  }
}

export function AiGradingModelSelectionModal({
  modalState,
  availableProviders,
  aiGradingLastSelectedModel,
  relativeCosts,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  onSuccess,
  onHide,
}: {
  modalState: AiGradingModelSelectionModalState;
  availableProviders: EnumAiGradingProvider[];
  aiGradingLastSelectedModel: string | null;
  relativeCosts: Record<string, string>;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  onSuccess: (
    data: { job_sequence_id: string; job_sequence_token: string },
    modelId: AiGradingModelId,
  ) => void;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const { mutate, reset, isPending, isError, error } = useMutation(
    trpc.manualGrading.aiGradeInstanceQuestions.mutationOptions(),
  );
  const isModalOpen = modalState != null;
  const {
    data: aiGradingStatus,
    isFetching: isAiGradingStatusFetching,
    isError: isAiGradingStatusError,
    refetch: refetchAiGradingStatus,
  } = useQuery({
    ...trpc.manualGrading.aiGradingStatus.queryOptions(),
    enabled: isModalOpen,
    refetchOnMount: 'always',
  });
  const defaultModel = getDefaultModel(aiGradingLastSelectedModel, availableProviders);
  const [selectedModel, setSelectedModel] = useState<AiGradingModelId>(defaultModel);

  const handleClose = useCallback(() => {
    setSelectedModel(defaultModel);
    reset();
    onHide();
  }, [onHide, reset, defaultModel]);

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

  const status = run<ModelSelectorStatus>(() => {
    if (isAiGradingStatusFetching || aiGradingStatus == null) return { kind: 'loading' };
    if (isAiGradingStatusError) return { kind: 'error' };
    if (aiGradingStatus.running_job_count >= aiGradingStatus.max_concurrent_jobs) {
      return { kind: 'concurrency_limit', maxConcurrentJobs: aiGradingStatus.max_concurrent_jobs };
    }
    if (useCustomApiKeys) {
      return availableProviders.length === 0 ? { kind: 'no_keys' } : { kind: 'ready_with_keys' };
    }
    return aiGradingStatus.credit_balance_milli_dollars > 0
      ? {
          kind: 'ready_with_credits',
          creditBalanceMilliDollars: aiGradingStatus.credit_balance_milli_dollars,
        }
      : { kind: 'no_credits' };
  });

  const isGradingEnabled =
    status.kind === 'ready_with_keys' || status.kind === 'ready_with_credits';

  return (
    <Modal show={isModalOpen} size="lg" backdrop="static" keyboard={false} onHide={handleClose}>
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Select grading model</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <BillingAlert
            status={status}
            aiGradingSettingsUrl={aiGradingSettingsUrl}
            onRetryStatus={() => {
              void refetchAiGradingStatus();
            }}
          />
          <ModelList
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            relativeCosts={relativeCosts}
            onSelect={setSelectedModel}
          />
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
                disabled={isPending || !isSelectedModelAvailable || !isGradingEnabled}
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

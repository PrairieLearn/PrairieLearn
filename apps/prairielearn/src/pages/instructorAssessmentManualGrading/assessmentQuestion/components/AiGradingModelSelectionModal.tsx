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

type AiGradingAvailabilityState =
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
          <span className="fw-semibold">Recommended</span>
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

// Opens the rubric settings collapse panel (if not already open) and scrolls to
// the editor. Used by the BeforeYouGradeCard "Create a rubric" action to guide
// the instructor to the authoring UI after dismissing the modal.
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

interface BeforeYouGradeItem {
  key: string;
  title: React.ReactNode;
  description: React.ReactNode;
  onClick?: () => void;
}

function buildBeforeYouGradeItems({
  hasRubric,
  hasPriorJobs,
  numToGrade,
  totalSubmissionCount,
  onCreateRubric,
  onAutoSelectForTestBatch,
}: {
  hasRubric: boolean;
  hasPriorJobs: boolean;
  numToGrade: number;
  totalSubmissionCount: number;
  onCreateRubric: () => void;
  onAutoSelectForTestBatch: (n: number) => void;
}): BeforeYouGradeItem[] {
  const items: BeforeYouGradeItem[] = [];
  if (!hasRubric) {
    items.push({
      key: 'no_rubric',
      title: 'Create a rubric',
      description: 'Rubrics significantly improve accuracy and consistency.',
      onClick: onCreateRubric,
    });
  }
  if (!hasPriorJobs && numToGrade > 5 && totalSubmissionCount >= 2) {
    const n = Math.min(5, totalSubmissionCount);
    items.push({
      key: 'test_with_n',
      title: `Test with ${n} ${n === 1 ? 'submission' : 'submissions'}`,
      description: 'Confirm your rubric works well before running on all submissions.',
      onClick: () => onAutoSelectForTestBatch(n),
    });
  }
  return items;
}

function BeforeYouGradeCard({ item }: { item: BeforeYouGradeItem }) {
  return (
    <div className="rounded-2 px-3 py-2 border border-warning bg-warning bg-opacity-10 d-flex align-items-start gap-2">
      <i className="bi bi-exclamation-triangle-fill text-warning mt-1" aria-hidden="true" />
      <div className="flex-grow-1">
        {item.onClick ? (
          <Button
            type="button"
            variant="link"
            className="p-0 align-baseline fw-medium text-decoration-none"
            style={{ fontSize: 'inherit' }}
            onClick={item.onClick}
          >
            {item.title}
          </Button>
        ) : (
          <div className="fw-medium">{item.title}</div>
        )}
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

function AiGradingAvailabilityAlert({
  state,
  aiGradingSettingsUrl,
  onRetryAvailability,
}: {
  state: AiGradingAvailabilityState;
  aiGradingSettingsUrl: string;
  onRetryAvailability: () => void;
}) {
  const { variant, content } = run<{
    variant: 'info' | 'warning' | 'danger';
    content: React.ReactNode;
  }>(() => {
    switch (state.kind) {
      case 'loading':
        return {
          variant: 'info',
          content: (
            <span className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              Loading AI grading status...
            </span>
          ),
        };
      case 'error':
        return {
          variant: 'danger',
          content: (
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
        };
      case 'concurrency_limit':
        return {
          variant: 'warning',
          content: (
            <>
              You've reached the limit of {state.maxConcurrentJobs} concurrent AI grading jobs.
              Please wait for running jobs to finish.
            </>
          ),
        };
      case 'ready_with_keys':
        return {
          variant: 'info',
          content: (
            <>
              Billing to custom API key &middot;{' '}
              <SettingsLink url={aiGradingSettingsUrl} text="Manage keys" />
            </>
          ),
        };
      case 'no_keys':
        return {
          variant: 'danger',
          content: (
            <>
              No custom API keys configured &middot;{' '}
              <SettingsLink url={aiGradingSettingsUrl} text="Manage keys" />
            </>
          ),
        };
      case 'ready_with_credits':
        return {
          variant: 'info',
          content: (
            <>
              Billing to credit pool &middot; {formatMilliDollars(state.creditBalanceMilliDollars)}{' '}
              available &middot; <SettingsLink url={aiGradingSettingsUrl} text="Manage credits" />
            </>
          ),
        };
      case 'no_credits':
        return {
          variant: 'danger',
          content: (
            <>
              No credits remaining. Purchase credits on the{' '}
              <SettingsLink url={aiGradingSettingsUrl} text="AI grading settings" /> page.
            </>
          ),
        };
      default:
        return assertNever(state);
    }
  });

  return (
    <Alert variant={variant} className="mb-3 py-2 small">
      {content}
    </Alert>
  );
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
  onAutoSelectForTestBatch,
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
  onAutoSelectForTestBatch: (n: number) => void;
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
    onHide();
  }, [onHide, reset, defaultModel]);

  const [pendingExpandRubricOnExit, setPendingExpandRubricOnExit] = useState(false);
  const handleCreateRubric = useCallback(() => {
    setPendingExpandRubricOnExit(true);
    onHide();
  }, [onHide]);
  const handleExited = useCallback(() => {
    if (pendingExpandRubricOnExit) {
      setPendingExpandRubricOnExit(false);
      expandRubricSettings();
    }
  }, [pendingExpandRubricOnExit]);

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

    const { running_job_count, max_concurrent_jobs, credit_balance_milli_dollars } =
      aiGradingAvailabilityInfo;

    if (running_job_count >= max_concurrent_jobs) {
      return { kind: 'concurrency_limit', maxConcurrentJobs: max_concurrent_jobs };
    }
    if (useCustomApiKeys) {
      if (availableProviders.length === 0) return { kind: 'no_keys' };
      return { kind: 'ready_with_keys' };
    }
    if (credit_balance_milli_dollars <= 0) return { kind: 'no_credits' };
    return {
      kind: 'ready_with_credits',
      creditBalanceMilliDollars: credit_balance_milli_dollars,
    };
  });

  const aiGradingEnabled =
    aiGradingAvailabilityState.kind === 'ready_with_keys' ||
    aiGradingAvailabilityState.kind === 'ready_with_credits';

  const beforeYouGradeItems = aiGradingEnabled
    ? buildBeforeYouGradeItems({
        hasRubric,
        hasPriorJobs: aiGradingAvailabilityInfo?.has_prior_jobs ?? true,
        numToGrade: modalState?.numToGrade ?? 0,
        totalSubmissionCount,
        onCreateRubric: handleCreateRubric,
        onAutoSelectForTestBatch,
      })
    : [];

  return (
    <Modal
      show={isModalOpen}
      size="lg"
      backdrop="static"
      keyboard={false}
      onHide={handleClose}
      onExited={handleExited}
    >
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Select grading model</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <AiGradingAvailabilityAlert
            state={aiGradingAvailabilityState}
            aiGradingSettingsUrl={aiGradingSettingsUrl}
            onRetryAvailability={() => {
              void refetchAvailabilityInfo();
            }}
          />
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

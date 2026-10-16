import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { type AppError, getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';
import { assertNever } from '@prairielearn/utils';

import {
  AI_GRADING_MODELS,
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import type { AiGradingSelection } from '../../../../ee/lib/ai-grading/ai-grading-selection.shared.js';
import { FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION } from '../../../../ee/lib/ai-grading-free-credit-constants.js';
import { formatMilliDollars } from '../../../../lib/ai-grading-credits.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';
import type { ManualGradingError } from '../../../../trpc/assessmentQuestion/manual-grading.js';
import { createCourseInstanceTrpcClient } from '../../../../trpc/courseInstance/client.js';
import {
  TRPCProvider as CourseInstanceTRPCProvider,
  useTRPC as useCourseInstanceTRPC,
} from '../../../../trpc/courseInstance/context.js';

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
  | { type: 'selected'; ids: string[]; numToGrade: number };

function getSelection(state: AiGradingModelSelectionModalState): 'all' | 'human_graded' | string[] {
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
  optionId = `model-${model.modelId}`,
  isSelected,
  isAvailable,
  aiGradingEnabled,
  relativeCost,
  onSelect,
}: {
  model: { modelId: string; name: string; sublabel?: string };
  optionId?: string;
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
      htmlFor={optionId}
      className={clsx('rounded-2 px-3 py-2 mb-0 border', {
        'border-primary bg-primary bg-opacity-10': isSelected,
        'border-transparent': !isSelected && isInteractive,
        'opacity-75 border-transparent': !isInteractive,
      })}
      style={{ cursor: isInteractive ? 'pointer' : 'default' }}
    >
      <span className="d-flex align-items-center justify-content-between">
        <span className="form-check mb-0">
          <Form.Check.Input
            type="radio"
            id={optionId}
            name="ai-grading-model"
            disabled={!isInteractive}
            checked={isSelected}
            onChange={onSelect}
          />
          <span className="form-check-label">
            <span className="fw-medium">{model.name}</span>
            <span className="text-muted small d-block">{model.sublabel}</span>
            {/* Cost shown below sublabel on xs viewports */}
            <span className="text-muted small d-block d-sm-none">{relativeCost}</span>
          </span>
        </span>
        {/* Cost shown inline on sm+ viewports */}
        <span className="text-muted small text-nowrap ms-3 d-none d-sm-inline">{relativeCost}</span>
      </span>
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
  customProvider,
  customModels,
  customLoading,
  customError,
  showCustom,
  onRetryCustom,
}: {
  selectedModel: AiGradingSelection;
  availableProviders: EnumAiGradingProvider[];
  aiGradingEnabled: boolean;
  relativeCosts: Record<string, string>;
  onSelect: (selection: AiGradingSelection) => void;
  customProvider: { id: string; base_url: string | null } | null;
  customModels: string[];
  customLoading: boolean;
  customError: string | null;
  showCustom: boolean;
  onRetryCustom: () => void;
}) {
  const [providerFilter, setProviderFilter] = useState('all');
  const [search, setSearch] = useState('');
  const filteredModels = AI_GRADING_MODELS.filter(
    (m) =>
      (providerFilter === 'all' || m.provider === providerFilter) &&
      `${m.name} ${m.modelId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const recommended = filteredModels.filter((m) => m.recommended);
  const other = filteredModels.filter((m) => !m.recommended);
  const filteredCustomModels = customModels.filter((id) =>
    id.toLowerCase().includes(search.toLowerCase()),
  );
  const hasOtherSelected = other.some(
    (m) => selectedModel.provider !== 'openai-compatible' && m.modelId === selectedModel.model_id,
  );
  const [otherExpanded, setOtherExpanded] = useState(hasOtherSelected);

  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <Form.Group className="col-sm-5">
          <Form.Label htmlFor="grading-provider-filter">Provider</Form.Label>
          <Form.Select
            id="grading-provider-filter"
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
          >
            <option value="all">All providers</option>
            {(['openai', 'google', 'anthropic'] as const).map((provider) => (
              <option key={provider} value={provider}>
                {AI_GRADING_PROVIDER_DISPLAY_NAMES[provider]}
              </option>
            ))}
            {showCustom && <option value="openai-compatible">OpenAI-compatible</option>}
          </Form.Select>
        </Form.Group>
        <Form.Group className="col-sm-7">
          <Form.Label htmlFor="grading-model-search">Search models</Form.Label>
          <Form.Control
            id="grading-model-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Form.Group>
      </div>
      {recommended.length > 0 && (
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
                isSelected={
                  selectedModel.provider !== 'openai-compatible' &&
                  selectedModel.model_id === model.modelId
                }
                isAvailable={availableProviders.includes(model.provider)}
                aiGradingEnabled={aiGradingEnabled}
                relativeCost={relativeCosts[model.modelId]}
                onSelect={() => onSelect({ model_id: model.modelId })}
              />
            ))}
          </div>
        </div>
      )}
      {showCustom && (providerFilter === 'all' || providerFilter === 'openai-compatible') && (
        <section aria-label="Custom provider models">
          <h2 className="h6 mb-2">Custom provider models</h2>
          {customProvider && (
            <p className="text-muted small text-break mb-2">{customProvider.base_url}</p>
          )}
          <p className="small text-muted">
            Pricing is unavailable for custom models, even when their names match official models.
          </p>
          {customLoading && (
            <div role="status">
              <Spinner size="sm" className="me-2" />
              Loading custom models...
            </div>
          )}
          {customError && (
            <Alert variant="warning">
              {customError}{' '}
              <Button size="sm" variant="outline-secondary" onClick={onRetryCustom}>
                Try again
              </Button>
            </Alert>
          )}
          {!customLoading && !customError && customModels.length === 0 && (
            <p className="text-muted small">No models were found for this provider.</p>
          )}
          <div className="d-flex flex-column gap-1 overflow-auto" style={{ maxHeight: '24rem' }}>
            {customProvider &&
              !customError &&
              filteredCustomModels.map((modelId) => (
                <ModelOption
                  key={modelId}
                  optionId={`custom-model-${customProvider.id}-${encodeURIComponent(modelId)}`}
                  model={{ modelId, name: modelId }}
                  isSelected={
                    selectedModel.provider === 'openai-compatible' &&
                    selectedModel.credential_id === customProvider.id &&
                    selectedModel.model_id === modelId
                  }
                  isAvailable={true}
                  aiGradingEnabled={aiGradingEnabled && !customLoading}
                  relativeCost="Price unknown"
                  onSelect={() =>
                    onSelect({
                      provider: 'openai-compatible',
                      model_id: modelId,
                      credential_id: customProvider.id,
                    })
                  }
                />
              ))}
          </div>
        </section>
      )}
      {other.length > 0 && (
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
                  isSelected={
                    selectedModel.provider !== 'openai-compatible' &&
                    selectedModel.model_id === model.modelId
                  }
                  isAvailable={availableProviders.includes(model.provider)}
                  aiGradingEnabled={aiGradingEnabled}
                  relativeCost={relativeCosts[model.modelId]}
                  onSelect={() => onSelect({ model_id: model.modelId })}
                />
              ))}
            </div>
          )}
        </div>
      )}
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

function NoCreditsAlertContent({
  freeCreditRedemptionsRemaining,
  aiGradingSettingsUrl,
  isRedeeming,
  redeemError,
  onRedeem,
  onDismissError,
}: {
  freeCreditRedemptionsRemaining: number;
  aiGradingSettingsUrl: string;
  isRedeeming: boolean;
  redeemError: AppError<ManualGradingError['RedeemFreeCredit']> | null;
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
          variant={canRedeem ? 'outline-secondary' : 'primary'}
          size="sm"
          href={aiGradingSettingsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {canRedeem ? 'Purchase more' : 'Purchase credits'}
        </Button>
      </div>
      <AppErrorAlert
        error={redeemError}
        className="mt-2 mb-0 py-2"
        render={{
          UNKNOWN: ({ message }) => message,
        }}
        onDismiss={onDismissError}
      />
    </>
  );
}

/**
 * Opens the rubric settings collapse panel (if not already open) and scrolls
 * to the editor. Used by the BeforeYouGradeCard "Create a rubric" action to
 * guide the instructor to the authoring UI after the modal closes.
 */
function openRubricSettings() {
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
  title: string;
  description: string;
  onClick?: () => void;
}

function buildBeforeYouGradeItems({
  hasRubric,
  hasPriorJobs,
  numToGrade,
  totalSubmissionCount,
  onOpenRubricSettings,
  onSelectFirstSubmissions,
}: {
  hasRubric: boolean;
  hasPriorJobs: boolean;
  numToGrade: number;
  totalSubmissionCount: number;
  onOpenRubricSettings: () => void;
  onSelectFirstSubmissions?: (n: number) => void;
}): BeforeYouGradeItem[] {
  const items: BeforeYouGradeItem[] = [];
  if (!hasRubric) {
    items.push({
      key: 'no_rubric',
      title: 'Create a rubric',
      description: 'Rubrics significantly improve accuracy and consistency.',
      onClick: onOpenRubricSettings,
    });
  }
  if (onSelectFirstSubmissions && !hasPriorJobs && numToGrade > 5 && totalSubmissionCount >= 2) {
    const n = Math.min(5, totalSubmissionCount);
    items.push({
      key: 'test_with_n',
      title: `Test with ${n} ${n === 1 ? 'submission' : 'submissions'}`,
      description: 'Confirm your rubric works well before running on all submissions.',
      onClick: () => onSelectFirstSubmissions(n),
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
  isRedeeming,
  redeemError,
  onRedeem,
  onDismissRedeemError,
}: {
  state: AiGradingAvailabilityState;
  aiGradingSettingsUrl: string;
  onRetryAvailability: () => void;
  isRedeeming: boolean;
  redeemError: AppError<ManualGradingError['RedeemFreeCredit']> | null;
  onRedeem: () => void;
  onDismissRedeemError: () => void;
}) {
  const { variant, content, small } = run<{
    variant: 'info' | 'warning' | 'danger';
    content: React.ReactNode;
    small: boolean;
  }>(() => {
    switch (state.kind) {
      case 'loading':
        return {
          variant: 'info',
          small: true,
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
          small: true,
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
          small: true,
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
          small: true,
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
          small: true,
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
          small: true,
          content: (
            <>
              Billing to credit pool &middot; {formatMilliDollars(state.creditBalanceMilliDollars)}{' '}
              available &middot; <SettingsLink url={aiGradingSettingsUrl} text="Manage credits" />{' '}
              &middot;{' '}
              <a
                href="https://docs.prairielearn.com/aiGrading/#factors-affecting-cost-and-runtime"
                target="_blank"
                rel="noopener noreferrer"
              >
                Factors affecting cost
              </a>
            </>
          ),
        };
      case 'no_credits':
        return {
          variant: 'info',
          small: false,
          content: (
            <NoCreditsAlertContent
              freeCreditRedemptionsRemaining={state.freeCreditRedemptionsRemaining}
              aiGradingSettingsUrl={aiGradingSettingsUrl}
              isRedeeming={isRedeeming}
              redeemError={redeemError}
              onRedeem={onRedeem}
              onDismissError={onDismissRedeemError}
            />
          ),
        };
      default:
        return assertNever(state);
    }
  });

  return (
    <Alert variant={variant} className={clsx('mb-3', small ? 'py-2 small' : 'py-3')}>
      {content}
    </Alert>
  );
}

export function AiGradingModelSelectionModal({
  courseInstanceId,
  courseInstanceTrpcCsrfToken,
  ...props
}: Parameters<typeof AiGradingModelSelectionModalInner>[0] & {
  courseInstanceId: string;
  courseInstanceTrpcCsrfToken: string;
}) {
  const queryClient = useQueryClient();
  const [client] = useState(() =>
    createCourseInstanceTrpcClient({ courseInstanceId, csrfToken: courseInstanceTrpcCsrfToken }),
  );
  return (
    <CourseInstanceTRPCProvider trpcClient={client} queryClient={queryClient}>
      <AiGradingModelSelectionModalInner {...props} />
    </CourseInstanceTRPCProvider>
  );
}

function AiGradingModelSelectionModalInner({
  show,
  data: modalState,
  availableProviders,
  aiGradingLastSelectedModel,
  aiGradingLastSelectedCredentialId,
  relativeCosts,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  hasRubric,
  totalSubmissionCount,
  onSelectFirstSubmissions,
  onSuccess,
  onHide,
  onExited,
}: {
  show: boolean;
  data: AiGradingModelSelectionModalState | null;
  availableProviders: EnumAiGradingProvider[];
  aiGradingLastSelectedModel: string | null;
  aiGradingLastSelectedCredentialId: string | null;
  relativeCosts: Record<string, string>;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  hasRubric: boolean;
  totalSubmissionCount: number;
  onSelectFirstSubmissions?: (n: number) => void;
  onSuccess: (
    data: { job_sequence_id: string; job_sequence_token: string },
    selection: AiGradingSelection,
  ) => void;
  onHide: () => void;
  onExited: () => void;
}) {
  const trpc = useTRPC();
  const courseInstanceTRPC = useCourseInstanceTRPC();
  const customProviderQuery = useQuery({
    ...courseInstanceTRPC.aiGradingProviders.list.queryOptions(),
    enabled: show && useCustomApiKeys,
    retry: false,
    refetchOnMount: 'always',
  });
  const customProvider = useCustomApiKeys ? (customProviderQuery.data?.credential ?? null) : null;
  const customModelsQuery = useQuery({
    ...courseInstanceTRPC.aiGradingProviders.models.queryOptions({
      credential_id: customProvider?.id ?? '0',
    }),
    enabled: show && useCustomApiKeys && customProvider != null,
    retry: false,
    refetchOnMount: 'always',
  });
  const customModels = customModelsQuery.data?.models ?? [];
  const customLoading =
    customProviderQuery.isFetching || (customProvider != null && customModelsQuery.isFetching);
  const customError =
    customProviderQuery.error?.message ??
    (customProvider ? customModelsQuery.error?.message : null) ??
    null;
  const queryClient = useQueryClient();
  const { mutate, reset, isPending, isError, error } = useMutation(
    trpc.manualGrading.aiGradeInstanceQuestions.mutationOptions(),
  );
  const {
    mutate: redeemFreeCredit,
    reset: resetRedeem,
    isPending: isRedeeming,
    isSuccess: isRedeemSuccess,
    error: rawRedeemError,
  } = useMutation({
    ...trpc.manualGrading.redeemFreeCredit.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.manualGrading.aiGradingAvailabilityInfo.queryKey(),
      });
    },
  });
  const redeemError = getAppError<ManualGradingError['RedeemFreeCredit']>(rawRedeemError);
  const {
    data: aiGradingAvailabilityInfo,
    isFetching: isAvailabilityFetching,
    isError: isAvailabilityError,
    refetch: refetchAvailabilityInfo,
  } = useQuery({
    ...trpc.manualGrading.aiGradingAvailabilityInfo.queryOptions(),
    enabled: show,
    refetchOnMount: 'always',
  });
  const defaultModel: AiGradingSelection =
    aiGradingLastSelectedCredentialId && aiGradingLastSelectedModel
      ? {
          provider: 'openai-compatible',
          model_id: aiGradingLastSelectedModel,
          credential_id: aiGradingLastSelectedCredentialId,
        }
      : { model_id: getDefaultModel(aiGradingLastSelectedModel, availableProviders) };
  const [selectedModel, setSelectedModel] = useState<AiGradingSelection>(defaultModel);

  const handleClose = () => {
    setSelectedModel(defaultModel);
    reset();
    resetRedeem();
    onHide();
  };

  const handleOpenRubricSettings = useCallback(() => {
    openRubricSettings();
    onHide();
  }, [onHide]);

  const handleSubmit = useCallback(
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!modalState) return;

      mutate(
        {
          selection: getSelection(modalState),
          ...selectedModel,
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

  const selectedModelProvider =
    selectedModel.provider === 'openai-compatible'
      ? 'openai-compatible'
      : AI_GRADING_MODELS.find((m) => m.modelId === selectedModel.model_id)?.provider;
  const isSelectedModelAvailable =
    selectedModel.provider === 'openai-compatible'
      ? !customLoading &&
        !customError &&
        customProvider?.id === selectedModel.credential_id &&
        customModels.includes(selectedModel.model_id)
      : selectedModelProvider != null && availableProviders.includes(selectedModelProvider);

  const aiGradingAvailabilityState = run<AiGradingAvailabilityState>(() => {
    // Show the spinner while a refetch is in flight so the error UI doesn't
    // persist after the user clicks "Try again".
    if (isAvailabilityFetching) return { kind: 'loading' };
    if (isAvailabilityError) return { kind: 'error' };
    if (aiGradingAvailabilityInfo == null) return { kind: 'loading' };

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
      if (
        availableProviders.length === 0 &&
        customProvider == null &&
        !customProviderQuery.isFetching
      ) {
        return { kind: 'no_keys' };
      }
      return { kind: 'ready_with_keys' };
    }
    if (credit_balance_milli_dollars <= 0) {
      return {
        kind: 'no_credits',
        freeCreditRedemptionsRemaining: free_credit_redemptions_remaining,
      };
    }
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
        onOpenRubricSettings: handleOpenRubricSettings,
        onSelectFirstSubmissions,
      })
    : [];

  return (
    <Modal
      show={show}
      size="lg"
      backdrop="static"
      keyboard={false}
      onHide={handleClose}
      onExited={onExited}
    >
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Select grading model</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {isRedeemSuccess && (
            <Alert variant="success" className="mb-3 py-2 small">
              {formatMilliDollars(FREE_AI_GRADING_CREDIT_MILLI_DOLLARS_PER_REDEMPTION)} in credit
              added!
            </Alert>
          )}
          <AiGradingAvailabilityAlert
            state={aiGradingAvailabilityState}
            aiGradingSettingsUrl={aiGradingSettingsUrl}
            isRedeeming={isRedeeming}
            redeemError={redeemError}
            onRetryAvailability={() => {
              void refetchAvailabilityInfo();
            }}
            onRedeem={() => redeemFreeCredit()}
            onDismissRedeemError={resetRedeem}
          />
          <ModelList
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            aiGradingEnabled={aiGradingEnabled}
            relativeCosts={relativeCosts}
            customProvider={customProvider}
            customModels={customModels}
            customLoading={customLoading}
            customError={customError}
            showCustom={
              useCustomApiKeys &&
              (customProvider != null ||
                customProviderQuery.isFetching ||
                customProviderQuery.isError)
            }
            onSelect={setSelectedModel}
            onRetryCustom={() => {
              void customProviderQuery.refetch();
              if (customProvider) void customModelsQuery.refetch();
            }}
          />
          {selectedModel.provider === 'openai-compatible' &&
            !customLoading &&
            !customError &&
            !isSelectedModelAvailable && (
              <Alert variant="warning" className="mt-3">
                The previously selected custom model is no longer available. Select a model again.
              </Alert>
            )}
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

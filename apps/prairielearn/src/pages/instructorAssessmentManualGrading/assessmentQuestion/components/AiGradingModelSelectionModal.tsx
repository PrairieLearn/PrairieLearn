import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';
import { assertNever } from '@prairielearn/utils';

import {
  AI_GRADING_MODELS,
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  AI_GRADING_PROVIDER_SUBLABELS,
  type AiGradingModelId,
} from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import {
  calculateCostWithFeeMilliDollars,
  formatMilliDollars,
} from '../../../../lib/ai-grading-credits.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { useTRPC } from '../utils/trpc-context.js';
import { type useManualGradingActions } from '../utils/useManualGradingActions.js';

export type AiGradingModelSelectionModalState =
  | { type: 'all'; numToGrade: number }
  | { type: 'human_graded'; numToGrade: number }
  | { type: 'selected'; ids: string[]; numToGrade: number }
  | null;

function getSelection(
  modalState: NonNullable<AiGradingModelSelectionModalState>,
): 'all' | 'human_graded' | string[] {
  switch (modalState.type) {
    case 'all':
      return 'all';
    case 'human_graded':
      return 'human_graded';
    case 'selected':
      return modalState.ids;
    default:
      assertNever(modalState);
  }
}

function pluralizeSubmissions(count: number): string {
  return count === 1 ? 'submission' : 'submissions';
}

function getTitle(modalState: AiGradingModelSelectionModalState): string {
  if (modalState == null) return '';
  const submissions = pluralizeSubmissions(modalState.numToGrade);
  switch (modalState.type) {
    case 'all':
      return `Grade ${modalState.numToGrade} ${submissions}`;
    case 'human_graded':
      return `Grade ${modalState.numToGrade} human-graded ${submissions}`;
    case 'selected':
      return `Grade ${modalState.numToGrade} selected ${submissions}`;
    default:
      assertNever(modalState);
  }
}

function estimateTotalCostForModel(
  modelId: string,
  data: {
    avg_input_tokens_per_submission: number;
    estimated_output_tokens: number;
    model_pricing: Record<string, { input: number; output: number }>;
    infrastructure_fee_percent: number;
  },
  numToGrade: number,
): number | null {
  if (data.avg_input_tokens_per_submission <= 0) return null;
  const pricing = data.model_pricing[modelId];
  const costPerSubmissionDollars =
    (data.avg_input_tokens_per_submission * pricing.input) / 1e6 +
    (data.estimated_output_tokens * pricing.output) / 1e6;
  return calculateCostWithFeeMilliDollars(
    costPerSubmissionDollars * numToGrade,
    data.infrastructure_fee_percent,
  );
}

/**
 * Returns the first available model based on provider order, or the default model
 * if the preferred model is available.
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
  return AI_GRADING_MODELS[0].modelId;
}

function ProviderSelector({
  activeProvider,
  availableProviders,
  onSelect,
}: {
  activeProvider: EnumAiGradingProvider;
  availableProviders: EnumAiGradingProvider[];
  onSelect: (provider: EnumAiGradingProvider) => void;
}) {
  const providers = Object.keys(AI_GRADING_PROVIDER_DISPLAY_NAMES) as EnumAiGradingProvider[];

  return (
    <>
      <div className="text-muted small fw-semibold mb-2">Provider</div>
      <div role="radiogroup" aria-label="Select provider" className="row g-2">
        {providers.map((provider) => {
          const isActive = activeProvider === provider;
          const isAvailable = availableProviders.includes(provider);
          return (
            <div key={provider} className="col-12 col-md-4">
              <OverlayTrigger
                placement="top"
                tooltip={
                  isAvailable
                    ? undefined
                    : {
                        props: { id: `provider-tooltip-${provider}` },
                        body: 'No API key configured',
                      }
                }
              >
                <div
                  role="radio"
                  aria-checked={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={clsx('border rounded-3 px-3 py-2 h-100', {
                    'border-primary bg-primary bg-opacity-10': isActive,
                    'opacity-50': !isAvailable,
                  })}
                  style={{ cursor: isAvailable ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (isAvailable) onSelect(provider);
                  }}
                  onKeyDown={(e) => {
                    if (isAvailable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelect(provider);
                    }
                  }}
                >
                  <div className={clsx('fw-semibold', { 'text-primary': isActive })}>
                    {AI_GRADING_PROVIDER_DISPLAY_NAMES[provider]}
                  </div>
                  <div className="text-muted small">{AI_GRADING_PROVIDER_SUBLABELS[provider]}</div>
                </div>
              </OverlayTrigger>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ModelSelector({
  activeProvider,
  selectedModel,
  availableProviders,
  data,
  numToGrade,
  onSelect,
}: {
  activeProvider: EnumAiGradingProvider;
  selectedModel: AiGradingModelId;
  availableProviders: EnumAiGradingProvider[];
  data: {
    avg_input_tokens_per_submission: number;
    estimated_output_tokens: number;
    model_pricing: Record<string, { input: number; output: number }>;
    infrastructure_fee_percent: number;
    using_custom_api_keys: boolean;
  } | null;
  numToGrade: number;
  onSelect: (modelId: AiGradingModelId) => void;
}) {
  return (
    <>
      <div className="d-flex align-items-center justify-content-between mt-3 mb-2">
        <div className="text-muted small fw-semibold">Model</div>
        {data && !data.using_custom_api_keys && (
          <div className="text-muted small fw-semibold">Estimated cost</div>
        )}
      </div>
      <div className="d-flex flex-column gap-2">
        {AI_GRADING_MODELS.filter((m) => m.provider === activeProvider).map((model) => {
          const isSelected = selectedModel === model.modelId;
          const isAvailable = availableProviders.includes(model.provider);
          const costMilliDollars = data
            ? estimateTotalCostForModel(model.modelId, data, numToGrade)
            : null;

          return (
            <div
              key={model.modelId}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!isAvailable}
              tabIndex={isSelected ? 0 : -1}
              className={clsx('border rounded-3 px-3 py-2', {
                'border-primary bg-primary bg-opacity-10': isSelected,
                'opacity-50': !isAvailable,
              })}
              style={{ cursor: isAvailable ? 'pointer' : 'default' }}
              onClick={() => {
                if (isAvailable) onSelect(model.modelId);
              }}
              onKeyDown={(e) => {
                if (isAvailable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(model.modelId);
                }
              }}
            >
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-1">
                <Form.Check
                  type="radio"
                  id={`model-${model.modelId}`}
                  name="ai-grading-model"
                  className="mb-0"
                  disabled={!isAvailable}
                  checked={isSelected}
                  label={
                    <>
                      <span className="fw-semibold">{model.name}</span>
                      <span className="text-muted ms-2 small d-none d-sm-inline">
                        {model.sublabel}
                      </span>
                    </>
                  }
                  onChange={() => onSelect(model.modelId)}
                />
                {data && !data.using_custom_api_keys && costMilliDollars != null && (
                  <span
                    className={clsx('fw-semibold flex-shrink-0 ms-3', {
                      'text-primary': isSelected,
                    })}
                  >
                    {formatMilliDollars(costMilliDollars)}
                  </span>
                )}
              </div>
              {/* Sublabel shown below on mobile only */}
              <div className="text-muted small d-sm-none ms-4 ps-2">{model.sublabel}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BalanceSummary({
  currentBalance,
  estimatedCost,
  projectedBalance,
  insufficientBalance,
  numToGrade,
  costPerSubmission,
}: {
  currentBalance: number;
  estimatedCost: number | null;
  projectedBalance: number | null;
  insufficientBalance: boolean;
  numToGrade: number;
  costPerSubmission: number | null;
}) {
  const displayedBalance = projectedBalance != null ? Math.max(0, projectedBalance) : null;

  const estimatedSubmissionsGraded =
    insufficientBalance && costPerSubmission != null && costPerSubmission > 0
      ? Math.floor(currentBalance / costPerSubmission)
      : null;

  return (
    <div className="border rounded p-3 mt-3" aria-live="polite">
      {/* Desktop: horizontal centered layout */}
      <div className="d-none d-md-flex text-center">
        <div className="flex-fill py-1">
          <div className="text-muted small">Current balance</div>
          <div className="fw-semibold">{formatMilliDollars(currentBalance)}</div>
        </div>
        <div className="vr mx-2" />
        <div className="flex-fill py-1">
          <div className="text-muted small">Estimated cost</div>
          <div className="fw-semibold">
            {estimatedCost != null ? formatMilliDollars(estimatedCost) : 'N/A'}
          </div>
        </div>
        <div className="vr mx-2" />
        <div className="flex-fill py-1">
          <div className="text-muted small">Balance after grading</div>
          <div
            className={clsx('fw-semibold', {
              'text-danger': insufficientBalance,
            })}
          >
            {displayedBalance != null ? formatMilliDollars(displayedBalance) : 'N/A'}
          </div>
        </div>
      </div>
      {/* Mobile: left-aligned rows with label and value */}
      <div className="d-md-none d-flex flex-column gap-1">
        <div className="d-flex justify-content-between">
          <span className="text-muted small">Current balance</span>
          <span className="fw-semibold">{formatMilliDollars(currentBalance)}</span>
        </div>
        <div className="d-flex justify-content-between">
          <span className="text-muted small">Estimated cost</span>
          <span className="fw-semibold">
            {estimatedCost != null ? formatMilliDollars(estimatedCost) : 'N/A'}
          </span>
        </div>
        <div className="d-flex justify-content-between">
          <span className="text-muted small">Balance after grading</span>
          <span
            className={clsx('fw-semibold', {
              'text-danger': insufficientBalance,
            })}
          >
            {displayedBalance != null ? formatMilliDollars(displayedBalance) : 'N/A'}
          </span>
        </div>
      </div>
      {insufficientBalance && (
        <Alert variant="warning" className="mt-2 mb-0">
          Insufficient balance to grade all {numToGrade} {pluralizeSubmissions(numToGrade)}.
          {estimatedSubmissionsGraded != null && (
            <>
              {' '}
              We estimate approximately {estimatedSubmissionsGraded}{' '}
              {pluralizeSubmissions(estimatedSubmissionsGraded)} will be graded before the balance
              runs out. Remaining submissions will not be graded.
            </>
          )}
        </Alert>
      )}
    </div>
  );
}

export function AiGradingModelSelectionModal({
  modalState,
  mutation,
  availableProviders,
  aiGradingLastSelectedModel,
  onSuccess,
  onHide,
}: {
  modalState: AiGradingModelSelectionModalState;
  mutation: ReturnType<typeof useManualGradingActions>['gradeSubmissionsMutation'];
  availableProviders: EnumAiGradingProvider[];
  aiGradingLastSelectedModel: string | null;
  onSuccess: (data: { job_sequence_id: string; job_sequence_token: string }) => void;
  onHide: () => void;
}) {
  const defaultModel = getDefaultModel(aiGradingLastSelectedModel, availableProviders);
  const [selectedModel, setSelectedModel] = useState<AiGradingModelId>(defaultModel);

  const defaultProvider =
    AI_GRADING_MODELS.find((m) => m.modelId === defaultModel)?.provider ?? 'openai';
  const [activeProvider, setActiveProvider] = useState<EnumAiGradingProvider>(defaultProvider);

  const trpc = useTRPC();
  const modalDataQuery = useQuery({
    ...trpc.getAiGradingModalData.queryOptions({
      selection: modalState ? getSelection(modalState) : 'all',
    }),
    enabled: modalState != null,
  });

  const handleClose = useCallback(() => {
    setSelectedModel(defaultModel);
    setActiveProvider(defaultProvider);
    mutation.reset();
    onHide();
  }, [onHide, mutation, defaultModel, defaultProvider]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!modalState) return;

      mutation.mutate(
        {
          selection: getSelection(modalState),
          model_id: selectedModel,
        },
        {
          onSuccess: (data) => {
            onSuccess(data);
            onHide();
          },
        },
      );
    },
    [modalState, selectedModel, mutation, onSuccess, onHide],
  );

  const data = modalDataQuery.data;
  const numToGrade = data?.num_to_grade ?? modalState?.numToGrade ?? 0;

  const selectedCostMilliDollars = data
    ? estimateTotalCostForModel(selectedModel, data, numToGrade)
    : null;

  const projectedBalance =
    data?.credit_pool && selectedCostMilliDollars != null
      ? data.credit_pool.total_milli_dollars - selectedCostMilliDollars
      : null;

  const isSelectedModelAvailable = availableProviders.includes(
    AI_GRADING_MODELS.find((m) => m.modelId === selectedModel)!.provider,
  );

  const insufficientBalance =
    !data?.using_custom_api_keys && projectedBalance != null && projectedBalance < 0;

  const costPerSubmission =
    selectedCostMilliDollars != null && numToGrade > 0
      ? selectedCostMilliDollars / numToGrade
      : null;

  return (
    <Modal
      show={modalState != null}
      size="lg"
      backdrop="static"
      keyboard={false}
      onHide={handleClose}
    >
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{getTitle(modalState)}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <ProviderSelector
            activeProvider={activeProvider}
            availableProviders={availableProviders}
            onSelect={setActiveProvider}
          />

          <ModelSelector
            activeProvider={activeProvider}
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            data={
              data
                ? {
                    avg_input_tokens_per_submission: data.avg_input_tokens_per_submission,
                    estimated_output_tokens: data.estimated_output_tokens,
                    model_pricing: data.model_pricing,
                    infrastructure_fee_percent: data.infrastructure_fee_percent,
                    using_custom_api_keys: data.using_custom_api_keys,
                  }
                : null
            }
            numToGrade={numToGrade}
            onSelect={setSelectedModel}
          />

          {modalDataQuery.isLoading && (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" className="me-2" />
              Estimating costs...
            </div>
          )}

          {data && !data.using_custom_api_keys && data.credit_pool != null && (
            <BalanceSummary
              currentBalance={data.credit_pool.total_milli_dollars}
              estimatedCost={selectedCostMilliDollars}
              projectedBalance={projectedBalance}
              insufficientBalance={insufficientBalance}
              numToGrade={numToGrade}
              costPerSubmission={costPerSubmission}
            />
          )}
        </Modal.Body>

        <Modal.Footer>
          <div className="m-0 w-100">
            {mutation.isError && (
              <Alert variant="danger" className="mb-2" dismissible onClose={() => mutation.reset()}>
                <strong>Error:</strong> {mutation.error.message}
              </Alert>
            )}
            <div className="d-flex align-items-center justify-content-end gap-2 mb-1">
              <Button variant="secondary" disabled={mutation.isPending} onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  mutation.isPending || modalDataQuery.isLoading || !isSelectedModelAvailable
                }
                type="submit"
              >
                {mutation.isPending
                  ? 'Submitting...'
                  : `Grade ${numToGrade} ${pluralizeSubmissions(numToGrade)}`}
              </Button>
            </div>
            <small className="text-muted my-0 text-end d-block">
              AI can make mistakes. Review grades before publishing.
            </small>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

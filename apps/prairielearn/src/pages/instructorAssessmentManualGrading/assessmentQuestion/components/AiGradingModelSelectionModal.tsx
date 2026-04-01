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
import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';
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

const pluralizeSubmissions = (count: number) => (count === 1 ? 'submission' : 'submissions');

function getTitle(modalState: AiGradingModelSelectionModalState): string {
  if (modalState == null) return '';
  const pluralizedSubmissions = pluralizeSubmissions(modalState.numToGrade);
  switch (modalState.type) {
    case 'all':
      return `Grade ${modalState.numToGrade} ${pluralizedSubmissions}`;
    case 'human_graded':
      return `Grade ${modalState.numToGrade} human-graded ${pluralizedSubmissions}`;
    case 'selected':
      return `Grade ${modalState.numToGrade} selected ${pluralizedSubmissions}`;
    default:
      assertNever(modalState);
  }
}

/** Margin of error multiplier applied to cost estimates to account for estimation inaccuracy. */
const COST_ESTIMATE_MARGIN = 1.2;

/**
 * Estimates the total cost for grading all submissions with a given model.
 *
 * Formula:
 *   cost_per_submission = (avg_input_tokens * input_price
 *                        + estimated_output_tokens * output_price
 *                        + estimated_reasoning_tokens * output_price) / 1e6
 *   raw_cost = cost_per_submission * num_to_grade
 *   total = ceil(raw_cost * (1 + infrastructure_fee_percent / 100) * 1000 * COST_ESTIMATE_MARGIN)
 *
 * Where:
 * - avg_input_tokens is sampled from up to 20 submissions
 * - estimated_output_tokens is derived from the expected JSON output structure
 * - estimated_reasoning_tokens = avg_input_tokens * REASONING_INPUT_MULTIPLIER (0.5)
 * - COST_ESTIMATE_MARGIN (1.2) adds a 20% buffer for estimation error
 * - Result is in milli-dollars (1/1000th of a dollar)
 */
function estimateTotalCostForModel(
  modelId: string,
  data: {
    avg_input_tokens_per_submission: number;
    estimated_output_tokens: number;
    estimated_reasoning_tokens: number;
    model_pricing: Record<string, { input: number; output: number }>;
    infrastructure_fee_percent: number;
  },
  numToGrade: number,
): number | null {
  if (data.avg_input_tokens_per_submission <= 0) return null;
  const pricing = data.model_pricing[modelId];
  const costPerSubmissionDollars =
    (data.avg_input_tokens_per_submission * pricing.input) / 1e6 +
    (data.estimated_output_tokens * pricing.output) / 1e6 +
    (data.estimated_reasoning_tokens * pricing.output) / 1e6;
  return Math.ceil(
    calculateCostWithFeeMilliDollars(
      costPerSubmissionDollars * numToGrade,
      data.infrastructure_fee_percent,
    ) * COST_ESTIMATE_MARGIN,
  );
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
      <div className="row g-2">
        {providers.map((provider) => {
          const isActive = activeProvider === provider;
          const isAvailable = availableProviders.includes(provider);
          const providerOption = (
            <label
              className={clsx('border rounded-3 px-3 py-2 h-100 d-block mb-0', {
                'border-primary bg-primary bg-opacity-10': isActive,
                'opacity-50': !isAvailable,
              })}
              style={{ cursor: isAvailable ? 'pointer' : 'default' }}
            >
              <input
                type="radio"
                name="ai-grading-provider"
                className="visually-hidden"
                checked={isActive}
                disabled={!isAvailable}
                onChange={() => onSelect(provider)}
              />
              <div className={clsx('fw-semibold', { 'text-primary': isActive })}>
                {AI_GRADING_PROVIDER_DISPLAY_NAMES[provider]}
              </div>
              <div className="text-muted small">{AI_GRADING_PROVIDER_SUBLABELS[provider]}</div>
            </label>
          );

          return (
            <div key={provider} className="col-12 col-md-4">
              {isAvailable ? (
                providerOption
              ) : (
                <OverlayTrigger
                  placement="top"
                  tooltip={{
                    props: { id: `provider-tooltip-${provider}` },
                    body: 'No API key configured',
                  }}
                >
                  {providerOption}
                </OverlayTrigger>
              )}
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
    estimated_reasoning_tokens: number;
    model_pricing: Record<string, { input: number; output: number }>;
    infrastructure_fee_percent: number;
    using_custom_api_keys: boolean;
  } | null;
  numToGrade: number;
  onSelect: (modelId: AiGradingModelId) => void;
}) {
  const providerModels = AI_GRADING_MODELS.filter((m) => m.provider === activeProvider);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mt-3 mb-2">
        <div className="text-muted small fw-semibold">Model</div>
        {data && !data.using_custom_api_keys && (
          <div className="text-muted small fw-semibold">Estimated cost</div>
        )}
      </div>
      <div className="d-flex flex-column gap-2">
        {providerModels.map((model) => {
          const isSelected = selectedModel === model.modelId;
          const isAvailable = availableProviders.includes(model.provider);
          const costMilliDollars = data
            ? estimateTotalCostForModel(model.modelId, data, numToGrade)
            : null;

          return (
            <label
              key={model.modelId}
              htmlFor={`model-${model.modelId}`}
              className={clsx('border rounded-3 px-3 py-2 mb-0', {
                'border-primary bg-primary bg-opacity-10': isSelected,
                'opacity-50': !isAvailable,
              })}
              style={{ cursor: isAvailable ? 'pointer' : 'default' }}
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
              {/* Sublabel shown below on mobile only, aligned with the radio label text */}
              <div className="text-muted small d-sm-none" style={{ paddingLeft: '1.75em' }}>
                {model.sublabel}
              </div>
            </label>
          );
        })}
      </div>
    </>
  );
}

function BalanceEstimatedChangeSummary({
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
    <div aria-live="polite">
      <div className="border rounded p-3 mt-3">
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
      </div>
      {insufficientBalance && (
        <Alert variant="warning" className="mt-3 mb-0">
          Insufficient balance to grade all {numToGrade} {pluralizeSubmissions(numToGrade)}.
          {estimatedSubmissionsGraded != null && (
            <>
              {' '}
              Approximately {estimatedSubmissionsGraded} will be graded; the rest will be skipped.
            </>
          )}{' '}
          Add funds to grade all submissions.
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
    ...trpc.manualGrading.getAiGradingModalData.queryOptions({
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
                    estimated_reasoning_tokens: data.estimated_reasoning_tokens,
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
            <BalanceEstimatedChangeSummary
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
                {mutation.isPending ? 'Submitting...' : 'Grade submissions'}
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

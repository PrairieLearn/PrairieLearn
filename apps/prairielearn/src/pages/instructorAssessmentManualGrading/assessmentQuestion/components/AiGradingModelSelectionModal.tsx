import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import {
  AI_GRADING_MODELS,
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  AI_GRADING_PROVIDER_SUBLABELS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { type useManualGradingActions } from '../utils/useManualGradingActions.js';

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

function getTitle(state: AiGradingModelSelectionModalState): string {
  if (!state) return 'AI grading';
  switch (state.type) {
    case 'all':
      return 'AI grading';
    case 'human_graded':
      return 'AI grading';
    case 'selected':
      return 'AI grading';
  }
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
  onSelect,
}: {
  activeProvider: EnumAiGradingProvider;
  selectedModel: AiGradingModelId;
  availableProviders: EnumAiGradingProvider[];
  onSelect: (modelId: AiGradingModelId) => void;
}) {
  const providerModels = AI_GRADING_MODELS.filter((m) => m.provider === activeProvider);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mt-3 mb-2">
        <div className="text-muted small fw-semibold">Model</div>
      </div>
      <div className="d-flex flex-column gap-2">
        {providerModels.map((model) => {
          const isSelected = selectedModel === model.modelId;
          const isAvailable = availableProviders.includes(model.provider);

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

  const handleProviderSelect = useCallback((provider: EnumAiGradingProvider) => {
    setActiveProvider(provider);
    // Auto-select the first model from the new provider so selectedModel
    // always belongs to the active provider.
    const firstModelForProvider = AI_GRADING_MODELS.find((m) => m.provider === provider);
    if (firstModelForProvider) {
      setSelectedModel(firstModelForProvider.modelId);
    }
  }, []);

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

  const numToGrade = modalState?.numToGrade ?? 0;

  const isSelectedModelAvailable = availableProviders.includes(
    AI_GRADING_MODELS.find((m) => m.modelId === selectedModel)!.provider,
  );

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
            onSelect={handleProviderSelect}
          />

          <ModelSelector
            activeProvider={activeProvider}
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            onSelect={setSelectedModel}
          />

          {numToGrade > 0 && (
            <div className="text-muted small mt-3">
              {numToGrade} {numToGrade === 1 ? 'submission' : 'submissions'} will be graded.
            </div>
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
                disabled={mutation.isPending || !isSelectedModelAvailable}
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

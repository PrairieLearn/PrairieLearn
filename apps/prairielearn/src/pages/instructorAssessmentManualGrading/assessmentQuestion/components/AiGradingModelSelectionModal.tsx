import clsx from 'clsx';
import { useCallback } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

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

const PROVIDER_ORDER: EnumAiGradingProvider[] = ['openai', 'google', 'anthropic'];

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
  const modelsByProvider = PROVIDER_ORDER.map((provider) => ({
    provider,
    models: AI_GRADING_MODELS.filter((m) => m.provider === provider),
  }));

  return (
    <div className="d-flex flex-column gap-4">
      {modelsByProvider.map(({ provider, models }, providerIndex) => (
        <div key={provider}>
          <div className="d-flex justify-content-between align-items-baseline mb-2">
            <div>
              <span className="fw-semibold">{AI_GRADING_PROVIDER_DISPLAY_NAMES[provider]}</span>
              <span className="text-muted ms-2 small">
                {AI_GRADING_PROVIDER_SUBLABELS[provider]}
              </span>
            </div>
            {providerIndex === 0 && (
              <span className="text-muted small">
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
            )}
          </div>
          <div className="d-flex flex-column gap-1">
            {models.map((model) => {
              const isSelected = selectedModel === model.modelId;
              const isAvailable = availableProviders.includes(model.provider);

              const modelOption = (
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
                        </div>
                      }
                      onChange={() => onSelect(model.modelId)}
                    />
                    <span className="text-muted small text-nowrap ms-3">
                      {relativeCosts[model.modelId]}
                    </span>
                  </div>
                </label>
              );

              return isAvailable ? (
                modelOption
              ) : (
                <OverlayTrigger
                  key={model.modelId}
                  placement="top"
                  tooltip={{
                    props: { id: `model-tooltip-${model.modelId}` },
                    body: 'No API key configured for this provider',
                  }}
                >
                  {modelOption}
                </OverlayTrigger>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AiGradingModelSelectionModal({
  modalState,
  mutation,
  availableProviders,
  aiGradingLastSelectedModel,
  relativeCosts,
  onSuccess,
  onHide,
}: {
  modalState: AiGradingModelSelectionModalState;
  mutation: ReturnType<typeof useManualGradingActions>['gradeSubmissionsMutation'];
  availableProviders: EnumAiGradingProvider[];
  aiGradingLastSelectedModel: string | null;
  relativeCosts: Record<string, string>;
  onSuccess: (
    data: { job_sequence_id: string; job_sequence_token: string },
    modelId: AiGradingModelId,
  ) => void;
  onHide: () => void;
}) {
  const defaultModel = getDefaultModel(aiGradingLastSelectedModel, availableProviders);
  const form = useForm<{ model_id: AiGradingModelId }>({
    defaultValues: { model_id: defaultModel },
  });
  const selectedModel = form.watch('model_id');

  const handleClose = useCallback(() => {
    form.reset({ model_id: defaultModel });
    mutation.reset();
    onHide();
  }, [onHide, mutation, defaultModel, form]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!modalState) return;

      const modelId = form.getValues('model_id');
      mutation.mutate(
        {
          selection: getSelection(modalState),
          model_id: modelId,
        },
        {
          onSuccess: (result) => {
            onSuccess(result, modelId);
            onHide();
          },
        },
      );
    },
    [modalState, mutation, onSuccess, onHide, form],
  );

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
          <Modal.Title>Select grading model</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <ModelList
            selectedModel={selectedModel}
            availableProviders={availableProviders}
            relativeCosts={relativeCosts}
            onSelect={(modelId) => form.setValue('model_id', modelId)}
          />
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
                {mutation.isPending
                  ? 'Submitting...'
                  : modalState
                    ? `Grade ${modalState.numToGrade} ${modalState.numToGrade === 1 ? 'submission' : 'submissions'}`
                    : 'Grade submissions'}
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

import { useState } from 'preact/compat';
import { Button, Card, Form, Modal } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { ConfirmationModal } from './ConfirmationModal.js';
import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import {
  type AccessControlFormData,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToFormData,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJson[];
  onSubmit: (data: AccessControlJson[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
}

const defaultInitialData: AccessControlJson[] = [];

type SelectedRule = { type: 'main' } | { type: 'override'; index: number };

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
}: AccessControlFormProps) {
  const [selectedRule, setSelectedRule] = useState<SelectedRule>({ type: 'main' });
  const [deleteModalState, setDeleteModalState] = useState<{
    show: boolean;
    overrideIndex: number | null;
  }>({
    show: false,
    overrideIndex: null,
  });
  const [targetsModalState, setTargetsModalState] = useState<{
    show: boolean;
    overrideIndex: number | null;
  }>({
    show: false,
    overrideIndex: null,
  });

  // Convert initial JSON data to form data structure
  const mainRule = initialData[0]
    ? jsonToFormData(initialData[0], true)
    : jsonToFormData({ enabled: true, listBeforeRelease: true }, true);
  const overrides = initialData.slice(1).map((json) => jsonToFormData(json, false));

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isDirty, isValid },
  } = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const {
    fields: overrideFields,
    append: appendOverride,
    remove: removeOverride,
  } = useFieldArray({
    control,
    name: 'overrides',
  });

  const watchedData = watch();

  const handleFormSubmit = (data: AccessControlFormData) => {
    // Transform form data to JSON output
    const jsonOutput = formDataToJson(data);
    onSubmit(jsonOutput);
  };

  const addOverride = () => {
    appendOverride(createDefaultOverrideFormData());
    // Select the newly added override
    setSelectedRule({ type: 'override', index: overrideFields.length });
  };

  const handleDeleteClick = (index: number) => {
    setDeleteModalState({ show: true, overrideIndex: index });
  };

  const handleDeleteConfirm = () => {
    if (deleteModalState.overrideIndex !== null) {
      const indexToDelete = deleteModalState.overrideIndex;
      removeOverride(indexToDelete);

      // If we deleted the currently selected rule, select the main rule
      // or adjust index if we deleted a rule before the selected one
      if (selectedRule.type === 'override') {
        if (selectedRule.index === indexToDelete) {
          // Deleted the selected rule - go back to main or previous override
          if (indexToDelete > 0) {
            setSelectedRule({ type: 'override', index: indexToDelete - 1 });
          } else {
            setSelectedRule({ type: 'main' });
          }
        } else if (selectedRule.index > indexToDelete) {
          // Deleted a rule before the selected one - adjust index
          setSelectedRule({ type: 'override', index: selectedRule.index - 1 });
        }
      }
    }
    setDeleteModalState({ show: false, overrideIndex: null });
  };

  const handleDeleteCancel = () => {
    setDeleteModalState({ show: false, overrideIndex: null });
  };

  // Get display name for an override rule
  const getOverrideName = (index: number): string => {
    const override = watchedData.overrides[index] as
      | AccessControlFormData['overrides'][number]
      | undefined;
    const targetCount = override?.targets?.length ?? 0;
    if (targetCount === 0) {
      return `Override ${index + 1} (no targets)`;
    }
    return `Override ${index + 1} (${targetCount} target${targetCount === 1 ? '' : 's'})`;
  };

  return (
    <div>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Tab-like navigation */}
        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
          <div class="d-flex gap-2 flex-wrap">
            {/* Main Rule Tab */}
            <Button
              variant={selectedRule.type === 'main' ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setSelectedRule({ type: 'main' })}
            >
              Main rule
              {watchedData.mainRule.blockAccess && (
                <span class="ms-1 badge bg-warning text-dark">Blocks</span>
              )}
            </Button>

            {/* Override Tabs */}
            {overrideFields.map((field, index) => {
              const override = watchedData.overrides[index];
              const isSelected = selectedRule.type === 'override' && selectedRule.index === index;
              return (
                <Button
                  key={field.id}
                  variant={isSelected ? 'primary' : 'outline-secondary'}
                  size="sm"
                  onClick={() => setSelectedRule({ type: 'override', index })}
                >
                  {getOverrideName(index)}
                  {override.blockAccess && (
                    <span class="ms-1 badge bg-warning text-dark">Blocks</span>
                  )}
                  {!override.enabled && <span class="ms-1 badge bg-secondary">Disabled</span>}
                </Button>
              );
            })}
          </div>

          {/* Add Rule Button */}
          <Button variant="success" size="sm" onClick={addOverride}>
            <i class="fa fa-plus me-1" /> Add override
          </Button>
        </div>

        {/* Rule Header with name and actions */}
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h5 class="mb-0">
            {selectedRule.type === 'main'
              ? 'Main Access Control Rule'
              : getOverrideName(selectedRule.index)}
          </h5>

          <div class="d-flex gap-2">
            {/* Enable/Disable toggle */}
            {selectedRule.type === 'main' ? (
              <Button
                variant={watchedData.mainRule.enabled ? 'success' : 'outline-secondary'}
                size="sm"
                onClick={() => setValue('mainRule.enabled', !watchedData.mainRule.enabled)}
              >
                <i class={`fa fa-${watchedData.mainRule.enabled ? 'check' : 'times'} me-1`} />
                {watchedData.mainRule.enabled ? 'Enabled' : 'Disabled'}
              </Button>
            ) : (
              <Button
                variant={
                  watchedData.overrides[selectedRule.index]?.enabled
                    ? 'success'
                    : 'outline-secondary'
                }
                size="sm"
                onClick={() =>
                  setValue(
                    `overrides.${selectedRule.index}.enabled`,
                    !watchedData.overrides[selectedRule.index]?.enabled,
                  )
                }
              >
                <i
                  class={`fa fa-${watchedData.overrides[selectedRule.index]?.enabled ? 'check' : 'times'} me-1`}
                />
                {watchedData.overrides[selectedRule.index]?.enabled ? 'Enabled' : 'Disabled'}
              </Button>
            )}

            {/* Configure targets button for overrides */}
            {selectedRule.type === 'override' && (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() =>
                  setTargetsModalState({ show: true, overrideIndex: selectedRule.index })
                }
              >
                <i class="fa fa-users me-1" /> Configure targets
              </Button>
            )}

            {/* Delete button for overrides */}
            {selectedRule.type === 'override' && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDeleteClick(selectedRule.index)}
              >
                <i class="fa fa-trash me-1" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* "Applies to" text for overrides */}
        {selectedRule.type === 'override' && (
          <p class="text-muted small mb-3">
            {(watchedData.overrides[selectedRule.index]?.targets?.length ?? 0) > 0
              ? `This override applies to ${watchedData.overrides[selectedRule.index]?.targets?.join(', ')}`
              : 'This override has no targets configured'}
          </p>
        )}

        {/* Rule Content */}
        <div class="mb-4">
          {selectedRule.type === 'main' ? (
            <MainRuleForm control={control} courseInstance={courseInstance} setValue={setValue} />
          ) : (
            <OverrideRuleContent control={control} index={selectedRule.index} setValue={setValue} />
          )}
        </div>

        <div class="mt-4 d-flex gap-2">
          <Button type="submit" variant="primary" disabled={!isDirty || !isValid}>
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => window.location.reload()}
          >
            Reset
          </Button>
        </div>
      </Form>

      {/* Targets Configuration Modal */}
      <Modal
        show={targetsModalState.show}
        onHide={() => setTargetsModalState({ show: false, overrideIndex: null })}
      >
        <Modal.Header closeButton>
          <Modal.Title>Configure Targets</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {targetsModalState.overrideIndex !== null && (
            <Form.Group>
              <Form.Label>Target Groups</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter target identifiers separated by commas"
                {...control.register(`overrides.${targetsModalState.overrideIndex}.targets`)}
              />
              <Form.Text class="text-muted">
                Comma-separated list of target identifiers (e.g., sectionA, sectionB).
              </Form.Text>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setTargetsModalState({ show: false, overrideIndex: null })}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        show={deleteModalState.show}
        title="Delete Override Rule"
        message={`Are you sure you want to delete "${deleteModalState.overrideIndex !== null ? getOverrideName(deleteModalState.overrideIndex) : ''}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Debug Display - Show both form state and JSON output */}
      <Card class="mt-4">
        <Card.Header>
          <strong>Form State (Debug)</strong>
        </Card.Header>
        <Card.Body>
          <div class="mb-3">
            <strong>Internal Form Data:</strong>
            <pre
              class="mb-0 mt-2"
              style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}
            >
              <code>{JSON.stringify(watchedData, null, 2)}</code>
            </pre>
          </div>
          <div>
            <strong>JSON Output (what will be saved):</strong>
            <pre
              class="mb-0 mt-2"
              style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}
            >
              <code>{JSON.stringify(formDataToJson(watchedData), null, 2)}</code>
            </pre>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

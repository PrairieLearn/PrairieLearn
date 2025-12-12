import { useState } from 'preact/compat';
import { Button, Card, Form, Modal } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AccessControlBreadcrumb } from './AccessControlBreadcrumb.js';
import { AccessControlSummary } from './AccessControlSummary.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import {
  type AccessControlFormData,
  type AccessControlView,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToFormData,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJson[];
  onSubmit: (data: AccessControlJson[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
  isSaving?: boolean;
}

const defaultInitialData: AccessControlJson[] = [];

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
  isSaving = false,
}: AccessControlFormProps) {
  const [currentView, setCurrentView] = useState<AccessControlView>({ type: 'summary' });
  const [deleteModalState, setDeleteModalState] = useState<{
    show: boolean;
    overrideIndex: number | null;
  }>({
    show: false,
    overrideIndex: null,
  });
  const [studentGroupsModalState, setStudentGroupsModalState] = useState<{
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
    // Navigate to the newly added override
    setCurrentView({ type: 'edit-override', index: overrideFields.length });
  };

  const handleDeleteClick = (index: number) => {
    setDeleteModalState({ show: true, overrideIndex: index });
  };

  const handleDeleteConfirm = () => {
    if (deleteModalState.overrideIndex !== null) {
      const indexToDelete = deleteModalState.overrideIndex;
      removeOverride(indexToDelete);

      // If we deleted the currently viewed rule, go back to summary
      if (currentView.type === 'edit-override') {
        if (currentView.index === indexToDelete) {
          setCurrentView({ type: 'summary' });
        } else if (currentView.index > indexToDelete) {
          // Adjust index if we deleted a rule before the current one
          setCurrentView({ type: 'edit-override', index: currentView.index - 1 });
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
    const groupCount = override?.groups?.length ?? 0;
    if (groupCount === 0) {
      return `Override ${index + 1} (no groups)`;
    }
    return `Override ${index + 1} (${groupCount} group${groupCount === 1 ? '' : 's'})`;
  };

  // Render the appropriate content based on current view
  const renderContent = () => {
    switch (currentView.type) {
      case 'summary':
        return (
          <AccessControlSummary
            mainRule={watchedData.mainRule}
            overrides={watchedData.overrides}
            getOverrideName={getOverrideName}
            onNavigate={setCurrentView}
            onAddOverride={addOverride}
            onRemoveOverride={handleDeleteClick}
            onEditStudentGroups={(index) =>
              setStudentGroupsModalState({ show: true, overrideIndex: index })
            }
          />
        );

      case 'edit-main':
        return (
          <div>
            {/* Rule header with name and actions */}
            <div class="d-flex align-items-center justify-content-between mb-3">
              <h5 class="mb-0">Main access control rule</h5>
              <Button
                variant={watchedData.mainRule.enabled ? 'success' : 'outline-secondary'}
                size="sm"
                onClick={() => setValue('mainRule.enabled', !watchedData.mainRule.enabled)}
              >
                <i class={`fa fa-${watchedData.mainRule.enabled ? 'check' : 'times'} me-1`} />
                {watchedData.mainRule.enabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <MainRuleForm control={control} courseInstance={courseInstance} setValue={setValue} />
          </div>
        );

      case 'edit-override': {
        const index = currentView.index;
        // Use optional chaining and default to show the form if the override exists
        const override = watchedData.overrides.at(index);
        const isEnabled = override?.enabled ?? false;
        const studentGroupsList = override?.groups ?? [];

        return (
          <div>
            {/* Rule header with name and actions */}
            <div class="d-flex align-items-center justify-content-between mb-3">
              <h5 class="mb-0">{getOverrideName(index)}</h5>

              <div class="d-flex gap-2">
                {/* Enable/Disable toggle */}
                <Button
                  variant={isEnabled ? 'success' : 'outline-secondary'}
                  size="sm"
                  onClick={() => setValue(`overrides.${index}.enabled`, !isEnabled)}
                >
                  <i class={`fa fa-${isEnabled ? 'check' : 'times'} me-1`} />
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </Button>

                {/* Configure student groups button */}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setStudentGroupsModalState({ show: true, overrideIndex: index })}
                >
                  <i class="fa fa-users me-1" /> Configure student groups
                </Button>

                {/* Delete button */}
                <Button variant="outline-danger" size="sm" onClick={() => handleDeleteClick(index)}>
                  <i class="fa fa-trash me-1" /> Delete
                </Button>
              </div>
            </div>

            {/* "Applies to" text */}
            <p class="text-muted small mb-3">
              {studentGroupsList.length > 0
                ? `This override applies to ${studentGroupsList.join(', ')}`
                : 'This override has no groups configured'}
            </p>

            <OverrideRuleContent control={control} index={index} setValue={setValue} />
          </div>
        );
      }
    }
  };

  return (
    <div>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Breadcrumb navigation */}
        <AccessControlBreadcrumb
          currentView={currentView}
          getOverrideName={getOverrideName}
          onNavigate={setCurrentView}
        />

        {/* Main content area */}
        <div class="mb-4">{renderContent()}</div>

        {/* Form actions */}
        <div class="mt-4 d-flex gap-2">
          <Button type="submit" variant="primary" disabled={!isDirty || !isValid || isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            disabled={isSaving}
            onClick={() => window.location.reload()}
          >
            Reset
          </Button>
        </div>
      </Form>

      {/* Targets configuration modal */}
      <Modal
        show={studentGroupsModalState.show}
        onHide={() => setStudentGroupsModalState({ show: false, overrideIndex: null })}
      >
        <Modal.Header closeButton>
          <Modal.Title>Configure student groups</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {studentGroupsModalState.overrideIndex !== null && (
            <Form.Group>
              <Form.Label>Student groups</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter target identifiers separated by commas"
                {...control.register(`overrides.${studentGroupsModalState.overrideIndex}.groups`)}
              />
              <Form.Text class="text-muted">
                Comma-separated list of student group names (e.g., sectionA, sectionB).
              </Form.Text>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setStudentGroupsModalState({ show: false, overrideIndex: null })}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        show={deleteModalState.show}
        title="Delete override rule"
        message={`Are you sure you want to delete "${deleteModalState.overrideIndex !== null ? getOverrideName(deleteModalState.overrideIndex) : ''}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Debug display - show both form state and JSON output */}
      <Card class="mt-4">
        <Card.Header>
          <strong>Form state (debug)</strong>
        </Card.Header>
        <Card.Body>
          <div class="mb-3">
            <strong>Internal form data:</strong>
            <pre
              class="mb-0 mt-2"
              style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}
            >
              <code>{JSON.stringify(watchedData, null, 2)}</code>
            </pre>
          </div>
          <div>
            <strong>JSON output (what will be saved):</strong>
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

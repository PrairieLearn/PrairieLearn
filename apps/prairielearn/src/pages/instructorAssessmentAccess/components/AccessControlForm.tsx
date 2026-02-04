import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';

import { AccessControlBreadcrumb } from './AccessControlBreadcrumb.js';
import { AccessControlSummary } from './AccessControlSummary.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import {
  type AccessControlFormData,
  type AccessControlJsonWithId,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToFormData,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJsonWithId[];
  onSubmit: (data: AccessControlJsonWithId[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
  isSaving?: boolean;
  urlPrefix: string;
  assessmentId: string;
}

const defaultInitialData: AccessControlJsonWithId[] = [];

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
  isSaving = false,
  urlPrefix,
  assessmentId,
}: AccessControlFormProps) {
  const baseUrl = `${urlPrefix}/assessment/${assessmentId}/access`;
  const [deleteModalState, setDeleteModalState] = useState<{
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
    formState: { isDirty, isValid },
  } = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const { append: appendOverride, remove: removeOverride } = useFieldArray({
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
    // Navigate to the new override edit page
    window.location.href = `${baseUrl}/new`;
  };

  const handleDeleteClick = (index: number) => {
    setDeleteModalState({ show: true, overrideIndex: index });
  };

  const handleDeleteConfirm = () => {
    if (deleteModalState.overrideIndex !== null) {
      removeOverride(deleteModalState.overrideIndex);
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
    const appliesTo = override?.appliesTo;
    if (!appliesTo) {
      return `Override ${index + 1}`;
    }

    if (appliesTo.targetType === 'group') {
      const groups = appliesTo.groups;
      if (groups.length === 0) return `Override ${index + 1}`;
      if (groups.length === 1) return `Overrides for ${groups[0].name}`;
      if (groups.length === 2) return `Overrides for ${groups[0].name} and ${groups[1].name}`;
      return `Overrides for ${groups[0].name}, ${groups[1].name}, and ${groups.length - 2} others`;
    } else {
      const individuals = appliesTo.individuals;
      if (individuals.length === 0) return `Override ${index + 1}`;
      const getName = (ind: (typeof individuals)[0]) => ind.name || ind.uid;
      if (individuals.length === 1) return `Overrides for ${getName(individuals[0])}`;
      if (individuals.length === 2) {
        return `Overrides for ${getName(individuals[0])} and ${getName(individuals[1])}`;
      }
      return `Overrides for ${getName(individuals[0])}, ${getName(individuals[1])}, and ${individuals.length - 2} others`;
    }
  };

  return (
    <div>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Breadcrumb navigation */}
        <AccessControlBreadcrumb baseUrl={baseUrl} currentPage={{ type: 'summary' }} />

        {/* Summary view with URL-based edit navigation */}
        <div className="mb-4">
          <AccessControlSummary
            baseUrl={baseUrl}
            courseInstanceId={courseInstance.id}
            getOverrideName={getOverrideName}
            mainRule={watchedData.mainRule}
            overrides={watchedData.overrides}
            onAddOverride={addOverride}
            onRemoveOverride={handleDeleteClick}
          />
        </div>

        {/* Form actions */}
        <div className="mt-4 d-flex gap-2">
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
    </div>
  );
}

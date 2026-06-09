import clsx from 'clsx';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { AssessmentModuleFormRow } from '../instructorCourseAdminModules.types.js';

export interface EditAssessmentModuleModalData {
  mode: 'create' | 'edit';
  assessmentModule: AssessmentModuleFormRow;
}

interface ModuleFormValues {
  name: string;
  heading: string;
}

export function EditAssessmentModuleModal({
  show,
  data,
  onHide,
  onExited,
  onSave,
  existingNames,
  lockName,
}: {
  show: boolean;
  data: EditAssessmentModuleModalData | null;
  onHide: () => void;
  onExited: () => void;
  onSave: (assessmentModule: AssessmentModuleFormRow) => void;
  existingNames: Set<string>;
  lockName: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ModuleFormValues>({
    // Reactive values because this modal stays mounted while editing different modules.
    values: {
      name: data?.assessmentModule.name ?? '',
      heading: data?.assessmentModule.heading ?? '',
    },
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const onFormSubmit = (formData: ModuleFormValues) => {
    if (!data) return;
    onSave({
      ...data.assessmentModule,
      // The Default module's name field is disabled, so keep its existing name.
      name: lockName ? data.assessmentModule.name : formData.name.trim(),
      heading: formData.heading.trim(),
    });
  };

  const nameValue = watch('name');
  const nameConflicts = show && !!nameValue.trim() && existingNames.has(nameValue.trim());

  return (
    <Modal
      show={show}
      onHide={onHide}
      onExited={() => {
        reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>{data?.mode === 'create' ? 'Add module' : 'Edit module'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          <div className="mb-3">
            <label className="form-label" htmlFor="module-name">
              Name
            </label>
            <input
              id="module-name"
              type="text"
              defaultValue={data?.assessmentModule.name ?? ''}
              className={clsx('form-control', errors.name && 'is-invalid')}
              aria-invalid={errors.name ? true : undefined}
              aria-errormessage={errors.name ? 'module-name-error' : undefined}
              aria-describedby={nameConflicts ? 'module-name-warning' : undefined}
              disabled={lockName}
              {...register('name', {
                required: 'Module name is required',
                validate: (value) => value.trim().length > 0 || 'Module name is required',
              })}
            />
            {errors.name && (
              <div id="module-name-error" className="invalid-feedback d-block">
                {errors.name.message}
              </div>
            )}
            <small className="form-text text-muted">
              {lockName
                ? 'The Default module is required and cannot be renamed.'
                : 'Short name for the module (preferably 1 to 3 words), e.g. "Introduction".'}
            </small>
            {nameConflicts && (
              <div
                id="module-name-warning"
                className="alert alert-warning mt-2 mb-0 py-2"
                role="alert"
              >
                <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" /> This module has
                the same name as another module.
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="module-heading">
              Heading
            </label>
            <input
              id="module-heading"
              type="text"
              defaultValue={data?.assessmentModule.heading ?? ''}
              className={clsx('form-control', errors.heading && 'is-invalid')}
              aria-invalid={errors.heading ? true : undefined}
              aria-errormessage={errors.heading ? 'module-heading-error' : undefined}
              {...register('heading', {
                required: 'Module heading is required',
                validate: (value) => value.trim().length > 0 || 'Module heading is required',
              })}
            />
            {errors.heading && (
              <div id="module-heading-error" className="invalid-feedback d-block">
                {errors.heading.message}
              </div>
            )}
            <small className="form-text text-muted">
              Full name of the module, visible to students.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" type="button" onClick={onHide}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

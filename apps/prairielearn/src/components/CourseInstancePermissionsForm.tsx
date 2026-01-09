import { useFormContext } from 'react-hook-form';

import type { EnumCourseInstanceRole } from '../lib/db-types.js';

export interface PermissionsFormValues {
  course_instance_permission: EnumCourseInstanceRole;
}

/**
 * Form for selecting initial course instance permissions.
 *
 * This component must be wrapped in a <FormProvider> from react-hook-form. The parent component's form state should extend from
 * PermissionsFormValues.
 *
 * @param params
 * @param params.formId - A unique ID for the form on the page.
 */
export function CourseInstancePermissionsForm({ formId }: { formId: string }) {
  const { register } = useFormContext<PermissionsFormValues>();

  return (
    <>
      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="radio"
          id={`${formId}-permission-none`}
          value="None"
          {...register('course_instance_permission')}
        />
        <label className="form-check-label" for={`${formId}-permission-none`}>
          No permissions
        </label>
        <div className="small text-muted">You will not have any course instance permissions.</div>
      </div>

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="radio"
          id={`${formId}-permission-viewer`}
          value="Student Data Viewer"
          {...register('course_instance_permission')}
        />
        <label className="form-check-label" for={`${formId}-permission-viewer`}>
          Student data viewer
        </label>
        <div className="small text-muted">You will be able to view student data and grades.</div>
      </div>

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="radio"
          id={`${formId}-permission-editor`}
          value="Student Data Editor"
          {...register('course_instance_permission')}
        />
        <label className="form-check-label" for={`${formId}-permission-editor`}>
          Student data editor
        </label>
        <div className="small text-muted">
          You will be able to view and edit student data, grades, and manage enrollments.
        </div>
      </div>
    </>
  );
}

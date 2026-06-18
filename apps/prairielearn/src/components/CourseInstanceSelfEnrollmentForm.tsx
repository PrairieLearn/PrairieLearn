import clsx from 'clsx';
import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

export interface SelfEnrollmentFormValues {
  self_enrollment_enabled: boolean;
  self_enrollment_use_enrollment_code: boolean;
}

/**
 * Form for editing self-enrollment settings for a course instance.
 *
 * This component must be wrapped in a <FormProvider> from react-hook-form. The parent component's form state should extend from
 * SelfEnrollmentFormValues.
 *
 * @param params
 * @param params.formId - An unique ID for the form on the page.
 */
export function CourseInstanceSelfEnrollmentForm({ formId }: { formId: string }) {
  const { register, setValue, control } = useFormContext<SelfEnrollmentFormValues>();

  const selfEnrollmentEnabled = useWatch({ control, name: 'self_enrollment_enabled' });
  const selfEnrollmentUseEnrollmentCode = useWatch({
    control,
    name: 'self_enrollment_use_enrollment_code',
  });

  // When self-enrollment is disabled, ensure use_enrollment_code is false
  useEffect(() => {
    if (!selfEnrollmentEnabled) {
      setValue('self_enrollment_use_enrollment_code', false);
    }
  }, [selfEnrollmentEnabled, setValue]);

  return (
    <>
      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id={`${formId}-self-enrollment-enabled`}
          {...register('self_enrollment_enabled')}
        />
        <label className="form-check-label" htmlFor={`${formId}-self-enrollment-enabled`}>
          Allow self-enrollment
        </label>
        <div className="small text-muted">
          If self-enrollment is disabled, students must be invited to this course instance.
        </div>
      </div>

      <div className={clsx('mb-3 form-check', !selfEnrollmentEnabled && 'd-none')}>
        <input
          className="form-check-input"
          type="checkbox"
          id={`${formId}-self-enrollment-use-enrollment-code`}
          disabled={!selfEnrollmentEnabled}
          {...register('self_enrollment_use_enrollment_code')}
        />
        <input
          type="hidden"
          name="self-enrollment-use-enrollment-code"
          value={selfEnrollmentUseEnrollmentCode ? 'checked' : ''}
        />
        <label
          className="form-check-label"
          htmlFor={`${formId}-self-enrollment-use-enrollment-code`}
        >
          Require enrollment code for self-enrollment
        </label>
        <div className="small text-muted">
          If an enrollment code is not required, any course instance or assessment link allows
          self-enrollment.
        </div>
      </div>
    </>
  );
}

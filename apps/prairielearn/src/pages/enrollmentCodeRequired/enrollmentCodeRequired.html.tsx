import { useForm } from 'react-hook-form';

import { EnrollmentCodeInput } from '../../components/EnrollmentCodeInput.js';

interface EnrollmentCodeForm {
  code1: string;
  code2: string;
  code3: string;
}

interface EnrollmentCodeRequiredProps {
  csrfToken: string;
}

export function EnrollmentCodeRequired({ csrfToken }: EnrollmentCodeRequiredProps) {
  const { register, handleSubmit, setValue, watch } = useForm<EnrollmentCodeForm>({
    mode: 'onChange',
    defaultValues: {
      code1: '',
      code2: '',
      code3: '',
    },
  });

  const onSubmit = async (data: EnrollmentCodeForm) => {
    const fullCode = `${data.code1}${data.code2}${data.code3}`;
    const hiddenInput = document.getElementById('enrollment_code_hidden');
    (hiddenInput! as HTMLInputElement).value = fullCode;

    // Submit the form programmatically after setting the hidden input
    const form = document.querySelector('form')!;
    form.submit();
  };
  return (
    <div class="container-fluid">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-primary text-white">
              <h4 class="mb-0">Enter Enrollment Code</h4>
            </div>
            <div class="card-body">
              <p class="mb-4">
                To access this course, you need to enter a valid enrollment code. Please enter the
                code provided by your instructor.
              </p>

              <form method="POST" onSubmit={handleSubmit(onSubmit)}>
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <input type="hidden" name="__action" value="validate_code" />
                <input type="hidden" name="enrollment_code" id="enrollment_code_hidden" />

                <EnrollmentCodeInput
                  register={register}
                  setValue={setValue}
                  watch={watch}
                  code1Field="code1"
                  code2Field="code2"
                  code3Field="code3"
                />

                <div class="d-grid mt-3">
                  <button type="submit" class="btn btn-primary btn-lg">
                    Join Course
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div class="text-center mt-4">
            <p class="text-muted small">
              Don't have an enrollment code? Contact your instructor for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

EnrollmentCodeRequired.displayName = 'EnrollmentCodeRequired';

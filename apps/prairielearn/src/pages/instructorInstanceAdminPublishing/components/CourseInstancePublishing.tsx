import { QueryClient } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { FormProvider, useForm } from 'react-hook-form';

import {
  CourseInstancePublishingForm,
  type PublishingFormValues,
} from '../../../components/CourseInstancePublishingForm.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { CourseInstancePublishingExtensionRow } from '../instructorInstanceAdminPublishing.types.js';
import { dateToPlainDateTime } from '../utils/dateUtils.js';

import { PublishingExtensions } from './PublishingExtensions.js';

export function CourseInstancePublishing({
  courseInstance,
  canEditPublishing,
  canViewExtensions,
  canEditExtensions,
  csrfToken,
  origHash,
  extensions,
  isDevMode,
}: {
  courseInstance: StaffCourseInstance;
  canEditPublishing: boolean;
  canViewExtensions: boolean;
  canEditExtensions: boolean;
  csrfToken: string;
  origHash: string | null;
  extensions: CourseInstancePublishingExtensionRow[];
  isDevMode: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());

  const originalStartDate = courseInstance.publishing_start_date;
  const originalEndDate = courseInstance.publishing_end_date;

  const defaultValues: PublishingFormValues = {
    start_date: originalStartDate
      ? dateToPlainDateTime(originalStartDate, courseInstance.display_timezone).toString()
      : '',
    end_date: originalEndDate
      ? dateToPlainDateTime(originalEndDate, courseInstance.display_timezone).toString()
      : '',
  };
  const methods = useForm<PublishingFormValues>({
    defaultValues,
  });
  const {
    watch,
    formState: { isValid },
  } = methods;

  const startDate = watch('start_date');

  const onSubmit = (e: SubmitEvent) => {
    if (!isValid) {
      e.preventDefault();
      return;
    }
  };

  return (
    <>
      <div class="mb-4">
        <h4 class="mb-4">Publishing</h4>

        {!canEditPublishing && origHash !== null && (
          <div class="alert alert-info" role="alert">
            You do not have permission to edit publishing settings.
          </div>
        )}
        {!canEditPublishing && origHash === null && (
          <div class="alert alert-warning" role="alert">
            You cannot edit publishing settings because the <code>infoCourseInstance.json</code>{' '}
            file does not exist.
          </div>
        )}

        <form method="POST" onSubmit={onSubmit}>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="__action" value="update_publishing" />
          <input type="hidden" name="orig_hash" value={origHash ?? ''} />

          <FormProvider {...methods}>
            <CourseInstancePublishingForm
              displayTimezone={courseInstance.display_timezone}
              canEdit={canEditPublishing}
              originalStartDate={courseInstance.publishing_start_date}
              originalEndDate={courseInstance.publishing_end_date}
            />
          </FormProvider>
        </form>

        {startDate && (
          <>
            <hr class="my-4" />
            {canViewExtensions ? (
              <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
                <PublishingExtensions
                  courseInstance={courseInstance}
                  initialExtensions={extensions}
                  canEdit={canEditExtensions}
                  csrfToken={csrfToken}
                />
              </QueryClientProviderDebug>
            ) : (
              <>
                <h5 class="mb-3">Extensions</h5>
                <div class="alert alert-info" role="alert">
                  You do not have permission to view extensions. Extensions require student data
                  permissions.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

CourseInstancePublishing.displayName = 'CourseInstancePublishing';

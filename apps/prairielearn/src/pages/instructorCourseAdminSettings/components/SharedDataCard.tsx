import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { type FieldArrayPath, useFieldArray, useForm } from 'react-hook-form';

import { StickySaveBar } from '@prairielearn/ui';

import {
  TypedPropertiesEditor,
  type TypedPropertyField,
} from '../../../components/TypedPropertiesEditor.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseEditErrorUrl } from '../../../lib/client/url.js';
import { classifySharedStateObjectPropertiesChange } from '../../../lib/shared-state.js';
import type { SharedStateObjectPropertiesJson } from '../../../schemas/infoCourse.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { SharedStateError } from '../../../trpc/course/shared-state.js';

export interface SharedDataObjectField {
  name: string;
  dataVersion: number;
  properties: TypedPropertyField[];
}

interface SharedDataFormValues {
  objects: SharedDataObjectField[];
}

interface SharedDataCardProps {
  objects: SharedDataObjectField[];
  canEdit: boolean;
  origHash: string;
  courseId: string;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

function toPropertiesRecord(properties: TypedPropertyField[]): SharedStateObjectPropertiesJson {
  const record: SharedStateObjectPropertiesJson = {};
  for (const prop of properties) {
    const parsedEnum = prop.enum.length > 0 ? prop.enum : undefined;
    record[prop.name] = {
      type: prop.type,
      default: prop.type === 'number' ? Number(prop.default) : prop.default,
      ...(parsedEnum ? { enum: prop.type === 'number' ? parsedEnum.map(Number) : parsedEnum } : {}),
    };
  }
  return record;
}

export function SharedDataCard(props: SharedDataCardProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: props.trpcCsrfToken, courseId: props.courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <SharedDataCardInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

SharedDataCard.displayName = 'SharedDataCard';

function SharedDataCardInner({
  objects: initialObjects,
  canEdit,
  origHash: initialOrigHash,
  courseId,
}: SharedDataCardProps) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.sharedState.saveSharedState.mutationOptions());

  const [origHash, setOrigHash] = useState(initialOrigHash);

  const originalPropertiesByName = useMemo(
    () =>
      new Map(initialObjects.map((obj) => [obj.name, toPropertiesRecord(obj.properties)] as const)),
    [initialObjects],
  );

  const {
    control,
    register,
    watch,
    setValue,
    clearErrors,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SharedDataFormValues>({
    mode: 'onSubmit',
    defaultValues: { objects: initialObjects },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'objects' });
  const objects = watch('objects');

  const onSubmit = (data: SharedDataFormValues) => {
    mutation.mutate(
      {
        origHash,
        objects: data.objects.map((obj) => ({
          name: obj.name,
          dataVersion: obj.dataVersion,
          properties: obj.properties.map((p) => ({
            name: p.name,
            type: p.type,
            default: String(p.default),
            enum: p.enum.map(String),
          })),
        })),
      },
      {
        onSuccess: ({ origHash: newOrigHash }) => {
          setOrigHash(newOrigHash);
          reset(data);
        },
        onError: (err) => {
          const ae = getAppError<SharedStateError['SaveSharedState']>(err);
          if (ae?.code === 'SYNC_JOB_FAILED') {
            window.location.assign(getCourseEditErrorUrl(courseId, ae.jobSequenceId));
          }
        },
      },
    );
  };

  const appError = getAppError<SharedStateError['SaveSharedState']>(mutation.error);
  const inlineError = appError?.code === 'SYNC_JOB_FAILED' ? null : appError;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1>Shared data</h1>
        {canEdit && (
          <button
            type="button"
            className="btn btn-sm btn-light"
            onClick={() => append({ name: '', dataVersion: 1, properties: [] })}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" /> Add shared-data object
          </button>
        )}
      </div>
      <div className="card-body">
        <small className="text-muted d-block mb-3">
          Configure{' '}
          <a
            href="https://docs.prairielearn.com/question/shared-state/"
            target="_blank"
            rel="noreferrer"
          >
            shared-data objects
          </a>{' '}
          that questions can read and write while a student works through an assessment instance.
          Questions opt in on the question settings page.
        </small>

        <AppErrorAlert
          error={inlineError}
          className="mb-3"
          render={{
            DUPLICATE_NAME: ({ message }) => message,
            INVALID_PROPERTIES: ({ message }) => message,
            CONFLICT: ({ message }) => message,
            UNKNOWN: ({ message }) => message,
          }}
          onDismiss={() => mutation.reset()}
        />

        {fields.length === 0 && (
          <div className="border rounded p-4 text-center text-muted">
            <i className="bi bi-boxes fs-3 d-block mb-2" aria-hidden="true" />
            No shared-data objects configured
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {fields.map((field, index) => {
            const original = originalPropertiesByName.get(objects[index]?.name);
            const breakingChange = original
              ? !classifySharedStateObjectPropertiesChange(
                  original,
                  toPropertiesRecord(objects[index]?.properties ?? []),
                ).compatible
              : false;

            return (
              <div key={field.id} className="border rounded p-3 mb-3">
                <div className="d-flex align-items-end flex-wrap gap-3 mb-3">
                  <div>
                    <label className="form-label" htmlFor={`shared-data-name-${field.id}`}>
                      Name
                    </label>
                    <input
                      type="text"
                      className={clsx(
                        'form-control form-control-sm font-monospace',
                        errors.objects?.[index]?.name && 'is-invalid',
                      )}
                      id={`shared-data-name-${field.id}`}
                      disabled={!canEdit}
                      defaultValue={field.name}
                      {...register(`objects.${index}.name`, {
                        required: 'Name is required',
                        validate: (value) => {
                          const duplicates = objects.filter(
                            (o, i) => i !== index && o.name === value,
                          );
                          return duplicates.length === 0 || 'Name must be unique';
                        },
                      })}
                    />
                    {errors.objects?.[index]?.name && (
                      <div className="invalid-feedback d-block">
                        {errors.objects[index].name.message}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="form-label d-block">Scope</span>
                    <span
                      className="badge bg-secondary-subtle text-secondary-emphasis"
                      title="Assessment instance is currently the only supported scope."
                    >
                      Assessment instance
                    </span>
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`shared-data-version-${field.id}`}>
                      Data version
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={clsx(
                        'form-control form-control-sm',
                        errors.objects?.[index]?.dataVersion && 'is-invalid',
                      )}
                      id={`shared-data-version-${field.id}`}
                      disabled={!canEdit}
                      defaultValue={field.dataVersion}
                      {...register(`objects.${index}.dataVersion`, {
                        required: true,
                        valueAsNumber: true,
                        min: 1,
                      })}
                      style={{ width: '6rem' }}
                    />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger ms-auto"
                      aria-label={`Remove shared-data object ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <i className="bi bi-trash" aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>

                {breakingChange && (
                  <div className="alert alert-warning py-2 small mb-3">
                    This change removes, renames, or retypes a property compared to what's currently
                    saved. Bump the data version so existing assessment instances reset to the new
                    defaults instead of failing to sync.
                  </div>
                )}

                <TypedPropertiesEditor
                  control={control}
                  name={
                    `objects.${index}.properties` as unknown as FieldArrayPath<SharedDataFormValues>
                  }
                  canEdit={canEdit}
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  clearErrors={clearErrors}
                  errors={errors.objects?.[index]?.properties}
                  addLabel="Add property"
                  emptyLabel="No properties configured"
                />
              </div>
            );
          })}

          {canEdit && (
            <StickySaveBar
              visible={isDirty}
              isSaving={isSubmitting || mutation.isPending}
              onCancel={() => reset()}
            />
          )}
        </form>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';

import { OverlayTrigger } from '@prairielearn/ui';

import type { AdminInstitution } from '../lib/client/safe-db-types.js';
import { type Timezone, formatTimezone } from '../lib/timezone.shared.js';
import { useTRPC } from '../trpc/administrator/trpc-context.js';

export interface CourseFormFieldValues {
  institution_id: string;
  short_name: string;
  title: string;
  display_timezone: string;
  path: string;
  repository_short_name: string;
}

function buildRepoShortName(prefix: string | null | undefined, shortName: string): string {
  const slug = shortName.replaceAll(' ', '').toLowerCase();
  return prefix ? `pl-${prefix}-${slug}` : `pl-${slug}`;
}

export function CourseFormFields({
  institutions,
  availableTimezones,
  coursesRoot,
  suggestPrefixOptions,
  aiSecretsConfigured,
}: {
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  suggestPrefixOptions: {
    institutionName: string;
    emailDomain: string;
    enabled: boolean;
  };
  aiSecretsConfigured: boolean;
}) {
  const trpc = useTRPC();
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<CourseFormFieldValues>();

  const institutionId = watch('institution_id');
  const shortName = watch('short_name');
  const path = watch('path');
  const repositoryShortName = watch('repository_short_name');

  const { data: prefixData, isError: isPrefixQueryError } = useQuery({
    ...trpc.courseRequests.selectInstitutionPrefixQuery.queryOptions({ institutionId }),
    enabled: !!institutionId,
  });

  const selectedInstitution = institutions.find((i) => i.id === institutionId);
  const isDefaultInstitution = selectedInstitution?.short_name === 'Default';

  useEffect(() => {
    if (!shortName) return;
    if (institutionId && !prefixData) return;
    if (isDefaultInstitution) return;
    const newRepoShortName = buildRepoShortName(prefixData?.prefix, shortName);
    setValue('path', `${coursesRoot}/${newRepoShortName}`);
    setValue('repository_short_name', newRepoShortName);
  }, [prefixData, shortName, institutionId, isDefaultInstitution, coursesRoot, setValue]);

  const repoFormatValid =
    !repositoryShortName || /^pl-[a-z0-9]+-[a-z0-9]+$/.test(repositoryShortName);
  const pathMatchesRepo =
    !repositoryShortName || !path || path === `${coursesRoot}/${repositoryShortName}`;

  const prefixReady = !institutionId || prefixData !== undefined || isPrefixQueryError;
  const expectedRepoShortName =
    prefixReady && shortName.trim() ? buildRepoShortName(prefixData?.prefix, shortName) : null;
  const repoMatchesShortName =
    !expectedRepoShortName || !repositoryShortName || repositoryShortName === expectedRepoShortName;

  const suggestPrefixQuery = useQuery({
    ...trpc.courseRequests.suggestPrefixFromEmailQuery.queryOptions({
      institutionName: suggestPrefixOptions.institutionName,
      emailDomain: suggestPrefixOptions.emailDomain,
    }),
    enabled: false,
  });

  useEffect(() => {
    if (!suggestPrefixQuery.data?.prefix) return;
    const newRepoShortName = buildRepoShortName(suggestPrefixQuery.data.prefix, shortName);
    setValue('path', `${coursesRoot}/${newRepoShortName}`);
    setValue('repository_short_name', newRepoShortName);
  }, [suggestPrefixQuery.data, shortName, coursesRoot, setValue]);

  return (
    <>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormInstitution">
          Institution
        </label>
        <select
          id="courseFormInstitution"
          className={clsx('form-select', errors.institution_id && 'is-invalid')}
          aria-invalid={errors.institution_id ? true : undefined}
          aria-errormessage={errors.institution_id ? 'courseFormInstitution-error' : undefined}
          {...register('institution_id', {
            required: 'Select an institution',
            onChange: (e) => {
              const selected = institutions.find((i) => i.id === e.target.value);
              if (selected) {
                setValue('display_timezone', selected.display_timezone);
              }
            },
          })}
        >
          <option value="" disabled>
            Select an institution...
          </option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.short_name}
            </option>
          ))}
        </select>
        {errors.institution_id && (
          <div id="courseFormInstitution-error" className="invalid-feedback">
            {errors.institution_id.message}
          </div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {isDefaultInstitution && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> The "Default"
              institution is typically not intended for new courses.
            </div>
          )}
          {isPrefixQueryError && (
            <div className="form-text text-danger">
              Failed to load institution prefix. Repository name will not be auto-filled.
            </div>
          )}
        </div>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormShortName">
          Short name
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.short_name && 'is-invalid')}
          id="courseFormShortName"
          placeholder="XC 101"
          aria-invalid={errors.short_name ? true : undefined}
          aria-errormessage={errors.short_name ? 'courseFormShortName-error' : undefined}
          {...register('short_name', {
            required: 'Enter a short name',
            pattern: {
              value: /^[A-Z]+ [A-Z0-9]+$/,
              message:
                'The course rubric and number should be a series of upper case letters, followed by a space, followed by a series of numbers and/or letters.',
            },
          })}
        />
        {errors.short_name && (
          <div id="courseFormShortName-error" className="invalid-feedback">
            {errors.short_name.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormTitle">
          Title
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.title && 'is-invalid')}
          id="courseFormTitle"
          placeholder="Template course title"
          aria-invalid={errors.title ? true : undefined}
          aria-errormessage={errors.title ? 'courseFormTitle-error' : undefined}
          maxLength={75}
          {...register('title', {
            required: 'Enter a title',
            maxLength: { value: 75, message: 'Title must be at most 75 characters' },
          })}
        />
        {errors.title && (
          <div id="courseFormTitle-error" className="invalid-feedback">
            {errors.title.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormTimezone">
          Timezone
        </label>
        <select
          className={clsx('form-select', errors.display_timezone && 'is-invalid')}
          id="courseFormTimezone"
          aria-invalid={errors.display_timezone ? true : undefined}
          aria-errormessage={errors.display_timezone ? 'courseFormTimezone-error' : undefined}
          {...register('display_timezone', { required: 'Select a timezone' })}
        >
          <option value="" disabled>
            Select a timezone...
          </option>
          {availableTimezones.map((tz) => (
            <option key={tz.name} value={tz.name}>
              {formatTimezone(tz)}
            </option>
          ))}
        </select>
        {errors.display_timezone && (
          <div id="courseFormTimezone-error" className="invalid-feedback">
            {errors.display_timezone.message}
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormPath">
          Path
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.path && 'is-invalid')}
          id="courseFormPath"
          placeholder="/data1/courses/pl-XXX"
          aria-invalid={errors.path ? true : undefined}
          aria-errormessage={errors.path ? 'courseFormPath-error' : undefined}
          {...register('path', { required: 'Enter a path' })}
        />
        {errors.path && (
          <div id="courseFormPath-error" className="invalid-feedback">
            {errors.path.message}
          </div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {!pathMatchesRepo && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> Path and repository
              name are out of sync. Expected path to be{' '}
              <code>
                {coursesRoot}/{repositoryShortName}
              </code>
              .
            </div>
          )}
        </div>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseFormRepositoryName">
          Repository name
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.repository_short_name && 'is-invalid')}
          id="courseFormRepositoryName"
          placeholder="pl-XXX"
          aria-invalid={errors.repository_short_name ? true : undefined}
          aria-errormessage={
            errors.repository_short_name ? 'courseFormRepositoryName-error' : undefined
          }
          {...register('repository_short_name', { required: 'Enter a repository name' })}
        />
        {errors.repository_short_name && (
          <div id="courseFormRepositoryName-error" className="invalid-feedback">
            {errors.repository_short_name.message}
          </div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {!repoFormatValid && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> Repository name should
              follow the format <code>pl-&#123;institution&#125;-&#123;course&#125;</code> (e.g.{' '}
              <code>pl-uiuc-cs101</code>).
            </div>
          )}
          {!repoMatchesShortName && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> Repository name is out
              of sync with the short name. Expected <code>{expectedRepoShortName}</code>.
            </div>
          )}
        </div>
      </div>
      {prefixData !== undefined && !prefixData.prefix && (
        <div className="mb-3">
          <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="top"
            tooltip={{
              body: aiSecretsConfigured
                ? 'Uses AI web search to suggest a short prefix for the repository name based on the institution (e.g. "uiuc" for the University of Illinois). Useful when no existing courses are found for the selected institution.'
                : 'AI features require the correspondent OpenAI key to be configured.',
              props: { id: 'suggest-prefix-tooltip' },
            }}
          >
            <span className="d-inline-block">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                aria-label="Suggest repository and path prefix"
                disabled={
                  suggestPrefixQuery.isFetching ||
                  !suggestPrefixOptions.enabled ||
                  !aiSecretsConfigured
                }
                aria-busy={suggestPrefixQuery.isFetching}
                onClick={() => suggestPrefixQuery.refetch()}
              >
                {suggestPrefixQuery.isFetching ? (
                  <>
                    {' '}
                    <i className="fa fa-spinner fa-spin" aria-hidden="true" /> Suggesting...
                  </>
                ) : (
                  <>
                    {' '}
                    <i className="fa fa-search" aria-hidden="true" /> Suggest repository and path
                    prefix
                  </>
                )}
              </button>
            </span>
          </OverlayTrigger>
          <div aria-live="polite" aria-atomic="true">
            {suggestPrefixQuery.isError && (
              <div className="mt-2 text-danger small">Failed to suggest prefix. Try again.</div>
            )}
            {suggestPrefixQuery.data && (
              <div className="mt-2 text-muted small">
                <ReactMarkdown>{suggestPrefixQuery.data.reasoning}</ReactMarkdown>
              </div>
            )}
            {suggestPrefixQuery.data && suggestPrefixQuery.data.sources.length > 0 && (
              <div className="mt-1">
                <span className="small text-muted">Sources</span>
                <div className="d-flex flex-wrap gap-1">
                  {suggestPrefixQuery.data.sources
                    .filter(
                      (source, index, arr) => arr.findIndex((s) => s.url === source.url) === index,
                    )
                    .map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="small"
                      >
                        {source.title ?? source.url}
                      </a>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

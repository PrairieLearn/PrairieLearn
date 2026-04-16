import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';

import { OverlayTrigger } from '@prairielearn/ui';

import type { AdminInstitution } from '../lib/client/safe-db-types.js';
import { type Timezone, formatTimezone } from '../lib/timezone.shared.js';
import { useTRPC } from '../trpc/administrator/context.js';

export interface CourseFormFieldValues {
  institution_id: string;
  short_name: string;
  title: string;
  display_timezone: string;
  path: string;
  repository_short_name: string;
}

export function buildRepoShortName(prefix: string | null | undefined, shortName: string): string {
  const slug = shortName.replaceAll(' ', '').toLowerCase();
  return prefix ? `pl-${prefix}-${slug}` : `pl-${slug}`;
}

type InstitutionPrefixState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'resolved'; prefix: string | null };

export function useInstitutionPrefix(
  institutionId: string,
  institutions: AdminInstitution[],
): InstitutionPrefixState {
  const trpc = useTRPC();

  const { data, isError, isLoading } = useQuery({
    ...trpc.courseRequests.selectInstitutionPrefix.queryOptions({ institutionId }),
    enabled: !!institutionId,
  });

  const selectedInstitution = institutions.find((i) => i.id === institutionId);

  if (!institutionId || selectedInstitution?.short_name === 'Default') {
    return { status: 'idle' };
  }
  // Keep using the last resolved prefix if a refetch fails so repo/path auto-fill
  // stays stable instead of temporarily falling back to a prefix-less value.
  if (data !== undefined) return { status: 'resolved', prefix: data.prefix };
  if (isError) return { status: 'error' };
  if (isLoading) return { status: 'loading' };
  return { status: 'loading' };
}

function AutoFilledHint({ source }: { source: string }) {
  return (
    <div className="form-text text-primary">
      <i className="bi bi-stars" aria-hidden="true" /> Auto-filled from {source}
    </div>
  );
}

export function AdministratorCourseFormFields({
  institutions,
  availableTimezones,
  coursesRoot,
  prefixState,
  emailDomain,
  aiSecretsConfigured,
  autoFilledInstitutionId,
}: {
  institutions: AdminInstitution[];
  availableTimezones: Timezone[];
  coursesRoot: string;
  prefixState: InstitutionPrefixState;
  emailDomain?: string;
  aiSecretsConfigured: boolean;
  autoFilledInstitutionId?: string | null;
}) {
  const trpc = useTRPC();
  const {
    register,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useFormContext<CourseFormFieldValues>();

  const institutionId = watch('institution_id');
  const shortName = watch('short_name');
  const path = watch('path');
  const repositoryShortName = watch('repository_short_name');
  const displayTimezone = watch('display_timezone');

  const selectedInstitution = institutions.find((i) => i.id === institutionId);
  const isDefaultInstitution = selectedInstitution?.short_name === 'Default';
  const institutionPrefix = prefixState.status === 'resolved' ? prefixState.prefix : undefined;

  const repoFormatValid =
    !repositoryShortName || /^pl-[a-z0-9]+-[a-z0-9]+$/.test(repositoryShortName);
  const pathMatchesRepo =
    !repositoryShortName || !path || path === `${coursesRoot}/${repositoryShortName}`;
  const showPathMismatchWarning = !!dirtyFields.path && !pathMatchesRepo;

  const institutionAutoFilled =
    autoFilledInstitutionId != null && institutionId === autoFilledInstitutionId;
  const timezoneAutoFilled =
    institutionAutoFilled && displayTimezone === selectedInstitution?.display_timezone;
  const repoAutoFilled =
    institutionAutoFilled &&
    institutionPrefix != null &&
    repositoryShortName === buildRepoShortName(institutionPrefix, shortName);
  const pathAutoFilled = repoAutoFilled && path === `${coursesRoot}/${repositoryShortName}`;

  const institutionLongName = selectedInstitution?.long_name ?? '';
  const institutionShortName = selectedInstitution?.short_name ?? '';

  const suggestPrefixQuery = useQuery({
    ...trpc.courseRequests.suggestInstitutionPrefix.queryOptions({
      institutionLongName,
      institutionShortName,
      emailDomain: emailDomain ?? '',
    }),
    enabled: false,
  });

  const effectivePrefix = suggestPrefixQuery.data?.prefix ?? institutionPrefix;

  const prefixReady = prefixState.status !== 'loading';
  const expectedRepoShortName =
    prefixReady && shortName.trim() && effectivePrefix != null
      ? buildRepoShortName(effectivePrefix, shortName)
      : null;
  const repoMatchesShortName =
    !expectedRepoShortName || !repositoryShortName || repositoryShortName === expectedRepoShortName;

  useEffect(() => {
    if (!shortName) return;
    if (prefixState.status === 'loading') return;
    if (isDefaultInstitution) return;

    // Keep repo/path in sync with the selected institution prefix until the admin
    // manually edits those fields, then preserve the manual values.
    const newRepoShortName = buildRepoShortName(effectivePrefix, shortName);
    const pathRepoShortName =
      dirtyFields.repository_short_name && repositoryShortName
        ? repositoryShortName
        : newRepoShortName;

    if (!dirtyFields.repository_short_name) {
      setValue('repository_short_name', newRepoShortName);
    }

    if (!dirtyFields.path) {
      setValue('path', `${coursesRoot}/${pathRepoShortName}`);
    }
  }, [
    effectivePrefix,
    shortName,
    prefixState.status,
    isDefaultInstitution,
    coursesRoot,
    repositoryShortName,
    dirtyFields.path,
    dirtyFields.repository_short_name,
    setValue,
  ]);

  return (
    <div className="row g-3 mb-3">
      <div className="col-md-6">
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
              {i.short_name} ({i.long_name})
            </option>
          ))}
        </select>
        {errors.institution_id && (
          <div id="courseFormInstitution-error" className="invalid-feedback">
            {errors.institution_id.message}
          </div>
        )}
        {institutionAutoFilled && <AutoFilledHint source="requesting user's account" />}
        <div aria-live="polite" aria-atomic="true">
          {isDefaultInstitution && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> The "Default"
              institution is typically not intended for new courses.
            </div>
          )}
          {prefixState.status === 'error' && (
            <div className="form-text text-danger">
              Failed to load institution prefix. Repository name will not be auto-filled.
            </div>
          )}
        </div>
      </div>
      <div className="col-md-6">
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
        {timezoneAutoFilled && <AutoFilledHint source="selected institution" />}
      </div>

      <div className="col-md-6">
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
          {...register('short_name', { required: 'Enter a short name' })}
        />
        {errors.short_name && (
          <div id="courseFormShortName-error" className="invalid-feedback">
            {errors.short_name.message}
          </div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {shortName && !/^[A-Z]+ [A-Z0-9]+$/.test(shortName) && (
            <div className="form-text text-warning">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" /> The course rubric and
              number should be a series of upper case letters, followed by a space, followed by a
              series of numbers and/or letters.
            </div>
          )}
        </div>
      </div>
      <div className="col-md-6">
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

      <div className="col-md-6">
        <label className="form-label" htmlFor="courseFormRepositoryName">
          Repository name
        </label>
        <div className="d-flex gap-2">
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
          {prefixState.status === 'resolved' && !prefixState.prefix && aiSecretsConfigured && (
            <OverlayTrigger
              trigger={['hover', 'focus']}
              placement="top"
              tooltip={{
                body: 'Use AI to suggest a repository name prefix based on the institution',
                props: { id: 'suggest-prefix-tooltip' },
              }}
            >
              <button
                type="button"
                className="btn btn-outline-primary flex-shrink-0"
                aria-label="Suggest repository name prefix"
                disabled={
                  suggestPrefixQuery.isFetching || !shortName.trim() || !institutionLongName
                }
                aria-busy={suggestPrefixQuery.isFetching}
                onClick={() => suggestPrefixQuery.refetch()}
              >
                {suggestPrefixQuery.isFetching ? (
                  <i className="fa fa-spinner fa-spin" aria-hidden="true" />
                ) : (
                  <i className="bi bi-stars" aria-hidden="true" />
                )}
              </button>
            </OverlayTrigger>
          )}
        </div>
        {errors.repository_short_name && (
          <div id="courseFormRepositoryName-error" className="invalid-feedback d-block">
            {errors.repository_short_name.message}
          </div>
        )}
        {repoAutoFilled && <AutoFilledHint source="selected institution" />}
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
      <div className="col-md-6">
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
          {...register('path', {
            required: 'Enter a path',
            validate: (value) => {
              if (coursesRoot && !value.startsWith(`${coursesRoot}/`)) {
                return `Path must be within ${coursesRoot}/`;
              }
              return true;
            },
          })}
        />
        {errors.path && (
          <div id="courseFormPath-error" className="invalid-feedback">
            {errors.path.message}
          </div>
        )}
        {pathAutoFilled && <AutoFilledHint source="selected institution" />}
        <div aria-live="polite" aria-atomic="true">
          {showPathMismatchWarning && (
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

      {(suggestPrefixQuery.isError || suggestPrefixQuery.data) && (
        <div className="col-12" aria-live="polite" aria-atomic="true">
          {suggestPrefixQuery.isError && (
            <div className="alert alert-danger small mb-0 py-2">
              Failed to suggest prefix. Try again.
            </div>
          )}
          {suggestPrefixQuery.data && (
            <div className="alert alert-info small mb-0 py-2">
              <i className="bi bi-stars me-1" aria-hidden="true" />
              <ReactMarkdown
                components={{
                  p: ({ children }) => <span>{children}</span>,
                }}
              >
                {suggestPrefixQuery.data.reasoning}
              </ReactMarkdown>
              {suggestPrefixQuery.data.sources.length > 0 && (
                <div className="mt-1">
                  {[
                    ...new Map(suggestPrefixQuery.data.sources.map((s) => [s.url, s])).values(),
                  ].map((source, i) => (
                    <span key={source.url}>
                      {i > 0 && ' · '}
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title ?? source.url}
                      </a>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import ReactMarkdown from 'react-markdown';

import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAuthnProvider } from '../../../lib/client/safe-db-types.js';
import { type Timezone, formatTimezone } from '../../../lib/timezone.shared.js';
import { useTRPC } from '../../../trpc/administrator/context.js';

interface AddInstitutionFormData {
  short_name: string;
  long_name: string;
  display_timezone: string;
  uid_regexp: string;
  enabled_authn_provider_ids: string[];
}

export function AddInstitutionModal({
  show,
  availableTimezones,
  supportedAuthenticationProviders,
  onClose,
  aiSecretsConfigured,
}: {
  show: boolean;
  availableTimezones: Timezone[];
  supportedAuthenticationProviders: StaffAuthnProvider[];
  onClose: () => void;
  aiSecretsConfigured: boolean;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.institutions.addInstitution.mutationOptions());

  const defaultCheckedIds = supportedAuthenticationProviders
    .filter((p) => p.name === 'Google' || p.name === 'Azure')
    .map((p) => p.id);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<AddInstitutionFormData>({
    mode: 'onSubmit',
    defaultValues: {
      display_timezone: '',
      enabled_authn_provider_ids: defaultCheckedIds,
    },
  });
  const institutionName = watch('long_name');
  const emailDomain = watch('short_name');

  const onSubmit = (data: AddInstitutionFormData) => {
    mutation.mutate(
      {
        shortName: data.short_name,
        longName: data.long_name,
        displayTimezone: data.display_timezone,
        uidRegexp: data.uid_regexp,
        enabledAuthnProviderIds: data.enabled_authn_provider_ids,
      },
      { onSuccess: () => window.location.reload() },
    );
  };

  const timezoneQuery = useQuery({
    ...trpc.institutions.suggestTimezone.queryOptions({ institutionName, emailDomain }),
    enabled: false,
  });

  const validTimezoneNames = new Set(availableTimezones.map((tz) => tz.name));

  async function handleSuggestTimezone() {
    const { data } = await timezoneQuery.refetch();
    if (data?.timezone && validTimezoneNames.has(data.timezone)) {
      setValue('display_timezone', data.timezone, { shouldValidate: true, shouldDirty: true });
    } else {
      setValue('display_timezone', '', { shouldValidate: true });
    }
  }

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Add Institution</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form id="add-institution-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-3">
            <label className="form-label" htmlFor="short_name">
              Short name
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.short_name && 'is-invalid')}
              id="short_name"
              aria-describedby="short_name_help"
              aria-invalid={errors.short_name ? true : undefined}
              aria-errormessage={errors.short_name ? 'short_name-error' : undefined}
              {...register('short_name', { required: 'Enter a short name' })}
            />
            {errors.short_name && (
              <div id="short_name-error" className="invalid-feedback">
                {errors.short_name.message}
              </div>
            )}
            <small id="short_name_help" className="form-text text-muted">
              An abbreviation or short name, e.g. "illinois.edu" or "ubc.ca". Usually this should be
              the institution's domain.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="long_name">
              Long name
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.long_name && 'is-invalid')}
              id="long_name"
              aria-describedby="long_name_help"
              aria-invalid={errors.long_name ? true : undefined}
              aria-errormessage={errors.long_name ? 'long_name-error' : undefined}
              {...register('long_name', { required: 'Enter a long name' })}
            />
            {errors.long_name && (
              <div id="long_name-error" className="invalid-feedback">
                {errors.long_name.message}
              </div>
            )}
            <small id="long_name_help" className="form-text text-muted">
              Use the full name of the university, e.g. "University of Illinois Urbana-Champaign".
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="display_timezone">
              Timezone
            </label>
            <div className="d-flex gap-2 align-items-center">
              <select
                className={clsx('form-select', errors.display_timezone && 'is-invalid')}
                id="display_timezone"
                aria-describedby="display_timezone_help"
                aria-invalid={errors.display_timezone ? true : undefined}
                aria-errormessage={errors.display_timezone ? 'display_timezone-error' : undefined}
                {...register('display_timezone', { required: 'Select a timezone' })}
              >
                <option value="" disabled hidden>
                  Timezone
                </option>
                {availableTimezones.map((tz, i) => (
                  <option key={tz.name} value={tz.name} id={`timezone-${i}`}>
                    {formatTimezone(tz)}
                  </option>
                ))}
              </select>
              <OverlayTrigger
                trigger={['hover', 'focus']}
                placement="top"
                tooltip={{
                  body: aiSecretsConfigured
                    ? 'Uses AI web search to suggest the correct timezone based on the institution name and domain. Fill in the short name and long name first.'
                    : 'AI features require the corresponding OpenAI key to be configured.',
                  props: { id: 'suggest-timezone-tooltip' },
                }}
              >
                <span className="d-inline-block">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    aria-label="Suggest timezone"
                    aria-busy={timezoneQuery.isFetching}
                    disabled={
                      timezoneQuery.isFetching ||
                      !aiSecretsConfigured ||
                      !institutionName ||
                      !emailDomain
                    }
                    onClick={handleSuggestTimezone}
                  >
                    {timezoneQuery.isFetching ? 'Suggesting...' : 'Suggest'}
                  </button>
                </span>
              </OverlayTrigger>
            </div>
            {errors.display_timezone && (
              <div id="display_timezone-error" className="invalid-feedback d-block">
                {errors.display_timezone.message}
              </div>
            )}
            <small id="display_timezone_help" className="form-text text-muted">
              The allowable timezones are from the{' '}
              <a
                href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                target="_blank"
                rel="noreferrer"
              >
                tz database
              </a>
              . It's best to use a city-based timezone that has the same times as the institution,
              e.g. "America/Chicago".
            </small>
            <div aria-live="polite" aria-atomic="true">
              {timezoneQuery.isError && (
                <div className="mt-2 text-danger small">Failed to suggest timezone. Try again.</div>
              )}
              {timezoneQuery.data && (
                <div className="mt-2 text-muted small">
                  <ReactMarkdown>{timezoneQuery.data.reasoning}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="uid_regexp">
              UID regexp
            </label>
            <input
              type="text"
              className="form-control"
              id="uid_regexp"
              aria-describedby="uid_regexp_help"
              {...register('uid_regexp')}
            />
            <small id="uid_regexp_help" className="form-text text-muted">
              Should match the non-username part of user UIDs, e.g. <code>@example\.com$</code>.
              This should be set for institution-based access restrictions to work correctly.
            </small>
          </div>
          {supportedAuthenticationProviders.length > 0 ? (
            <div className="mb-3">
              <div className="form-label">Authentication providers</div>
              <div className="mb-2">
                {supportedAuthenticationProviders.map((provider) => (
                  <div key={provider.id} className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`authn-provider-${provider.id}`}
                      value={provider.id}
                      {...register('enabled_authn_provider_ids')}
                    />
                    <label className="form-check-label" htmlFor={`authn-provider-${provider.id}`}>
                      {provider.name}
                    </label>
                  </div>
                ))}
              </div>
              <small className="form-text text-muted">
                Select which authentication methods users from this institution can use to log in.
                Google and Azure (Microsoft) are good defaults for most institutions. You can
                configure authentication providers after the institution is created.
              </small>
            </div>
          ) : (
            <div className="alert alert-info">
              Neither Google nor Microsoft authentication is configured for this PrairieLearn
              installation. Additional SSO authentication providers can be configured later.
            </div>
          )}
          {mutation.isError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {mutation.error.message}
            </Alert>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          form="add-institution-form"
          disabled={isSubmitting || mutation.isPending}
        >
          Add institution
        </button>
      </Modal.Footer>
    </Modal>
  );
}

AddInstitutionModal.displayName = 'AddInstitutionModal';

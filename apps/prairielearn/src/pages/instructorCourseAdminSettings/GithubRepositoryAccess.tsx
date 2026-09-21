import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import {
  GITHUB_USERNAME_MAX_LENGTH,
  GITHUB_USERNAME_VALIDATION_MESSAGE,
  isValidGithubUsername,
} from '../../lib/github-utils.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { GithubAccessError } from '../../trpc/course/github-access.js';

interface GithubRepositoryAccessProps {
  courseId: string;
  repositoryUrl: string | null;
  isSupportedRepository: boolean;
  isOwner: boolean;
  canGrantAccess: boolean;
  staffUrl: string;
  trpcCsrfToken: string;
}

export function GithubRepositoryAccess(props: GithubRepositoryAccessProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ courseId: props.courseId, csrfToken: props.trpcCsrfToken }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <GithubRepositoryAccessInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

GithubRepositoryAccess.displayName = 'GithubRepositoryAccess';

function GithubRepositoryAccessInner({
  repositoryUrl,
  isSupportedRepository,
  isOwner,
  canGrantAccess,
  staffUrl,
}: GithubRepositoryAccessProps) {
  const trpc = useTRPC();
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState<{ username: string; invited: boolean } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { username: '' } });
  const grantMutation = useMutation({
    ...trpc.githubAccess.grant.mutationOptions(),
    onSuccess: (result) => {
      setSuccess(result);
      setShowModal(false);
    },
  });
  const grantError = getAppError<GithubAccessError['Grant']>(grantMutation.error);

  return (
    <section className="mb-3" aria-labelledby="github-access-heading">
      <h2 className="h6" id="github-access-heading">
        Access to GitHub repository
      </h2>
      {repositoryUrl && (
        <p>
          You can access this repository at{' '}
          <a href={repositoryUrl} target="_blank" rel="noreferrer">
            {repositoryUrl}
          </a>
          .
        </p>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)}>
          {success.invited ? (
            <>
              An invitation for Admin access is ready for <strong>{success.username}</strong>.{' '}
              <a href={`${repositoryUrl}/invitations`} target="_blank" rel="noreferrer">
                Accept the invitation on GitHub
              </a>{' '}
              while signed in as that user to access the repository.
            </>
          ) : (
            <>
              <strong>{success.username}</strong> now has Admin access to this repository on GitHub.
            </>
          )}
        </Alert>
      )}
      {!isSupportedRepository ? (
        <p className="mb-0">
          PrairieLearn can only grant access to repositories in the PrairieLearn organization on
          github.com. For repositories in another organization or on another hosting platform,
          contact the repository administrator to request access.
        </p>
      ) : isOwner ? (
        <>
          <p>
            If you don't have access to the GitHub repository, as a course Owner you can grant
            yourself or other people access.
          </p>
          {canGrantAccess ? (
            <Button
              type="button"
              variant="outline-primary"
              className="mb-3"
              onClick={() => {
                reset();
                grantMutation.reset();
                setSuccess(null);
                setShowModal(true);
              }}
            >
              Grant myself access
            </Button>
          ) : (
            <Alert variant="warning">
              GitHub access cannot be granted on this server. Please contact support.
            </Alert>
          )}
          <p className="mb-0">
            Once you have access, you can{' '}
            <a href={`${repositoryUrl}/settings/access`} target="_blank" rel="noreferrer">
              grant other people access on GitHub
            </a>
            .
          </p>
        </>
      ) : (
        <p className="mb-0">
          If you don't have access to the GitHub repository, ask one of the course Owners (
          <a href={staffUrl}>see Staff list</a>) to grant you access.
        </p>
      )}
      <Modal
        show={showModal}
        aria-labelledby="grant-github-access-title"
        onHide={() => {
          if (!grantMutation.isPending) setShowModal(false);
        }}
      >
        <Modal.Header closeButton={!grantMutation.isPending}>
          <Modal.Title id="grant-github-access-title">Grant myself GitHub access</Modal.Title>
        </Modal.Header>
        <Form
          noValidate
          onSubmit={(event) => {
            // The modal is portaled out of the course settings form, but React events still bubble to it.
            event.stopPropagation();
            void handleSubmit(({ username }) =>
              grantMutation.mutate({ username: username.trim() }),
            )(event);
          }}
        >
          <Modal.Body>
            <p>
              Enter your GitHub username to receive <strong>Admin</strong> access to this
              repository.
            </p>
            <p>
              If you don't have a GitHub account,{' '}
              <a href="https://github.com/signup" target="_blank" rel="noreferrer">
                create a free account
              </a>{' '}
              first. You can find your username by clicking your profile picture in the top-right
              corner of GitHub.
            </p>
            <Form.Group controlId="github-username">
              <Form.Label>GitHub username</Form.Label>
              <Form.Control
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={GITHUB_USERNAME_MAX_LENGTH}
                defaultValue=""
                {...register('username', {
                  validate: (value) =>
                    isValidGithubUsername(value.trim()) || GITHUB_USERNAME_VALIDATION_MESSAGE,
                })}
                isInvalid={!!errors.username}
                aria-invalid={!!errors.username}
                aria-errormessage={errors.username ? 'github-username-error' : undefined}
                aria-describedby="github-username-help"
                disabled={grantMutation.isPending}
              />
              <Form.Text id="github-username-help">
                Enter your username, not your email address or profile URL.
              </Form.Text>
              <Form.Control.Feedback type="invalid" id="github-username-error">
                {errors.username?.message}
              </Form.Control.Feedback>
            </Form.Group>
            <div className="mt-3">
              <AppErrorAlert error={grantError} render={{ UNKNOWN: ({ message }) => message }} />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              disabled={grantMutation.isPending}
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={grantMutation.isPending}>
              {grantMutation.isPending ? 'Granting access…' : 'Grant access'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </section>
  );
}

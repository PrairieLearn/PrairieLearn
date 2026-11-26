import { QueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CloseButton } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { skipNextFormConfirmation } from '../lib/client/confirm-on-unload.js';
import {
  type InstanceQuestionTrpcClientOptions,
  createInstanceQuestionTrpcClient,
} from '../trpc/instanceQuestion/client.js';
import { TRPCProvider, useTRPC } from '../trpc/instanceQuestion/context.js';
import type { UnsavedSubmissionsError } from '../trpc/instanceQuestion/unsaved-submissions.js';

export function UnsavedSubmissionRecovery({
  clientOptions,
  variantId,
  savedAtText,
}: {
  clientOptions: InstanceQuestionTrpcClientOptions;
  variantId: string;
  savedAtText: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createInstanceQuestionTrpcClient(clientOptions));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RecoveryBanner variantId={variantId} savedAtText={savedAtText} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

UnsavedSubmissionRecovery.displayName = 'UnsavedSubmissionRecovery';

function RecoveryBanner({ variantId, savedAtText }: { variantId: string; savedAtText: string }) {
  const trpc = useTRPC();
  const [visible, setVisible] = useState(true);
  const bannerRef = useRef<HTMLDivElement>(null);
  const restoreMutation = useMutation({
    ...trpc.unsavedSubmissions.restore.mutationOptions(),
    onSuccess: () => {
      skipNextFormConfirmation();
      window.location.reload();
    },
  });
  const dismissMutation = useMutation({
    ...trpc.unsavedSubmissions.dismiss.mutationOptions(),
    onSuccess: () => setVisible(false),
  });
  const pending = restoreMutation.isPending || dismissMutation.isPending;
  const error =
    getAppError<UnsavedSubmissionsError['restore']>(restoreMutation.error) ??
    getAppError<UnsavedSubmissionsError['dismiss']>(dismissMutation.error);

  // The collector expires this prompt when newer edits should replace the stored draft.
  useEffect(() => {
    const banner = bannerRef.current;
    const expire = () => setVisible(false);
    banner?.addEventListener('unsaved-submission-recovery-expired', expire);
    return () => banner?.removeEventListener('unsaved-submission-recovery-expired', expire);
  }, []);

  if (!visible) return null;

  const startInteraction = () => {
    window.dispatchEvent(new Event('unsaved-submission-recovery-interaction'));
    restoreMutation.reset();
    dismissMutation.reset();
  };

  return (
    <Alert
      ref={bannerRef}
      id="unsaved-submission-recovery"
      variant="warning"
      data-recovery-pending={pending ? 'true' : undefined}
    >
      <CloseButton
        className="float-end"
        aria-label="Dismiss unsaved work"
        disabled={pending}
        onClick={() => {
          startInteraction();
          dismissMutation.mutate();
        }}
      />
      <Alert.Heading as="h2" className="h5">
        You have unsaved work
      </Alert.Heading>
      <p>Your draft was saved at {savedAtText}. Restore it to continue working.</p>
      <AppErrorAlert
        error={error}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          restoreMutation.reset();
          dismissMutation.reset();
        }}
      />
      <Button
        variant="primary"
        disabled={pending}
        onClick={() => {
          startInteraction();
          restoreMutation.mutate({ variant_id: variantId });
        }}
      >
        {restoreMutation.isPending ? 'Restoring answers…' : 'Restore answers'}
      </Button>
    </Alert>
  );
}

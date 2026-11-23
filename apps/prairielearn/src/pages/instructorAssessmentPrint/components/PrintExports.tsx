import { skipToken, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { filesize } from 'filesize';
import { parseAsString, useQueryState } from 'nuqs';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { PrintExportsError } from '../../../trpc/assessment/print-exports.js';

/** Tracks the user's recent exports and the export most recently started on this page. */
export function usePrintExports({
  onAutomaticExportFinished,
}: {
  onAutomaticExportFinished: (
    id: string,
    succeeded: boolean,
    failureMessage: string | null,
  ) => void;
}) {
  const trpc = useTRPC();
  const [exportId, setExportId] = useQueryState('export', parseAsString);
  const [automaticExportIds, setAutomaticExportIds] = useState<string[]>([]);
  const [recentExportsOpen, setRecentExportsOpen] = useState(false);
  const recentExports = useQuery(
    trpc.printExports.list.queryOptions(undefined, {
      // Automatic downloads read their status from this list, so keep polling until each
      // one appears finished, even if a refresh failed before it was listed.
      refetchInterval: (query) =>
        query.state.data?.some((item) => item.status === 'pending') ||
        automaticExportIds.some(
          (id) => !query.state.data?.some((item) => item.id === id && item.status !== 'pending'),
        )
          ? 2_000
          : false,
    }),
  );
  const listedExport = recentExports.data?.find((item) => item.id === exportId);
  const exportStatus = useQuery(
    trpc.printExports.status.queryOptions(
      exportId === null || listedExport ? skipToken : { printExportId: exportId },
      {
        refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2_000 : false),
        retry: (failureCount, error) =>
          failureCount < 3 &&
          !(error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND'),
      },
    ),
  );
  const displayedExport = listedExport ?? exportStatus.data;

  function receiveExport({ printExportId }: { printExportId: string }) {
    void setExportId(printExportId);
    setAutomaticExportIds((ids) => [...ids, printExportId]);
    setRecentExportsOpen(true);
    return recentExports.refetch();
  }

  function finishAutomaticExport(id: string, succeeded: boolean, failureMessage: string | null) {
    onAutomaticExportFinished(id, succeeded, failureMessage);
    setAutomaticExportIds((ids) => ids.filter((value) => value !== id));
  }

  return {
    exportId,
    setExportId,
    recentExports,
    recentExportsOpen,
    setRecentExportsOpen,
    listedExport,
    exportStatus,
    displayedExport,
    automaticExportIds,
    receiveExport,
    finishAutomaticExport,
  };
}

type RecentExport = NonNullable<
  ReturnType<typeof usePrintExports>['recentExports']['data']
>[number];

function AutomaticExportDownload({
  printExportId,
  printExport,
  onFinished,
}: {
  printExportId: string;
  printExport: RecentExport | undefined;
  onFinished: (id: string, succeeded: boolean, failureMessage: string | null) => void;
}) {
  const completedRef = useRef(false);
  useEffect(() => {
    // A newly queued export starts one download when its background job succeeds. The
    // recent exports list polls while it is pending, so this reads its status from there.
    if (!printExport || printExport.status === 'pending' || completedRef.current) return;
    completedRef.current = true;
    if (printExport.status === 'succeeded' && printExport.downloadUrl) {
      const link = window.document.createElement('a');
      link.href = printExport.downloadUrl;
      // Downloading instead of navigating keeps the page's unsaved-cover warning from firing.
      link.download = '';
      onFinished(printExportId, true, null);
      link.click();
    } else {
      onFinished(printExportId, false, printExport.failureMessage);
    }
  }, [printExport, onFinished, printExportId]);
  return null;
}

export function AutomaticExportDownloads({
  exports,
}: {
  exports: ReturnType<typeof usePrintExports>;
}) {
  return exports.automaticExportIds.map((id) => (
    <AutomaticExportDownload
      key={id}
      printExportId={id}
      printExport={exports.recentExports.data?.find((item) => item.id === id)}
      onFinished={exports.finishAutomaticExport}
    />
  ));
}

export function PrintExports({
  exports,
  displayTimezone,
  detailsRef,
  onDismiss,
}: {
  exports: ReturnType<typeof usePrintExports>;
  displayTimezone: string;
  detailsRef: RefObject<HTMLDetailsElement | null>;
  onDismiss: () => void;
}) {
  const { exportId, setExportId, recentExports, listedExport, exportStatus } = exports;
  return (
    <>
      <AppErrorAlert
        error={getAppError<PrintExportsError['list']>(recentExports.error)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {recentExports.data && recentExports.data.length > 0 && (
        <section aria-label="Recent exports" className="mb-3">
          <Card>
            <Card.Body>
              <details
                ref={detailsRef}
                open={exports.recentExportsOpen}
                onToggle={(event) => exports.setRecentExportsOpen(event.currentTarget.open)}
              >
                <summary className="h6 mb-0">Recent exports ({recentExports.data.length})</summary>
                <p className="small text-muted mt-2 mb-2">
                  Files are available here for up to 24 hours after you request them.
                </p>
                <ol className="mb-0 ps-3">
                  {recentExports.data.map((item) => (
                    <li key={item.id} className="mb-2">
                      {item.status === 'succeeded' ? (
                        <a href={item.downloadUrl ?? undefined} download>
                          Download {item.label}
                          {item.sizeBytes !== null &&
                            ` (${filesize(item.sizeBytes, { base: 10, round: 1 })})`}
                        </a>
                      ) : (
                        <span>{item.label}</span>
                      )}
                      <span className="small text-muted ms-2">
                        <FriendlyDate date={item.createdAt} timezone={displayTimezone} />
                      </span>
                      {item.status === 'pending' && (
                        <span className="small text-muted ms-2">Preparing…</span>
                      )}
                      {item.status === 'failed' && (
                        <span className="small text-danger ms-2">
                          {item.failureMessage ?? 'The file could not be prepared.'}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </Card.Body>
          </Card>
        </section>
      )}
      {exportId && !listedExport && !recentExports.isPending && (
        <Alert
          variant={
            exportStatus.data?.status === 'failed' || exportStatus.isError ? 'danger' : 'info'
          }
          role={
            exportStatus.isPending || exportStatus.data?.status === 'pending' ? 'status' : 'alert'
          }
        >
          {exportStatus.data?.status === 'succeeded' ? (
            <a href={exportStatus.data.downloadUrl ?? undefined} download>
              Download {exportStatus.data.label}
              {exportStatus.data.sizeBytes !== null &&
                ` (${filesize(exportStatus.data.sizeBytes, { base: 10, round: 1 })})`}
            </a>
          ) : exportStatus.data?.status === 'failed' ? (
            (exportStatus.data.failureMessage ??
            'The file could not be prepared. Try again or contact support if it keeps failing.')
          ) : exportStatus.isError ? (
            'Could not check whether the file is ready. Refresh the page to try again.'
          ) : exportStatus.data?.status === 'expired' ? (
            'This file is no longer available. Start a new download.'
          ) : (
            'Preparing your file. You can return to this page to download it within 24 hours.'
          )}
          {exportStatus.data?.status !== 'pending' && !exportStatus.isPending && (
            <Button
              variant="link"
              size="sm"
              className="ms-2 p-0"
              onClick={() => {
                void setExportId(null);
                onDismiss();
              }}
            >
              Dismiss
            </Button>
          )}
        </Alert>
      )}
    </>
  );
}

import {
  QueryClient,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { parseAsString, useQueryState } from 'nuqs';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Dropdown,
  Form,
  Modal,
  Spinner,
} from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { getAppError, renderAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { NuqsAdapter, OverlayTrigger } from '@prairielearn/ui';
import { IdSchema } from '@prairielearn/zod';

import { PrintIdentityFieldsTextSchema } from '../../lib/client/printing/print-cover.js';
import {
  nextPrintFormLabel,
  printFormLabelBase,
} from '../../lib/client/printing/print-form-label.js';
import { MAX_ACTIVE_PRINT_FORMS } from '../../lib/client/printing/print-form-limits.js';
import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PACKET_PAGES,
  countPrintSnapshotPages,
} from '../../lib/client/printing/print-packet.js';
import { printLayoutSearch } from '../../lib/client/printing/print-preparation.js';
import {
  type PrintSnapshot,
  STALE_PRINT_SNAPSHOT_MESSAGE,
  capturePrintSnapshot,
  renderPrintSnapshot,
} from '../../lib/client/printing/print-snapshot.js';
import type { StaffPrintPreparationForm } from '../../lib/client/safe-db-types.js';
import { getPrintFormUrl, getQuestionUrl } from '../../lib/client/url.js';
import type { PrintDocument } from '../../lib/printing/index.js';
import {
  DEFAULT_PRINT_SETTINGS,
  PRINT_QUESTION_SELECTION_LOCKED_MESSAGE,
  type PrintSettings,
} from '../../lib/printing/print-settings.js';
import type { QuestionBlockSize } from '../../lib/printing/question-block-size.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';
import type { PrintExportsError } from '../../trpc/assessment/print-exports.js';
import type { PrintFormsError } from '../../trpc/assessment/print-forms.js';

import { CombinedPdfDownloadModal } from './components/CombinedPdfDownloadModal.js';
import {
  AutomaticExportDownloads,
  PrintExports,
  usePrintExports,
} from './components/PrintExports.js';
import { type PreviewState, PrintPreview } from './components/PrintPreview.js';

const BLOCK_SIZE_LABELS: Record<QuestionBlockSize, string> = {
  auto: 'Fit to content',
  third: 'One third of a page',
  half: 'Half a page',
  full: 'A full page',
};

const MAX_CACHED_PREVIEWS = 3;
const COVER_SIZE_LIMIT = filesize(MAX_COVER_BYTES, { base: 10 });

interface CachedPreview {
  key: string;
  url: string;
  document: PrintDocument;
  state: Extract<PreviewState, { status: 'ready' }>;
  lastUsed: number;
}

interface PendingPaperSizeChange {
  paperSize: PrintSettings['paperSize'];
  sourceFormId: string;
  expectedForms: { id: string; paperSize: PrintSettings['paperSize']; locked: boolean }[];
  versionedForms: { previousLabel: string; nextLabel: string }[];
}

interface PrintPreparationProps {
  assessmentId: string;
  courseInstanceId: string;
  displayTimezone: string;
  hasRandomization: boolean;
  groupWork: boolean;
  canEditPrintForms: boolean;
  requireHonorCode: boolean;
  forms: StaffPrintPreparationForm[];
  enrolledStudents: number;
  trpcCsrfToken: string;
  docxCsrfToken: string;
  search: string;
}

export function InstructorAssessmentPrint(props: PrintPreparationProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: props.trpcCsrfToken,
      courseInstanceId: props.courseInstanceId,
      assessmentId: props.assessmentId,
    }),
  );
  return (
    <NuqsAdapter search={props.search}>
      <QueryClientProviderDebug client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <PrintPreparation {...props} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}
InstructorAssessmentPrint.displayName = 'InstructorAssessmentPrint';

function PreviewFrame({
  cacheKey,
  url,
  document,
  active,
  selectedQuestion,
  onStateChange,
  onSnapshotReady,
}: {
  cacheKey: string;
  url: string;
  document: PrintDocument;
  active: boolean;
  selectedQuestion: { number: string } | null;
  onStateChange: (key: string, url: string, document: PrintDocument, state: PreviewState) => void;
  onSnapshotReady: (key: string, url: string, snapshot: PrintSnapshot, doc: Document) => void;
}) {
  const handleStateChange = useCallback(
    (state: PreviewState) => onStateChange(cacheKey, url, document, state),
    [cacheKey, url, document, onStateChange],
  );
  const handleSnapshotReady = useCallback(
    (snapshot: PrintSnapshot, doc: Document) => onSnapshotReady(cacheKey, url, snapshot, doc),
    [cacheKey, url, onSnapshotReady],
  );

  return (
    <PrintPreview
      url={url}
      document={document}
      paperWidth={new URLSearchParams(url.split('?')[1]).get('paper_size') === 'Letter' ? 816 : 794}
      active={active}
      selectedQuestion={selectedQuestion}
      onStateChange={handleStateChange}
      onSnapshotReady={handleSnapshotReady}
    />
  );
}

function PrintPreparation({
  assessmentId,
  courseInstanceId,
  displayTimezone,
  hasRandomization,
  groupWork,
  canEditPrintForms,
  requireHonorCode,
  forms: initialForms,
  enrolledStudents,
  docxCsrfToken,
}: PrintPreparationProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const forms = useQuery(
    trpc.printForms.list.queryOptions(undefined, {
      initialData: initialForms,
      refetchOnMount: false,
    }),
  );
  const [selectedForm, setSelectedForm] = useQueryState('form', parseAsString);
  const activeForms = forms.data
    .filter((form) => form.archived_at === null)
    .sort((left, right) => {
      const leftBase = printFormLabelBase(left.label);
      const rightBase = printFormLabelBase(right.label);
      return leftBase.length - rightBase.length || leftBase.localeCompare(rightBase);
    });
  const mixedPaperSizes = new Set(activeForms.map((form) => form.settings.paperSize)).size > 1;
  const archivedForms = forms.data.filter((form) => form.archived_at !== null);
  const formIds = activeForms.map((form) => form.id);
  const selectedArchivedForm = archivedForms.find((form) => form.id === selectedForm);
  const formId =
    selectedForm && (formIds.includes(selectedForm) || selectedArchivedForm)
      ? selectedForm
      : (formIds.at(0) ?? null);
  const archivedPreviewForm = archivedForms.find((form) => form.id === formId);
  function formLabel(id: string) {
    const form = forms.data.find((item) => item.id === id);
    if (!form) throw new Error('This print form is not available.');
    return form.label;
  }
  const [coverPages, setCoverPages] = useState<{ id: string; file: File }[]>([]);
  const completedCoverIdsRef = useRef(new Set<string>());
  const exportCoverIdsRef = useRef(new Map<string, string[]>());
  const exportFormIdsRef = useRef(new Map<string, string[]>());
  const coversAwaitingDownload = coverPages.some(({ id }) => !completedCoverIdsRef.current.has(id));
  useEffect(() => {
    // Uploaded PDFs live only in this tab until a student-copy PDF includes them.
    if (!coversAwaitingDownload) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (coverPages.every(({ id }) => completedCoverIdsRef.current.has(id))) return;
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- Required for older browsers.
      event.returnValue = 'prompt';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [coverPages, coversAwaitingDownload]);
  const [combinedDownload, setCombinedDownload] = useState<{
    document: PrintDocument;
    formIds: string[];
    settingsKey: string;
    coverPageIds: string[];
    pageCount: number | null;
    preparing: boolean;
    progress: { completed: number; total: number } | null;
    failure: { message: string; printFormId?: string; formLabel?: string } | null;
  } | null>(null);
  const combinedRequestRef = useRef(0);
  const [combinedSubmitting, setCombinedSubmitting] = useState(false);
  const combinedReturnFocusRef = useRef<'menu' | 'recent' | { formId: string }>('menu');
  const [pendingFormAction, setPendingFormAction] = useState<
    | { action: 'regenerate' | 'archive'; id: string; label: string }
    | {
        action: 'reviseSelection';
        id: string;
        label: string;
        questionNumber: string;
        included: boolean;
      }
    | null
  >(null);
  const pendingRegenerateLocked =
    pendingFormAction?.action === 'regenerate' &&
    forms.data.some(
      (form) => form.id === pendingFormAction.id && form.question_selection_locked_at !== null,
    );
  const [pendingPaperSizeChange, setPendingPaperSizeChange] =
    useState<PendingPaperSizeChange | null>(null);
  const [paperSizeApplying, setPaperSizeApplying] = useState(false);
  const [paperSizeRefreshFailed, setPaperSizeRefreshFailed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const validForm = forms.data.some((form) => form.id === formId);
  const [document, setDocument] = useState<PrintDocument>('assessment');
  const defaultSettings = { ...DEFAULT_PRINT_SETTINGS, includeHonorCode: requireHonorCode };
  const currentForm = forms.data.find((form) => form.id === formId);
  const settings = currentForm?.settings ?? defaultSettings;
  const questionSelectionLocked = currentForm?.question_selection_locked_at != null;
  const [selectedQuestion, setSelectedQuestion] = useState<{ number: string } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [dismissedReviewWarning, setDismissedReviewWarning] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; state: PreviewState } | null>(null);
  const [cachedPreviews, setCachedPreviews] = useState<CachedPreview[]>([]);
  const previewUseCountRef = useRef(0);
  const [previewVersions, setPreviewVersions] = useState<Record<string, number>>({});
  const [previewPending, setPreviewPending] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState(false);
  const [pdfPreparationProgress, setPdfPreparationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [pdfPreparationError, setPdfPreparationError] = useState<Error | null>(null);
  const snapshotsRef = useRef(new Map<string, PrintSnapshot>());
  const previewGenerationRef = useRef(new Map<string, number>());
  const previewDocumentRef = useRef<{ url: string; doc: Document } | null>(null);
  const [staleFormIds, setStaleFormIds] = useState<ReadonlySet<string>>(() => new Set());
  const staleFormIdsRef = useRef(new Set<string>());
  const stalePreviewRefreshesRef = useRef(new Map<string, string>());
  const snapshotStale = formId !== null && staleFormIds.has(formId);
  const downloadMenuButtonRef = useRef<HTMLButtonElement>(null);
  const prepareStatusRef = useRef<HTMLDivElement>(null);
  const applyPreviewButtonRef = useRef<HTMLButtonElement>(null);
  const settingFocusRef = useRef<HTMLElement | null>(null);
  const printHeadingRef = useRef<HTMLHeadingElement>(null);
  const recentExportsRef = useRef<HTMLDetailsElement>(null);
  const nextFormFocusRef = useRef<string | null>(null);
  const formToFocusRef = useRef<{ id: string; waitForSelection: boolean } | null>(null);
  const [formFocusRequest, setFormFocusRequest] = useState(0);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    trigger,
    formState: { dirtyFields, errors, isDirty, isSubmitting },
  } = useForm<PrintSettings>({
    defaultValues: settings,
    values: settings,
    // A shared form can refresh while this instructor is editing it.
    resetOptions: { keepDirtyValues: true },
  });
  const includeCoverPage = settings.includeCoverPage;
  const questionSizes = watch('questionSizes');
  const excludedQuestions = watch('excludedQuestions');
  const excludedQuestionNumbers = new Set(excludedQuestions);
  const layout = printLayoutSearch(settings);
  const printBase = formId
    ? getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: formId })
    : '';
  const savedPreviewUrl = `${printBase}/preview?${layout}&document=${document}`;
  const [previewUrl, setPreviewUrl] = useState(savedPreviewUrl);
  const previewSelectionRef = useRef({ formId, document });
  useEffect(() => {
    // Switching forms or documents loads that selection; saving settings waits for Update preview.
    if (
      previewSelectionRef.current.formId === formId &&
      previewSelectionRef.current.document === document
    ) {
      return;
    }
    previewSelectionRef.current = { formId, document };
    // oxlint-disable-next-line react-you-might-not-need-an-effect/no-derived-state
    setPreviewUrl(savedPreviewUrl);
  }, [formId, document, savedPreviewUrl]);
  const previewIsCurrent = previewUrl === savedPreviewUrl;
  const activePreviewKey = `${previewUrl}:${previewVersions[previewUrl] ?? 0}`;
  const previewsToRender = cachedPreviews.some((entry) => entry.key === activePreviewKey)
    ? cachedPreviews
    : [...cachedPreviews, { key: activePreviewKey, url: previewUrl, document }];
  const questions = useQuery(
    trpc.printForms.questions.queryOptions(
      validForm && formId ? { printFormId: formId } : skipToken,
    ),
  );
  const create = useMutation(
    trpc.printForms.create.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const ensureInitial = useMutation(
    trpc.printForms.ensureInitial.mutationOptions({
      onSuccess: async () => await forms.refetch(),
    }),
  );
  const initialFormRequestedRef = useRef(false);
  const ensureInitialMutate = ensureInitial.mutate;
  useEffect(() => {
    // The first editor visit creates the A slot; the server handles concurrent visits.
    if (
      !canEditPrintForms ||
      groupWork ||
      activeForms.length > 0 ||
      forms.isError ||
      initialFormRequestedRef.current
    ) {
      return;
    }
    initialFormRequestedRef.current = true;
    ensureInitialMutate();
  }, [activeForms.length, canEditPrintForms, forms.isError, groupWork, ensureInitialMutate]);
  useEffect(() => {
    // Keep the URL on the form actually shown, while preserving valid form deep links.
    if (formId && formId !== selectedForm) void setSelectedForm(formId);
  }, [formId, selectedForm, setSelectedForm]);
  const regenerate = useMutation(
    trpc.printForms.regenerate.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const reviseSelection = useMutation(
    trpc.printForms.reviseSelection.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const archive = useMutation(
    trpc.printForms.archive.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const updateSettings = useMutation(
    trpc.printForms.updateSettings.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const setPaperSize = useMutation(trpc.printForms.setPaperSize.mutationOptions());
  useEffect(() => {
    // Auto-save temporarily disables the editor; return keyboard focus once it finishes.
    if (updateSettings.isPending || paperSizeApplying || !settingFocusRef.current) return;
    const target = settingFocusRef.current;
    settingFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (target.isConnected && window.document.activeElement === window.document.body) {
        target.focus();
      }
    });
  }, [updateSettings.isPending, paperSizeApplying]);
  const packet = useMutation(trpc.printExports.pdf.mutationOptions());
  const preflight = useMutation(trpc.printExports.preflight.mutationOptions());
  const printExports = usePrintExports({ onAutomaticExportFinished: finishAutomaticExport });
  const { exportId, setExportId, displayedExport } = printExports;
  const busy =
    ensureInitial.isPending ||
    create.isPending ||
    regenerate.isPending ||
    reviseSelection.isPending ||
    archive.isPending ||
    updateSettings.isPending ||
    paperSizeApplying ||
    paperSizeRefreshFailed ||
    packet.isPending ||
    preparingPdf ||
    previewPending;
  const formActionPending = regenerate.isPending || reviseSelection.isPending || archive.isPending;

  function focusAfterDismiss(target: 'link' | 'summary' = 'link') {
    window.requestAnimationFrame(() => {
      const details = recentExportsRef.current;
      const link =
        target === 'link' && details?.open
          ? details.querySelector<HTMLAnchorElement>('a[href*="/exports/"]')
          : null;
      (link ?? details?.querySelector('summary') ?? printHeadingRef.current)?.focus();
    });
  }

  function focusPrepareStatus() {
    window.requestAnimationFrame(() => prepareStatusRef.current?.focus());
  }

  function requestFormFocus(id: string, waitForSelection = false) {
    formToFocusRef.current = { id, waitForSelection };
    setFormFocusRequest((request) => request + 1);
  }

  function closeFormAction() {
    if (formActionPending) return;
    nextFormFocusRef.current = pendingFormAction?.id ?? null;
    setPendingFormAction(null);
  }

  function markStaleSnapshot(error: unknown, ids: string[]) {
    if (error instanceof Error && error.message.includes(STALE_PRINT_SNAPSHOT_MESSAGE)) {
      for (const id of ids) {
        discardFormCachedPreviews(id);
        staleFormIdsRef.current.add(id);
        stalePreviewRefreshesRef.current.delete(id);
      }
      setStaleFormIds(new Set(staleFormIdsRef.current));
      // Exports use saved settings, so another tab's save also makes previews stale.
      void forms.refetch();
    }
  }

  function settingsForForm(id: string): PrintSettings {
    const form = forms.data.find((item) => item.id === id);
    if (!form) throw new Error('This print form is not available.');
    return form.settings;
  }

  function packetMetadata(ids: string[], outputDocument: PrintDocument) {
    return {
      forms: ids.map((id) => ({ printFormId: id })),
      document: outputDocument,
    };
  }

  async function snapshotFor(
    id: string,
    label: string,
    appliedSettings: PrintSettings,
    printDocument: PrintDocument,
  ) {
    const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
    const url = `${base}/preview?${printLayoutSearch(appliedSettings)}&document=${printDocument}`;
    const generation = previewGenerationRef.current.get(id) ?? 0;
    const cached = snapshotsRef.current.get(url);
    if (cached) return cached;
    let snapshot: PrintSnapshot;
    try {
      snapshot = await renderPrintSnapshot(url);
    } catch (error) {
      throw new Error(
        `Form ${label}: ${error instanceof Error ? error.message : 'The preview could not be prepared.'}`,
        {
          cause: error,
        },
      );
    }
    if ((previewGenerationRef.current.get(id) ?? 0) === generation) {
      snapshotsRef.current.set(url, snapshot);
    }
    return snapshot;
  }

  async function packetInput(metadata: ReturnType<typeof packetMetadata>) {
    const input = new FormData();
    input.set('metadata', JSON.stringify(metadata));
    if (metadata.document !== 'answer_key') {
      for (const { file } of coverPages) input.append('coverPages', file);
    }
    const snapshotRequests = metadata.forms;
    setPdfPreparationProgress({ completed: 0, total: snapshotRequests.length });
    // Forms render one at a time so one export doesn't hold several shared render slots.
    for (const [index, form] of snapshotRequests.entries()) {
      const snapshot = await snapshotFor(
        form.printFormId,
        formLabel(form.printFormId),
        settingsForForm(form.printFormId),
        metadata.document,
      );
      input.append(
        'pages',
        new File([snapshot.html], `form-${formLabel(form.printFormId)}-${metadata.document}.html`),
      );
      input.append('snapshotIds', snapshot.id);
      setPdfPreparationProgress({ completed: index + 1, total: snapshotRequests.length });
    }
    return input;
  }

  async function preparePdfInput(metadata: ReturnType<typeof packetMetadata>) {
    setPdfPreparationError(null);
    setPdfPreparationProgress(null);
    setPreparingPdf(true);
    try {
      return await packetInput(metadata);
    } catch (error) {
      setPdfPreparationError(
        error instanceof Error ? error : new Error('The printable pages could not be prepared.'),
      );
      throw error;
    } finally {
      setPreparingPdf(false);
      setPdfPreparationProgress(null);
    }
  }

  function receiveExport(
    result: { printExportId: string },
    formIds: string[],
    includedCoverIds: string[] = [],
  ) {
    exportFormIdsRef.current.set(result.printExportId, formIds);
    if (includedCoverIds.length > 0) {
      exportCoverIdsRef.current.set(result.printExportId, includedCoverIds);
    }
    // Starting an export locks the forms' question selections.
    void forms.refetch();
    return printExports.receiveExport(result);
  }

  function finishAutomaticExport(id: string, succeeded: boolean, failureMessage: string | null) {
    if (succeeded) {
      for (const coverId of exportCoverIdsRef.current.get(id) ?? []) {
        completedCoverIdsRef.current.add(coverId);
      }
    } else if (failureMessage) {
      markStaleSnapshot(new Error(failureMessage), exportFormIdsRef.current.get(id) ?? []);
    }
    exportCoverIdsRef.current.delete(id);
    exportFormIdsRef.current.delete(id);
  }

  async function downloadPacket(ids: string[], outputDocument: PrintDocument) {
    download.reset();
    packet.reset();
    const includedCoverIds = outputDocument === 'assessment' ? coverPages.map(({ id }) => id) : [];
    try {
      const result = await packet.mutateAsync(
        await preparePdfInput(packetMetadata(ids, outputDocument)),
      );
      await receiveExport(result, ids, includedCoverIds);
    } catch (error) {
      markStaleSnapshot(error, ids);
      throw error;
    }
  }

  function closeCombinedDownload(
    returnFocus: 'menu' | 'recent' | { formId: string } = 'menu',
    afterSuccess = false,
  ) {
    if (!afterSuccess && (packet.isPending || preparingPdf || combinedSubmitting)) return;
    combinedRequestRef.current += 1;
    combinedReturnFocusRef.current = returnFocus;
    setCombinedDownload(null);
    preflight.reset();
    packet.reset();
    setPdfPreparationError(null);
  }

  async function openCombinedDownload(outputDocument: PrintDocument) {
    const ids = [...formIds];
    const selectedForms = ids.map((id) => ({
      id,
      label: formLabel(id),
      settings: settingsForForm(id),
    }));
    const settingsKey = JSON.stringify(selectedForms.map((form) => form.settings));
    const request = ++combinedRequestRef.current;
    preflight.reset();
    packet.reset();
    setPdfPreparationError(null);
    setCombinedDownload({
      document: outputDocument,
      formIds: ids,
      settingsKey,
      coverPageIds: coverPages.map(({ id }) => id),
      pageCount: null,
      preparing: true,
      progress: null,
      failure: null,
    });
    const input = new FormData();
    input.set('formIds', JSON.stringify(ids));
    input.set('document', outputDocument);
    if (outputDocument === 'assessment') {
      for (const { file } of coverPages) input.append('coverPages', file);
    }
    try {
      const result = await preflight.mutateAsync(input);
      if (request !== combinedRequestRef.current) return;
      if (result.failure) {
        setCombinedDownload(
          (current) => current && { ...current, preparing: false, failure: result.failure },
        );
        return;
      }
      const pageCounts: number[] = [];
      setCombinedDownload(
        (current) => current && { ...current, progress: { completed: 0, total: ids.length } },
      );
      for (const [index, form] of selectedForms.entries()) {
        let snapshot: PrintSnapshot;
        try {
          snapshot = await snapshotFor(form.id, form.label, form.settings, outputDocument);
        } catch (error) {
          if (request !== combinedRequestRef.current) return;
          setCombinedDownload(
            (current) =>
              current && {
                ...current,
                preparing: false,
                progress: null,
                failure: {
                  printFormId: form.id,
                  formLabel: form.label,
                  message:
                    error instanceof Error
                      ? error.message
                      : `Form ${form.label} could not be prepared.`,
                },
              },
          );
          return;
        }
        if (request !== combinedRequestRef.current) return;
        pageCounts.push(countPrintSnapshotPages(snapshot.html));
        setCombinedDownload(
          (current) =>
            current && { ...current, progress: { completed: index + 1, total: ids.length } },
        );
      }
      const pageCount = Math.max(...pageCounts) + result.coverPageCount;
      setCombinedDownload(
        (current) =>
          current && {
            ...current,
            preparing: false,
            progress: null,
            pageCount: pageCount * ids.length <= MAX_PACKET_PAGES ? pageCount : null,
            failure:
              pageCount * ids.length > MAX_PACKET_PAGES
                ? {
                    message: `This export would exceed ${MAX_PACKET_PAGES.toLocaleString('en-US')} pages. Download fewer forms.`,
                  }
                : null,
          },
      );
    } catch (error) {
      if (request !== combinedRequestRef.current) return;
      setCombinedDownload(
        (current) =>
          current && {
            ...current,
            preparing: false,
            progress: null,
            failure:
              error instanceof TRPCClientError
                ? null
                : {
                    message:
                      error instanceof Error ? error.message : 'The forms could not be checked.',
                  },
          },
      );
    }
  }

  async function downloadCombined() {
    if (!combinedDownload || combinedSubmitting || combinedDownload.pageCount === null) return;
    if (
      JSON.stringify(formIds) !== JSON.stringify(combinedDownload.formIds) ||
      JSON.stringify(combinedDownload.formIds.map((id) => settingsForForm(id))) !==
        combinedDownload.settingsKey ||
      JSON.stringify(coverPages.map(({ id }) => id)) !==
        JSON.stringify(combinedDownload.coverPageIds)
    ) {
      await openCombinedDownload(combinedDownload.document);
      return;
    }
    setCombinedSubmitting(true);
    try {
      await downloadPacket(combinedDownload.formIds, combinedDownload.document);
      closeCombinedDownload('recent', true);
    } catch {
      // The modal shows the export error and keeps its download button available for retry.
    } finally {
      setCombinedSubmitting(false);
    }
  }

  function reuseCachedPreview(url: string) {
    const key = `${url}:${previewVersions[url] ?? 0}`;
    const lastUsed = ++previewUseCountRef.current;
    setCachedPreviews((entries) => {
      if (!entries.some((entry) => entry.key === key)) return entries;
      return entries.map((entry) => (entry.key === key ? { ...entry, lastUsed } : entry));
    });
  }

  function discardFormCachedPreviews(id: string) {
    const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
    const prefix = `${base}/preview?`;
    previewGenerationRef.current.set(id, (previewGenerationRef.current.get(id) ?? 0) + 1);
    for (const url of snapshotsRef.current.keys()) {
      if (url.startsWith(prefix)) snapshotsRef.current.delete(url);
    }
    if (previewDocumentRef.current?.url.startsWith(prefix)) previewDocumentRef.current = null;
    setCachedPreviews((entries) => entries.filter((entry) => !entry.url.startsWith(prefix)));
  }

  function invalidateFormPreview(id: string, nextSettings: PrintSettings) {
    const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
    const nextUrl = `${base}/preview?${printLayoutSearch(nextSettings)}&document=${document}`;
    const nextVersion = (previewVersions[nextUrl] ?? 0) + 1;
    discardFormCachedPreviews(id);
    setPreviewVersions((versions) => ({
      ...versions,
      [nextUrl]: nextVersion,
    }));
    return { url: nextUrl, key: `${nextUrl}:${nextVersion}` };
  }

  function switchDocument(next: PrintDocument) {
    if (next === document) return;
    const nextUrl = `${printBase}/preview?${layout}&document=${next}`;
    reuseCachedPreview(nextUrl);
    previewSelectionRef.current = { formId, document: next };
    setPreviewUrl(nextUrl);
    setDocument(next);
    setPreview(null);
  }

  function switchForm(id: string, nextSettings?: PrintSettings) {
    if (id === formId && !nextSettings) return;

    void setSelectedForm(id);
    const next =
      nextSettings ?? forms.data.find((form) => form.id === id)?.settings ?? defaultSettings;
    const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
    const nextUrl = `${base}/preview?${printLayoutSearch(next)}&document=${document}`;
    reuseCachedPreview(nextUrl);
    previewSelectionRef.current = { formId: id, document };
    setPreviewUrl(nextUrl);
    reset(next, { keepDirtyValues: false });
    setSelectedQuestion(null);
    setDismissedReviewWarning(null);
    setPreview(null);
  }

  async function addForm() {
    const result = await create.mutateAsync({ settings, sourcePrintFormId: formId ?? undefined });
    switchForm(result.printFormId, result.settings);
    requestFormFocus(result.printFormId, true);
  }

  async function regenerateForm(id: string) {
    const result = await regenerate.mutateAsync({ printFormId: id });
    if (result.printFormId === id) {
      invalidateFormPreview(id, result.settings);
      await queryClient.invalidateQueries(
        trpc.printForms.questions.queryFilter({ printFormId: id }),
      );
    }
    switchForm(result.printFormId, result.settings);
    return result.printFormId;
  }

  async function reviseFormSelection(id: string, questionNumber: string, included: boolean) {
    const result = await reviseSelection.mutateAsync({ printFormId: id, questionNumber, included });
    switchForm(result.printFormId, result.settings);
    return result.printFormId;
  }

  async function archiveForm(id: string) {
    await archive.mutateAsync({ printFormId: id });
    const archivedIndex = formIds.indexOf(id);
    const nextIds = formIds.filter((value) => value !== id);
    const nextId =
      nextIds.at(archivedIndex) ??
      nextIds.at(archivedIndex - 1) ??
      activeForms.find((form) => form.id !== id)?.id ??
      null;
    if (id === formId) {
      if (nextId) switchForm(nextId);
      else void setSelectedForm(null);
    }
    return nextId;
  }
  const download = useMutation({
    mutationFn: async ({ id, printDocument }: { id: string; printDocument: PrintDocument }) => {
      const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
      const appliedSettings = settingsForForm(id);
      const search = printLayoutSearch(appliedSettings);
      const url = `${base}/preview?${search}&document=${printDocument}`;
      const livePreview = previewDocumentRef.current;
      const snapshot =
        snapshotsRef.current.get(url) ??
        (livePreview?.url === url && livePreview.doc.documentElement.dataset.printStatus === 'ready'
          ? capturePrintSnapshot(livePreview.doc)
          : await renderPrintSnapshot(url));
      snapshotsRef.current.set(url, snapshot);
      const headers = new Headers({
        Accept: 'application/json',
        'X-CSRF-Token': docxCsrfToken,
        'Content-Type': 'application/octet-stream',
      });
      const response = await fetch(`${base}/docx?document=${printDocument}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) {
        if (response.status === 400) {
          const { error } = z.object({ error: z.string() }).parse(await response.json());
          throw new Error(error);
        }
        throw new Error('The download could not be generated. Review the preview and try again.');
      }
      void receiveExport(z.object({ printExportId: IdSchema }).parse(await response.json()), [id]);
    },
    onError: (error: Error, { id }) => markStaleSnapshot(error, [id]),
  });

  function startWordExport(id: string, printDocument: PrintDocument) {
    packet.reset();
    setPdfPreparationError(null);
    focusPrepareStatus();
    download.mutate({ id, printDocument });
  }
  const controlsBusy = isSubmitting || busy || download.isPending;
  // Form actions can finish before the target button is enabled, so focus it once ready.
  useEffect(() => {
    const request = formToFocusRef.current;
    if (
      !request ||
      (request.waitForSelection && request.id !== formId) ||
      controlsBusy ||
      isDirty
    ) {
      return;
    }
    const button = window.document.getElementById(`print-form-${request.id}`);
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    button.focus();
    formToFocusRef.current = null;
  }, [formId, controlsBusy, isDirty, forms.data, formFocusRequest]);
  const preparingExport = download.isPending || packet.isPending || preparingPdf;
  const onPreviewState = useCallback(
    (key: string, url: string, previewDocument: PrintDocument, state: PreviewState) => {
      if (key !== activePreviewKey) return;
      setPreview({ key, state });
      const refreshingStalePreview =
        formId !== null && stalePreviewRefreshesRef.current.get(formId) === key;
      if (
        state.status === 'ready' &&
        (formId === null || !staleFormIdsRef.current.has(formId) || refreshingStalePreview)
      ) {
        const lastUsed = ++previewUseCountRef.current;
        setCachedPreviews((entries) => {
          const next = { key, url, document: previewDocument, state, lastUsed };
          if (entries.some((entry) => entry.key === key)) {
            return entries.map((entry) => (entry.key === key ? next : entry));
          }
          if (entries.length < MAX_CACHED_PREVIEWS) return [...entries, next];
          const oldest = entries.reduce(
            (index, entry, current) => (entry.lastUsed < entries[index].lastUsed ? current : index),
            0,
          );
          return [...entries.slice(0, oldest), ...entries.slice(oldest + 1), next];
        });
      }
      if (refreshingStalePreview && formId && state.status !== 'loading') {
        stalePreviewRefreshesRef.current.delete(formId);
        if (state.status === 'ready') {
          staleFormIdsRef.current.delete(formId);
          setStaleFormIds(new Set(staleFormIdsRef.current));
        }
      }
      if (state.status !== 'loading') setPreviewPending(false);
    },
    [activePreviewKey, formId],
  );
  const onSnapshotReady = useCallback(
    (key: string, url: string, snapshot: PrintSnapshot, doc: Document) => {
      if (key !== activePreviewKey) return;
      if (
        formId !== null &&
        staleFormIdsRef.current.has(formId) &&
        stalePreviewRefreshesRef.current.get(formId) !== key
      ) {
        return;
      }
      snapshotsRef.current.set(url, snapshot);
      previewDocumentRef.current = { url, doc };
    },
    [activePreviewKey, formId],
  );
  const loadedPreview =
    cachedPreviews.find((entry) => entry.key === activePreviewKey)?.state ??
    (preview?.key === activePreviewKey ? preview.state : null);
  const currentPreview = previewIsCurrent ? loadedPreview : null;
  const omitted = new Map(
    loadedPreview?.status === 'ready'
      ? loadedPreview.warnings.map((warning) => [warning.question_number, warning.message])
      : [],
  );
  const includedQuestions = questions.data?.filter(
    (question) => !excludedQuestionNumbers.has(question.number),
  );
  const includedOmittedQuestions =
    includedQuestions?.filter((question) => omitted.has(question.number)) ?? [];
  const includedOmittedCount = includedOmittedQuestions.length;
  const affectedQuestions =
    includedOmittedCount === 1 ? 'the affected question' : 'the affected questions';
  const omittedRecovery = !canEditPrintForms
    ? archivedPreviewForm
      ? `Ask a course editor to fix ${affectedQuestions}, then reload this page.`
      : `Ask a course editor to fix or deselect ${affectedQuestions}, then update the preview.`
    : archivedPreviewForm
      ? `Fix ${affectedQuestions} in your course, then reload this page. Previous forms cannot be edited.`
      : questionSelectionLocked
        ? `Fix ${affectedQuestions} in your course and update the preview, or deselect ${includedOmittedCount === 1 ? 'it' : 'them'} to create a new form version.`
        : `Fix or deselect ${includedOmittedCount === 1 ? 'it' : 'them'}, then update the preview.`;
  const reviewCount =
    includedQuestions?.filter(
      (question) => question.concerns.length || omitted.has(question.number),
    ).length ?? 0;
  const reviewWarningKey = JSON.stringify([
    formId,
    includedQuestions
      ?.filter((question) => question.concerns.length || omitted.has(question.number))
      .map((question) => [question.number, question.concerns, omitted.get(question.number)]),
  ]);
  useEffect(() => {
    // A warning that disappears should be shown again if it returns later.
    if (reviewCount === 0) setDismissedReviewWarning(null);
  }, [reviewCount]);
  const firstReviewQuestion =
    includedOmittedQuestions.at(0) ??
    includedQuestions?.find((question) => question.concerns.length > 0);
  const noQuestionsSelected = questions.isSuccess && includedQuestions?.length === 0;
  const previewHasError = currentPreview?.status === 'error' || omitted.size > 0 || snapshotStale;
  const settingsLocked = controlsBusy || !!archivedPreviewForm || !canEditPrintForms;
  const canApplySettings =
    !controlsBusy &&
    !archivedPreviewForm &&
    !noQuestionsSelected &&
    (canEditPrintForms || (!!formId && !isDirty)) &&
    (!formId || isDirty || !previewIsCurrent || previewHasError) &&
    !(groupWork && !formId);
  const canAddForm =
    canEditPrintForms &&
    !controlsBusy &&
    !isDirty &&
    !groupWork &&
    hasRandomization &&
    activeForms.length > 0 &&
    activeForms.length < MAX_ACTIVE_PRINT_FORMS;
  const canDownload =
    canEditPrintForms &&
    validForm &&
    !isDirty &&
    previewIsCurrent &&
    currentPreview?.status === 'ready' &&
    currentPreview.questions > 0 &&
    omitted.size === 0 &&
    !snapshotStale &&
    !download.isPending &&
    !busy;
  const selectedFormName = formId ? `Form ${formLabel(formId)}` : null;
  const initialFormError = getAppError<PrintFormsError['ensureInitial']>(ensureInitial.error);

  async function applyPaperSizeChange({
    paperSize,
    sourceFormId,
    expectedForms,
  }: PendingPaperSizeChange) {
    setPaperSizeApplying(true);
    const focused = window.document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('.print-preparation-controls')) {
      settingFocusRef.current = focused;
    }
    const identityDraft = getValues('identityFields');
    const identityWasDirty = !!dirtyFields.identityFields;
    let mutationSucceeded = false;
    try {
      const result = await setPaperSize.mutateAsync({
        printFormId: sourceFormId,
        paperSize,
        expectedForms,
      });
      mutationSucceeded = true;
      const latest = await forms.refetch({ throwOnError: true });
      const replacement = result.replacements.find((form) => form.oldPrintFormId === sourceFormId);
      const selectedId = replacement?.printFormId ?? sourceFormId;
      const selected = latest.data?.find((form) => form.id === selectedId);
      if (!selected) throw new Error('The updated print form could not be loaded.');
      if (replacement) {
        switchForm(selectedId, selected.settings);
      } else {
        reset(selected.settings, { keepDirtyValues: false });
      }
      if (identityWasDirty) {
        setValue('identityFields', identityDraft, { shouldDirty: true });
      }
    } catch (error) {
      if (mutationSucceeded) {
        setPaperSizeRefreshFailed(true);
        return;
      }
      setValue('paperSize', settings.paperSize, { shouldDirty: true });
      throw error;
    } finally {
      setPaperSizeApplying(false);
    }
  }

  function changePaperSize(paperSize: PrintSettings['paperSize']) {
    if (!formId || archivedPreviewForm) return;
    const expectedForms = activeForms.map((form) => ({
      id: form.id,
      paperSize: form.settings.paperSize,
      locked: form.question_selection_locked_at !== null,
    }));
    const versionedForms = activeForms
      .filter((form) => form.settings.paperSize !== paperSize && form.question_selection_locked_at)
      .map((form) => ({
        previousLabel: form.label,
        nextLabel: nextPrintFormLabel(forms.data, form.label),
      }));
    const change = { paperSize, sourceFormId: formId, expectedForms, versionedForms };
    if (versionedForms.length > 0) {
      setPendingPaperSizeChange(change);
    } else {
      void applyPaperSizeChange(change).catch(() => {});
    }
  }

  function cancelPaperSizeChange() {
    if (paperSizeApplying) return;
    const selected = forms.data.find((form) => form.id === pendingPaperSizeChange?.sourceFormId);
    setValue('paperSize', selected?.settings.paperSize ?? settings.paperSize, {
      shouldDirty: true,
    });
    setPendingPaperSizeChange(null);
  }

  async function saveSetting<K extends keyof PrintSettings>(field: K, value: PrintSettings[K]) {
    if (!formId || archivedPreviewForm) return;
    const focused = window.document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('.print-preparation-controls')) {
      settingFocusRef.current = focused;
    }
    const identityDraft = getValues('identityFields');
    const saveIdentityDraft =
      field === 'includeCoverPage' && value === false && !!dirtyFields.identityFields;
    try {
      const updated = await updateSettings.mutateAsync({
        printFormId: formId,
        settings: {
          ...settings,
          [field]: value,
          ...(saveIdentityDraft
            ? { identityFields: PrintIdentityFieldsTextSchema.parse(identityDraft) }
            : {}),
        },
        expectedSettings: settings,
      });
      reset(updated.settings, { keepDirtyValues: false });
      if (
        field !== 'identityFields' &&
        !saveIdentityDraft &&
        identityDraft !== updated.settings.identityFields
      ) {
        setValue('identityFields', identityDraft, { shouldDirty: true });
      }
    } catch (error) {
      if (field === 'includeCoverPage') {
        setValue('includeCoverPage', settings.includeCoverPage, { shouldDirty: false });
        if (saveIdentityDraft) void trigger('identityFields');
      }
      if (
        error instanceof TRPCClientError &&
        error.data?.code === 'CONFLICT' &&
        error.message.includes(PRINT_QUESTION_SELECTION_LOCKED_MESSAGE)
      ) {
        const latest = await forms.refetch();
        const saved = latest.data?.find((form) => form.id === formId);
        if (saved) {
          setValue('excludedQuestions', saved.settings.excludedQuestions, { shouldDirty: true });
        }
      }
      throw error;
    }
  }

  async function applySettings(values: PrintSettings) {
    if (archivedPreviewForm || (!canEditPrintForms && !formId)) return;
    if (canEditPrintForms) {
      if (formId) {
        // Auto-saved fields use saved settings unless an unsuccessful edit is still dirty.
        const changedFields = (Object.keys(dirtyFields) as (keyof PrintSettings)[]).filter(
          (field) => dirtyFields[field],
        );
        values = {
          ...settings,
          ...Object.fromEntries(changedFields.map((field) => [field, values[field]])),
          identityFields: values.identityFields,
        };
      }
      values = {
        ...values,
        identityFields: values.includeCoverPage
          ? PrintIdentityFieldsTextSchema.parse(values.identityFields)
          : values.identityFields,
      };
    }
    setPreviewPending(true);
    setPreview(null);
    if (snapshotStale) void setExportId(null);
    packet.reset();
    download.reset();
    setPdfPreparationError(null);
    try {
      let nextFormId = formId;
      if (!formId) {
        const result = await create.mutateAsync({ settings: values });
        void setSelectedForm(result.printFormId);
        nextFormId = result.printFormId;
        values = result.settings;
      } else if (!canEditPrintForms) {
        const latest = await forms.refetch({ throwOnError: true });
        const selected = latest.data?.find((form) => form.id === formId);
        if (!selected) throw new Error('This print form is no longer available.');
        values = selected.settings;
        await questions.refetch({ throwOnError: true });
      } else {
        const updated = await updateSettings.mutateAsync({
          printFormId: formId,
          settings: values,
          expectedSettings: settings,
        });
        values = updated.settings;
        if (printLayoutSearch(values) === printLayoutSearch(settings)) {
          await questions.refetch();
        }
      }
      reset(values, { keepDirtyValues: false });
      if (nextFormId) {
        const nextPreview = invalidateFormPreview(nextFormId, values);
        if (snapshotStale) stalePreviewRefreshesRef.current.set(nextFormId, nextPreview.key);
        setPreviewUrl(nextPreview.url);
      }
    } catch (error) {
      setPreviewPending(false);
      if (error instanceof TRPCClientError && error.data?.code === 'CONFLICT') {
        const latest = await forms.refetch();
        const saved = latest.data?.find((form) => form.id === formId);
        if (saved && error.message.includes(PRINT_QUESTION_SELECTION_LOCKED_MESSAGE)) {
          reset(saved.settings, { keepDirtyValues: false });
        }
      }
      throw error;
    }
  }

  return (
    <div className="print-preparation">
      <AutomaticExportDownloads exports={printExports} />
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          <li className="breadcrumb-item">
            <a
              href={`/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/questions`}
            >
              Assessment questions
            </a>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            <h1 ref={printHeadingRef} className="d-inline fs-6 fw-normal mb-0" tabIndex={-1}>
              Print assessment
            </h1>
          </li>
        </ol>
      </nav>
      {ensureInitial.isPending && (
        <Alert variant="info" role="status">
          Creating Form A1…
        </Alert>
      )}
      {initialFormError && (
        <Alert variant="danger" className="d-flex align-items-center justify-content-between gap-2">
          <span>
            Could not create Form A1.{' '}
            {renderAppError(initialFormError, { UNKNOWN: ({ message }) => message })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline-danger"
            disabled={ensureInitial.isPending}
            onClick={() => ensureInitial.mutate()}
          >
            Try again
          </Button>
        </Alert>
      )}
      <AppErrorAlert
        error={getAppError<PrintFormsError['create']>(create.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          create.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={paperSizeRefreshFailed ? null : getAppError<PrintFormsError['list']>(forms.error)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {paperSizeRefreshFailed && (
        <Alert variant="danger">
          The paper size was changed, but the updated forms could not be loaded. Reload this page to
          continue.
        </Alert>
      )}
      <AppErrorAlert
        error={getAppError<PrintFormsError['regenerate']>(regenerate.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          regenerate.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['reviseSelection']>(reviseSelection.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          reviseSelection.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['archive']>(archive.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          archive.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['updateSettings']>(updateSettings.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          updateSettings.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['setPaperSize']>(setPaperSize.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          setPaperSize.reset();
          focusAfterDismiss();
        }}
      />
      <AppErrorAlert
        error={
          combinedDownload
            ? null
            : getAppError<PrintExportsError['pdf']>(pdfPreparationError ?? packet.error)
        }
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          packet.reset();
          setPdfPreparationError(null);
          focusAfterDismiss();
        }}
      />
      <PrintExports
        exports={printExports}
        displayTimezone={displayTimezone}
        detailsRef={recentExportsRef}
        onDismiss={focusAfterDismiss}
      />
      {groupWork && <Alert variant="info">Printing group assessments is not available yet.</Alert>}
      {reviewCount > 0 &&
        (includedOmittedCount > 0 || dismissedReviewWarning !== reviewWarningKey) && (
          <Alert
            variant={includedOmittedCount > 0 ? 'danger' : 'warning'}
            className="d-flex flex-wrap align-items-center justify-content-between gap-2"
            closeLabel={includedOmittedCount > 0 ? undefined : 'Dismiss question warning'}
            dismissible={includedOmittedCount === 0}
            onClose={() => {
              setDismissedReviewWarning(reviewWarningKey);
              window.requestAnimationFrame(() => printHeadingRef.current?.focus());
            }}
          >
            <span>
              {includedOmittedCount > 0
                ? `${includedOmittedCount} ${includedOmittedCount === 1 ? 'question' : 'questions'} could not be included. ${omittedRecovery}`
                : `${reviewCount} ${reviewCount === 1 ? 'question' : 'questions'} may need adjustments for paper.`}
            </span>
            <Button
              type="button"
              variant="link"
              className="p-0"
              onClick={() => {
                const target =
                  firstReviewQuestion &&
                  window.document.getElementById(
                    `print-preparation-question-${firstReviewQuestion.number}`,
                  );
                target?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
                target?.focus({ preventScroll: true });
              }}
            >
              Review questions
            </Button>
          </Alert>
        )}
      <form
        className="print-preparation-form"
        noValidate
        onSubmit={(event) => {
          if (!canApplySettings) {
            event.preventDefault();
            return;
          }
          event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
          void handleSubmit(applySettings)(event).catch(() => {});
        }}
      >
        <fieldset className="print-preparation-columns">
          <legend className="visually-hidden">Print settings</legend>
          <div className="print-preparation-controls">
            <section
              className="print-preparation-controls-scroll"
              aria-label="Print settings and questions"
            >
              {(hasRandomization || formIds.length > 0) && (
                <Card className="mb-3">
                  <Card.Body>
                    <h2 className="h6 mb-2">Print forms</h2>
                    <p className="small text-muted">
                      Each form can contain distinct randomized values, selected questions, and
                      layout settings. Paper size is shared by all current forms. Select a form to
                      preview it
                      {canEditPrintForms
                        ? ' or make changes.'
                        : '. Ask a course editor to change forms or start a download.'}
                    </p>
                    <div className="d-flex flex-column gap-2" role="group" aria-label="Print forms">
                      {activeForms.map((form) => {
                        const { id, label } = form;
                        return (
                          <div key={id} className="d-flex align-items-center gap-2">
                            <Button
                              id={`print-form-${id}`}
                              type="button"
                              size="sm"
                              className="flex-grow-1 text-start"
                              variant={id === formId ? 'primary' : 'outline-secondary'}
                              aria-pressed={id === formId}
                              disabled={busy || isDirty || isSubmitting || download.isPending}
                              onClick={() => switchForm(id)}
                            >
                              Form {label}
                              {id === formId && <span className="float-end">Previewing</span>}
                            </Button>
                            {canEditPrintForms &&
                              (form.has_randomizable_questions ||
                                form.question_selection_locked_at !== null) && (
                                <OverlayTrigger
                                  placement="top"
                                  tooltip={{
                                    props: { id: `print-regenerate-${id}` },
                                    body: form.has_randomizable_questions
                                      ? `Regenerate Form ${label} with new randomization`
                                      : `Create a new version of Form ${label} to change its questions`,
                                  }}
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline-secondary"
                                    aria-label={`Regenerate Form ${label}`}
                                    disabled={
                                      busy ||
                                      isDirty ||
                                      isSubmitting ||
                                      download.isPending ||
                                      groupWork
                                    }
                                    onClick={() =>
                                      setPendingFormAction({ action: 'regenerate', id, label })
                                    }
                                  >
                                    <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                                  </Button>
                                </OverlayTrigger>
                              )}
                            {canEditPrintForms && (
                              <OverlayTrigger
                                placement="top"
                                tooltip={{
                                  props: { id: `print-archive-${id}` },
                                  body: `Archive Form ${label}`,
                                }}
                              >
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline-secondary"
                                  aria-label={`Archive Form ${label}`}
                                  disabled={
                                    activeForms.length === 1 ||
                                    busy ||
                                    isDirty ||
                                    isSubmitting ||
                                    download.isPending
                                  }
                                  onClick={() =>
                                    setPendingFormAction({ action: 'archive', id, label })
                                  }
                                >
                                  <i className="bi bi-archive" aria-hidden="true" />
                                </Button>
                              </OverlayTrigger>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {canEditPrintForms && hasRandomization && !groupWork && (
                      <Button
                        type="button"
                        variant="outline-primary"
                        size="sm"
                        className={clsx('mt-3', { disabled: !canAddForm })}
                        aria-disabled={!canAddForm}
                        onClick={() => {
                          if (canAddForm) void addForm().catch(() => {});
                        }}
                      >
                        <i className="bi bi-plus-lg me-2" aria-hidden="true" /> Add form
                      </Button>
                    )}
                    {isDirty && (
                      <p className="small text-muted mt-2 mb-0">
                        Save your changes before switching forms.
                      </p>
                    )}
                  </Card.Body>
                </Card>
              )}
              {archivedForms.length > 0 && (
                <Card className="mb-3">
                  <Card.Body>
                    <details>
                      <summary className="h6 mb-0">Previous forms ({archivedForms.length})</summary>
                      <p className="small text-muted mt-2 mb-2">
                        Earlier versions of exported forms and archived forms are kept here for
                        reference. Select a previous form to view its layout settings, question
                        selections, and print preview.
                      </p>
                      <div className="d-flex flex-column gap-2">
                        {archivedForms.map((form) => (
                          <Button
                            key={form.id}
                            type="button"
                            size="sm"
                            variant={form.id === formId ? 'secondary' : 'outline-secondary'}
                            className="text-start"
                            aria-pressed={form.id === formId}
                            disabled={busy || isDirty || isSubmitting || download.isPending}
                            onClick={() => switchForm(form.id)}
                          >
                            Form {form.label}
                            {form.id === formId && <span className="float-end">Previewing</span>}
                          </Button>
                        ))}
                      </div>
                    </details>
                  </Card.Body>
                </Card>
              )}
              <Card className="mb-3">
                <Card.Body>
                  <h2 className="h6 mb-3">Paper and layout</h2>
                  <Form.Group controlId="print-paper-size" className="mb-3">
                    <Form.Label>Paper size</Form.Label>
                    <Form.Select
                      defaultValue={settings.paperSize}
                      disabled={settingsLocked}
                      {...register('paperSize', {
                        onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                          changePaperSize(event.target.value as PrintSettings['paperSize']);
                        },
                      })}
                    >
                      <option value="Letter">US Letter · 8.5 × 11 in</option>
                      <option value="A4">A4 · 210 × 297 mm</option>
                    </Form.Select>
                    <Form.Text>
                      This size applies to all current forms. Previous forms keep their saved size.
                    </Form.Text>
                    {mixedPaperSizes && (
                      <Alert variant="warning" className="mt-2 mb-0 small">
                        Current forms use different paper sizes.{' '}
                        {!canEditPrintForms ? (
                          'Ask a course editor to apply one size to all current forms.'
                        ) : archivedPreviewForm ? (
                          'Select a current form to apply one size to all forms.'
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-warning"
                            disabled={settingsLocked}
                            onClick={() => changePaperSize(settings.paperSize)}
                          >
                            Apply {settings.paperSize} to all current forms
                          </Button>
                        )}
                      </Alert>
                    )}
                  </Form.Group>
                  <Form.Group controlId="print-block-size">
                    <Form.Label>Space per question</Form.Label>
                    <Form.Select
                      defaultValue={settings.blockSize}
                      disabled={settingsLocked}
                      {...register('blockSize', {
                        onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                          void saveSetting(
                            'blockSize',
                            event.target.value as PrintSettings['blockSize'],
                          ).catch(() => {});
                        },
                      })}
                    >
                      {Object.entries(BLOCK_SIZE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text>
                      Reserve room for written work. Individual questions can override this below.
                    </Form.Text>
                  </Form.Group>
                </Card.Body>
              </Card>
              <Card className="mb-3">
                <Card.Body>
                  <h2 className="h6 mb-3">Cover page</h2>
                  <Form.Check
                    id="print-include-cover"
                    type="checkbox"
                    className="mb-3"
                    label="Include default cover page"
                    defaultChecked={settings.includeCoverPage}
                    disabled={settingsLocked}
                    {...register('includeCoverPage', {
                      onChange: (event: ChangeEvent<HTMLInputElement>) => {
                        void saveSetting('includeCoverPage', event.target.checked).catch(() => {});
                      },
                    })}
                  />
                  {includeCoverPage && (
                    <Form.Group controlId="print-identity-fields">
                      <Form.Label>Additional student fields:</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        defaultValue={settings.identityFields}
                        disabled={settingsLocked}
                        aria-describedby="print-identity-help"
                        aria-invalid={!!errors.identityFields}
                        aria-errormessage={
                          errors.identityFields ? 'print-identity-error' : undefined
                        }
                        isInvalid={!!errors.identityFields}
                        {...register('identityFields', {
                          validate: (value) => {
                            const result = PrintIdentityFieldsTextSchema.safeParse(value);
                            return result.success || result.error.issues[0].message;
                          },
                        })}
                      />
                      <Form.Control.Feedback type="invalid" id="print-identity-error">
                        {errors.identityFields?.message}
                      </Form.Control.Feedback>
                      <Form.Text id="print-identity-help">
                        One label per line. Name and Date are always included. Instructions come
                        from the assessment.
                      </Form.Text>
                      {canEditPrintForms && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            size="sm"
                            className={clsx({
                              disabled: settingsLocked || !dirtyFields.identityFields,
                            })}
                            aria-disabled={settingsLocked || !dirtyFields.identityFields}
                            onClick={() => {
                              if (settingsLocked || !dirtyFields.identityFields) return;
                              void handleSubmit(async (values) => {
                                await saveSetting('identityFields', values.identityFields);
                              })().catch(() => {});
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </Form.Group>
                  )}
                  {includeCoverPage && (
                    <Form.Check
                      id="print-grading-table"
                      className="mt-3"
                      label="Include grading table"
                      defaultChecked={settings.includeGradingTable}
                      disabled={settingsLocked}
                      {...register('includeGradingTable', {
                        onChange: (event: ChangeEvent<HTMLInputElement>) => {
                          void saveSetting('includeGradingTable', event.target.checked).catch(
                            () => {},
                          );
                        },
                      })}
                    />
                  )}
                  {includeCoverPage && (
                    <div className="mt-3">
                      <Form.Check
                        id="print-honor-code"
                        label="Include honor code"
                        aria-describedby="print-honor-code-help"
                        defaultChecked={settings.includeHonorCode}
                        disabled={settingsLocked}
                        {...register('includeHonorCode', {
                          onChange: (event: ChangeEvent<HTMLInputElement>) => {
                            void saveSetting('includeHonorCode', event.target.checked).catch(
                              () => {},
                            );
                          },
                        })}
                      />
                      <Form.Text id="print-honor-code-help">
                        Uses the assessment’s honor code, or the default honor code if none is
                        configured.
                      </Form.Text>
                    </div>
                  )}
                  <Form.Group
                    controlId="print-cover-pages"
                    className="mt-3"
                    hidden={!canEditPrintForms}
                  >
                    <Form.Label>Custom cover pages (PDF)</Form.Label>
                    <Form.Control
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={controlsBusy || !canEditPrintForms}
                      aria-describedby="print-cover-pages-help"
                      aria-invalid={!!uploadError}
                      aria-errormessage={uploadError ? 'print-cover-pages-error' : undefined}
                      isInvalid={!!uploadError}
                      multiple
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const next = [
                          ...coverPages,
                          ...Array.from(event.target.files ?? [], (file) => ({
                            id: crypto.randomUUID(),
                            file,
                          })),
                        ];
                        event.target.value = '';
                        if (next.some(({ file }) => !file.name.toLowerCase().endsWith('.pdf'))) {
                          setUploadError(
                            'Files were not added. Choose PDF files for your custom cover pages.',
                          );
                        } else if (
                          next.length > MAX_COVER_FILES ||
                          next.reduce((sum, { file }) => sum + file.size, 0) > MAX_COVER_BYTES
                        ) {
                          setUploadError(
                            `Files were not added. Use up to ${MAX_COVER_FILES} PDFs, totaling no more than ${COVER_SIZE_LIMIT}.`,
                          );
                        } else {
                          setCoverPages(next);
                          setUploadError(null);
                        }
                      }}
                    />
                    <Form.Control.Feedback type="invalid" id="print-cover-pages-error">
                      {uploadError}
                    </Form.Control.Feedback>
                    <Form.Text id="print-cover-pages-help">
                      Every student copy includes all uploaded pages, in this order, before the
                      questions{includeCoverPage ? ' and after the default cover' : ''}. Answer keys
                      and Word files exclude uploaded pages. Up to {MAX_COVER_FILES} PDFs,{' '}
                      {COVER_SIZE_LIMIT} total, and {MAX_COVER_PAGES} pages.
                    </Form.Text>
                  </Form.Group>
                  {canEditPrintForms && coverPages.length > 0 && (
                    <>
                      <ol className="small ps-3 mt-2 mb-1">
                        {coverPages.map(({ id, file }) => (
                          <li key={id}>
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-break flex-grow-1">{file.name}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="link"
                                aria-label={`Remove cover ${file.name}`}
                                disabled={controlsBusy}
                                onClick={() =>
                                  setCoverPages((files) => files.filter((cover) => cover.id !== id))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <p className="small text-muted mb-0">
                        Uploaded PDFs are temporary. Closing or reloading this page before a
                        student-copy PDF is ready will discard them. Check the downloaded file to
                        see how the pages appear.
                      </p>
                    </>
                  )}
                </Card.Body>
              </Card>
              {validForm && (
                <Card id="print-preparation-questions" className="mb-3">
                  <Card.Header className="bg-white d-flex flex-wrap align-items-center justify-content-between gap-3 py-3">
                    <div>
                      <h2 className="h6 mb-1">
                        Questions in this form{' '}
                        {questions.data && (
                          <span className="text-muted">({questions.data.length})</span>
                        )}
                      </h2>
                      {includedQuestions && (
                        <p className="small fw-semibold mb-2">
                          {includedQuestions.length} of {questions.data?.length} selected ·{' '}
                          {includedQuestions.reduce(
                            (total, question) => total + question.points,
                            0,
                          )}{' '}
                          points
                        </p>
                      )}
                      <p className="small text-muted mb-0">
                        The list marks printing concerns and questions that could not be included.
                        Check the preview for layout and complete instructions.
                      </p>
                      {canEditPrintForms && questionSelectionLocked && !archivedPreviewForm && (
                        <p className="small text-muted mb-0 mt-1">
                          A download has started for this form. Changing its question selection
                          creates a new numbered version; the original stays in Previous forms.
                        </p>
                      )}
                    </div>
                    {reviewCount > 0 && (
                      <Form.Check
                        type="switch"
                        id="print-review-only"
                        label={`Show only items to review (${reviewCount})`}
                        checked={reviewOnly}
                        disabled={controlsBusy}
                        onChange={(event) => setReviewOnly(event.target.checked)}
                      />
                    )}
                  </Card.Header>
                  <AppErrorAlert
                    error={getAppError<PrintFormsError['questions']>(questions.error)}
                    render={{ UNKNOWN: ({ message }) => message }}
                  />
                  {questions.isPending && (
                    <div className="p-3" role="status">
                      <Spinner size="sm" className="me-2" />
                      Checking question content…
                    </div>
                  )}
                  {includedOmittedCount > 0 && (
                    <Alert variant="danger" className="m-3">
                      {includedOmittedCount}{' '}
                      {includedOmittedCount === 1 ? 'question cannot' : 'questions cannot'} be
                      printed. {omittedRecovery}
                    </Alert>
                  )}
                  {questions.data
                    ?.filter(
                      (question) =>
                        !reviewOnly ||
                        reviewCount === 0 ||
                        (!excludedQuestionNumbers.has(question.number) &&
                          (question.concerns.length > 0 || omitted.has(question.number))),
                    )
                    .map((question) => {
                      const excluded = excludedQuestionNumbers.has(question.number);
                      const error = excluded ? undefined : omitted.get(question.number);
                      return (
                        <div
                          key={question.number}
                          id={`print-preparation-question-${question.number}`}
                          role="group"
                          aria-label={`Question ${question.number}: ${question.title}`}
                          tabIndex={
                            error || (!excluded && question.concerns.length > 0) ? -1 : undefined
                          }
                          className={clsx('print-preparation-question', {
                            'bg-danger-subtle': error,
                            'bg-body-tertiary': excluded,
                            'print-preparation-question-selected':
                              selectedQuestion?.number === question.number,
                          })}
                        >
                          <Form.Check
                            type="checkbox"
                            id={`print-question-include-${question.number}`}
                            className="print-preparation-question-include"
                            aria-label={`Include question ${question.number}`}
                            checked={!excluded}
                            disabled={settingsLocked || (questionSelectionLocked && isDirty)}
                            onChange={(event) => {
                              if (questionSelectionLocked && formId) {
                                setPendingFormAction({
                                  action: 'reviseSelection',
                                  id: formId,
                                  label: formLabel(formId),
                                  questionNumber: question.number,
                                  included: event.target.checked,
                                });
                                return;
                              }
                              const next = event.target.checked
                                ? excludedQuestions.filter((number) => number !== question.number)
                                : [...excludedQuestions, question.number].sort((a, b) =>
                                    a.localeCompare(b, undefined, { numeric: true }),
                                  );
                              setValue('excludedQuestions', next, { shouldDirty: true });
                              void saveSetting('excludedQuestions', next).catch(() => {});
                              if (selectedQuestion?.number === question.number) {
                                setSelectedQuestion(null);
                              }
                            }}
                          />
                          <span className="print-preparation-question-number">
                            {question.number}
                          </span>
                          <div className="print-preparation-question-title">
                            <Button
                              type="button"
                              variant="link"
                              className="p-0 text-start fw-semibold text-decoration-none"
                              disabled={controlsBusy || !!error || excluded}
                              onClick={() => {
                                setSelectedQuestion({ number: question.number });
                                window.document
                                  .querySelector('.print-preparation-preview-card')
                                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }}
                            >
                              {question.title}
                            </Button>
                            <div className="text-muted small mt-1">{question.points} points</div>
                          </div>
                          {(error || question.concerns.length > 0) && (
                            <div className="print-preparation-question-review small">
                              {error ? (
                                <>
                                  <Badge bg="danger" className="mb-1">
                                    Omitted
                                  </Badge>
                                  <div>{error}</div>
                                </>
                              ) : (
                                <>
                                  <Badge bg="warning" text="dark" className="mb-1">
                                    Review printability
                                  </Badge>
                                  <div>{question.concerns.join(' ')}</div>
                                </>
                              )}
                            </div>
                          )}
                          <Form.Group
                            controlId={`print-question-space-${question.number}`}
                            className="print-preparation-question-space"
                          >
                            <Form.Label className="small mb-0">Spacing</Form.Label>
                            <Form.Select
                              size="sm"
                              disabled={settingsLocked || !!error || excluded}
                              aria-label={`Spacing for question ${question.number}`}
                              value={questionSizes[question.number] ?? ''}
                              onChange={(event) => {
                                // Homework labels contain dots, which register() treats as nested paths.
                                const next = {
                                  ...questionSizes,
                                  [question.number]: event.target
                                    .value as PrintSettings['questionSizes'][string],
                                };
                                setValue('questionSizes', next, { shouldDirty: true });
                                void saveSetting('questionSizes', next).catch(() => {});
                              }}
                            >
                              <option value="">Automatic</option>
                              {Object.entries(BLOCK_SIZE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Form.Select>
                            <a
                              href={getQuestionUrl({
                                courseInstanceId,
                                questionId: question.questionId,
                              })}
                              className="small text-nowrap"
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${canEditPrintForms ? 'Edit' : 'View'} question ${question.number} (opens in a new tab)`}
                            >
                              {canEditPrintForms ? 'Edit' : 'View'} question
                            </a>
                          </Form.Group>
                        </div>
                      );
                    })}
                  {questions.data?.length === 0 && (
                    <p className="p-3 mb-0 text-muted">
                      There are no questions in this form. Add questions to the assessment before
                      printing.
                    </p>
                  )}
                </Card>
              )}
            </section>
            <div className="print-preparation-actions" hidden={!canEditPrintForms && !formId}>
              {noQuestionsSelected && (
                <p className="small text-danger mb-2" role="alert">
                  {canEditPrintForms
                    ? 'Select at least one question to download an assessment.'
                    : 'Ask a course editor to select at least one question before downloading.'}
                </p>
              )}
              <Button
                ref={applyPreviewButtonRef}
                type="submit"
                className={clsx('w-100', { disabled: !canApplySettings })}
                aria-disabled={!canApplySettings}
              >
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
                    {formId ? 'Update preview' : 'Create preview'}
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="print-preparation-workspace">
            <Card className="print-preparation-preview-card">
              <Card.Header className="bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3">
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <div className="d-flex align-items-center gap-2">
                    <h2 className="h6 mb-0">Preview</h2>
                    {(formIds.length > 1 || archivedPreviewForm) && (
                      <Form.Select
                        size="sm"
                        className="w-auto"
                        aria-label="Preview form"
                        value={formId ?? ''}
                        disabled={
                          controlsBusy || isDirty || (formIds.length < 2 && !archivedPreviewForm)
                        }
                        onChange={(event) => switchForm(event.target.value)}
                      >
                        {formIds.length === 0 && <option value="">No current forms</option>}
                        {formIds.map((id) => (
                          <option key={id} value={id}>
                            Form {formLabel(id)}
                          </option>
                        ))}
                        {archivedPreviewForm && (
                          <option value={archivedPreviewForm.id}>
                            Previous Form {archivedPreviewForm.label}
                          </option>
                        )}
                      </Form.Select>
                    )}
                  </div>
                  <ButtonGroup size="sm" aria-label="Preview document">
                    <Button
                      type="button"
                      variant={document === 'assessment' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'assessment'}
                      disabled={controlsBusy}
                      onClick={() => switchDocument('assessment')}
                    >
                      Student copy
                    </Button>
                    <Button
                      type="button"
                      variant={document === 'answer_key' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'answer_key'}
                      disabled={controlsBusy}
                      onClick={() => switchDocument('answer_key')}
                    >
                      Answer key
                    </Button>
                  </ButtonGroup>
                </div>
                {currentPreview?.status === 'ready' && (
                  <div className="small text-muted">
                    <span role="status">
                      {currentPreview.pages} {currentPreview.pages === 1 ? 'page' : 'pages'} ·{' '}
                      {currentPreview.questions}{' '}
                      {currentPreview.questions === 1 ? 'question' : 'questions'} ·{' '}
                      {currentPreview.points} {currentPreview.points === 1 ? 'point' : 'points'}
                    </span>
                  </div>
                )}
                <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 ms-auto">
                  <div
                    ref={prepareStatusRef}
                    id="print-prepare-status"
                    className="print-preparation-status small text-muted"
                    role={
                      !preparingExport &&
                      (download.isError || (exportId && displayedExport?.status === 'failed'))
                        ? 'alert'
                        : 'status'
                    }
                    tabIndex={-1}
                  >
                    {preparingExport ? (
                      <span className="d-flex align-items-center gap-2">
                        <Spinner size="sm" aria-hidden="true" />
                        <span>
                          {preparingPdf && pdfPreparationProgress
                            ? `Preparing documents ${pdfPreparationProgress.completed} of ${pdfPreparationProgress.total}…`
                            : 'Generating…'}
                        </span>
                      </span>
                    ) : download.isError ? (
                      <span className="text-danger">{download.error.message}</span>
                    ) : !combinedDownload && pdfPreparationError ? (
                      <span className="text-danger">{pdfPreparationError.message}</span>
                    ) : packet.isError ? (
                      <span className="text-danger">{packet.error.message}</span>
                    ) : exportId && displayedExport?.status === 'succeeded' ? (
                      <span className="visually-hidden">File ready.</span>
                    ) : exportId && displayedExport?.status === 'failed' ? (
                      <span className="text-danger">
                        {displayedExport.failureMessage ?? 'The file could not be prepared.'}
                      </span>
                    ) : exportId && displayedExport?.status === 'expired' ? (
                      'This file has expired.'
                    ) : exportId ? (
                      'Preparing file… It will download automatically.'
                    ) : null}
                  </div>
                  <div className="print-preparation-download" hidden={!canEditPrintForms}>
                    <Dropdown align="end">
                      <Dropdown.Toggle
                        ref={downloadMenuButtonRef}
                        id="print-download-menu"
                        size="sm"
                        disabled={!canDownload}
                      >
                        <i className="bi bi-file-earmark-arrow-down me-2" aria-hidden="true" />
                        Download…
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        {formId && selectedFormName && (
                          <>
                            <Dropdown.Item
                              onClick={() => {
                                focusPrepareStatus();
                                void downloadPacket([formId], 'assessment').catch(() => {});
                              }}
                            >
                              Download {selectedFormName} (PDF)
                            </Dropdown.Item>
                            <Dropdown.Item
                              onClick={() => {
                                startWordExport(formId, 'assessment');
                              }}
                            >
                              Download {selectedFormName} Word (.docx)
                            </Dropdown.Item>
                            <Dropdown.Item
                              onClick={() => {
                                focusPrepareStatus();
                                void downloadPacket([formId], 'answer_key').catch(() => {});
                              }}
                            >
                              Download {selectedFormName} answer key (PDF)
                            </Dropdown.Item>
                            <Dropdown.Item
                              onClick={() => {
                                startWordExport(formId, 'answer_key');
                              }}
                            >
                              Download {selectedFormName} answer key Word (.docx)
                            </Dropdown.Item>
                          </>
                        )}
                        {formIds.length > 1 && (
                          <>
                            <Dropdown.Divider />
                            <Dropdown.Item
                              disabled={mixedPaperSizes}
                              onClick={() => void openCombinedDownload('assessment')}
                            >
                              Download all forms PDF
                            </Dropdown.Item>
                            <Dropdown.Item
                              disabled={mixedPaperSizes}
                              onClick={() => void openCombinedDownload('answer_key')}
                            >
                              Download all answer keys PDF
                            </Dropdown.Item>
                          </>
                        )}
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>
                </div>
              </Card.Header>
              {(isDirty || !previewIsCurrent) && (
                <div className="px-3 py-2 bg-warning-subtle small" role="status">
                  The preview shows your last applied settings.{' '}
                  {isDirty
                    ? 'Save your changes, then update the preview to see them or download files.'
                    : 'Select Update preview to see your saved changes or download files.'}
                </div>
              )}
              {validForm ? (
                <div className="print-preparation-preview-stack">
                  {previewsToRender.map((entry) => (
                    <PreviewFrame
                      key={entry.key}
                      cacheKey={entry.key}
                      url={entry.url}
                      document={entry.document}
                      active={entry.key === activePreviewKey}
                      selectedQuestion={entry.key === activePreviewKey ? selectedQuestion : null}
                      onStateChange={onPreviewState}
                      onSnapshotReady={onSnapshotReady}
                    />
                  ))}
                </div>
              ) : (
                <div className="print-preparation-empty">
                  <i
                    className="bi bi-file-earmark-text display-4 text-primary mb-3"
                    aria-hidden="true"
                  />
                  <h3 className="h5">
                    {canEditPrintForms ? 'Set up your first form' : 'No forms yet'}
                  </h3>
                  <p className="text-muted mb-0">
                    {!canEditPrintForms
                      ? 'Ask a course editor to create a form.'
                      : ensureInitial.isPending
                        ? 'Creating Form A1 and its preview.'
                        : ensureInitial.isError
                          ? 'Use Try again above to create Form A1.'
                          : 'Choose your layout, then create a preview.'}
                    {canEditPrintForms && (
                      <>
                        <br />
                        Review the questions before downloading.
                      </>
                    )}
                  </p>
                </div>
              )}
              {canEditPrintForms && (
                <Card.Footer className="bg-white p-3">
                  <div className="print-preparation-download-help text-muted small">
                    Word exports exclude uploaded cover pages. Formatting and page breaks may differ
                    from the preview and between apps.
                  </div>
                </Card.Footer>
              )}
            </Card>
          </div>
        </fieldset>
      </form>
      <CombinedPdfDownloadModal
        show={combinedDownload !== null}
        document={combinedDownload?.document ?? 'assessment'}
        formCount={combinedDownload?.formIds.length ?? 0}
        enrolledStudents={enrolledStudents}
        pageCount={combinedDownload?.pageCount ?? null}
        preparing={combinedDownload?.preparing ?? false}
        downloading={packet.isPending || preparingPdf || combinedSubmitting}
        progress={combinedDownload?.progress ?? null}
        failure={combinedDownload?.failure ?? null}
        error={preflight.error ?? pdfPreparationError ?? packet.error}
        onHide={() => closeCombinedDownload()}
        onExited={() => {
          const target = combinedReturnFocusRef.current;
          if (target === 'recent') focusAfterDismiss('summary');
          else if (target === 'menu') downloadMenuButtonRef.current?.focus();
          else requestFormFocus(target.formId, true);
        }}
        onReviewForm={(id) => {
          closeCombinedDownload({ formId: id });
          switchForm(id);
        }}
        onDownload={() => void downloadCombined()}
      />
      <Modal
        show={pendingPaperSizeChange !== null}
        aria-labelledby="print-paper-size-change-title"
        backdrop="static"
        keyboard={!paperSizeApplying}
        restoreFocus={false}
        onHide={cancelPaperSizeChange}
        onExited={() => window.document.getElementById('print-paper-size')?.focus()}
      >
        <Modal.Header closeButton={!paperSizeApplying}>
          <Modal.Title as="h2" className="h5" id="print-paper-size-change-title">
            Change paper size for all forms
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            This will set all current forms to {pendingPaperSizeChange?.paperSize}. A download has
            started for these forms, so each will get a new numbered version:
          </p>
          <ul>
            {pendingPaperSizeChange?.versionedForms.map((form) => (
              <li key={form.previousLabel}>
                Form {form.previousLabel} → Form {form.nextLabel}
              </li>
            ))}
          </ul>
          <p className="mb-0">
            The previous versions will remain available in Previous forms. Question selections and
            other print settings will be kept.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="secondary"
            disabled={paperSizeApplying}
            onClick={cancelPaperSizeChange}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={paperSizeApplying}
            onClick={() => {
              if (!pendingPaperSizeChange || paperSizeApplying) return;
              void applyPaperSizeChange(pendingPaperSizeChange)
                .catch(() => {})
                .finally(() => setPendingPaperSizeChange(null));
            }}
          >
            {paperSizeApplying ? (
              <>
                <Spinner size="sm" className="me-2" aria-hidden="true" />
                Updating forms…
              </>
            ) : (
              'Apply paper size'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={pendingFormAction !== null}
        aria-labelledby="print-form-action-title"
        backdrop="static"
        keyboard={!formActionPending}
        enforceFocus={pendingFormAction !== null}
        restoreFocus={false}
        onHide={closeFormAction}
        onExited={() => {
          const id = nextFormFocusRef.current;
          nextFormFocusRef.current = null;
          if (id) requestFormFocus(id);
        }}
      >
        <Modal.Header closeButton={!formActionPending}>
          <Modal.Title as="h2" className="h5" id="print-form-action-title">
            {pendingFormAction?.action === 'reviseSelection'
              ? `Change Form ${pendingFormAction.label} questions`
              : `${pendingFormAction?.action === 'regenerate' ? 'Regenerate' : 'Archive'} Form ${pendingFormAction?.label}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {pendingFormAction?.action === 'regenerate' ? (
            pendingRegenerateLocked ? (
              <p className="mb-0">
                This will replace <strong>Form {pendingFormAction.label}</strong> with{' '}
                <strong>Form {nextPrintFormLabel(forms.data, pendingFormAction.label)}</strong>
                {hasRandomization ? ' applying fresh randomization' : ''}.{' '}
                <strong>Form {pendingFormAction.label}</strong> will remain available for reference
                in the 'Previous forms' section with its chosen questions and settings.
              </p>
            ) : (
              <p className="mb-0">
                This will regenerate <strong>Form {pendingFormAction.label}</strong> while keeping
                its label, selected questions, their order, and print settings.
                {hasRandomization ? ' Random question values may change.' : ''}
              </p>
            )
          ) : pendingFormAction?.action === 'reviseSelection' ? (
            <p className="mb-0">
              A download has started for this form.{' '}
              {pendingFormAction.included ? 'Including' : 'Deselecting'} question{' '}
              {pendingFormAction.questionNumber} will replace{' '}
              <strong>Form {pendingFormAction.label}</strong> with{' '}
              <strong>Form {nextPrintFormLabel(forms.data, pendingFormAction.label)}</strong>. The
              new version keeps the question order, other selections, and print settings
              {hasRandomization ? '. Random values may change' : ''}. The original remains in
              Previous forms.
            </p>
          ) : (
            <p className="mb-0">
              This will remove Form {pendingFormAction?.label} from the current set. You can still
              preview or download it under Previous forms, but later edits to the assessment or its
              questions may affect a new download.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="secondary"
            disabled={formActionPending}
            onClick={closeFormAction}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={pendingFormAction?.action === 'archive' ? 'danger' : 'primary'}
            className={formActionPending ? 'disabled' : undefined}
            aria-disabled={formActionPending}
            onClick={() => {
              if (!pendingFormAction || formActionPending) return;
              const action = pendingFormAction;
              void (async () => {
                try {
                  nextFormFocusRef.current =
                    action.action === 'regenerate'
                      ? await regenerateForm(action.id)
                      : action.action === 'reviseSelection'
                        ? await reviseFormSelection(
                            action.id,
                            action.questionNumber,
                            action.included,
                          )
                        : await archiveForm(action.id);
                } catch {
                  nextFormFocusRef.current = action.id;
                } finally {
                  setPendingFormAction(null);
                }
              })();
            }}
          >
            {formActionPending ? (
              <>
                <Spinner size="sm" className="me-2" aria-hidden="true" />
                {pendingFormAction?.action === 'regenerate'
                  ? 'Regenerating…'
                  : pendingFormAction?.action === 'reviseSelection'
                    ? 'Creating version…'
                    : 'Archiving…'}
              </>
            ) : pendingFormAction?.action === 'regenerate' ? (
              'Regenerate form'
            ) : pendingFormAction?.action === 'reviseSelection' ? (
              'Create new form version'
            ) : (
              'Archive form'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

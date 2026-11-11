import { QueryClient, skipToken, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { type ChangeEvent, Fragment, useCallback, useRef, useState } from 'react';
import { Alert, Badge, Button, ButtonGroup, Card, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { NuqsAdapter, OverlayTrigger } from '@prairielearn/ui';
import { IdSchema } from '@prairielearn/zod';

import { PrintIdentityFieldsTextSchema } from '../../lib/client/printing/print-cover.js';
import { MAX_ACTIVE_PRINT_FORMS } from '../../lib/client/printing/print-form-limits.js';
import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
} from '../../lib/client/printing/print-packet.js';
import {
  DEFAULT_PRINT_SETTINGS,
  printLayoutSearch,
} from '../../lib/client/printing/print-preparation.js';
import {
  type PrintSnapshot,
  STALE_PRINT_SNAPSHOT_MESSAGE,
  capturePrintSnapshot,
  renderPrintSnapshot,
} from '../../lib/client/printing/print-snapshot.js';
import type { StaffPrintForm } from '../../lib/client/safe-db-types.js';
import { getPrintFormUrl, getQuestionUrl } from '../../lib/client/url.js';
import type { PrintDocument } from '../../lib/printing/index.js';
import type { PrintSettings } from '../../lib/printing/print-packet-schema.js';
import type { QuestionBlockSize } from '../../lib/printing/question-block-size.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';
import type { PrintFormsError } from '../../trpc/assessment/print-forms.js';
import type { PrintableAssessmentExportError } from '../../trpc/assessment/printable-assessment-export.js';

import { BookletDownloadModal } from './BookletDownloadModal.js';
import { type PreviewState, PrintPreview } from './PrintPreview.js';

const BLOCK_SIZE_LABELS: Record<QuestionBlockSize, string> = {
  auto: 'Fit to content',
  third: 'One third of a page',
  half: 'Half a page',
  full: 'A full page',
};

const SNAPSHOT_PREPARATION_BATCH_SIZE = 3;

interface PrintPreparationProps {
  assessmentId: string;
  courseInstanceId: string;
  hasRandomization: boolean;
  groupWork: boolean;
  requireHonorCode: boolean;
  forms: StaffPrintForm[];
  enrolledStudents: number;
  defaultCopies: number;
  renderingAvailable: boolean;
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

function PrintPreparation({
  assessmentId,
  courseInstanceId,
  hasRandomization,
  groupWork,
  requireHonorCode,
  forms: initialForms,
  enrolledStudents,
  defaultCopies,
  renderingAvailable,
  docxCsrfToken,
}: PrintPreparationProps) {
  const trpc = useTRPC();
  const forms = useQuery(
    trpc.printForms.list.queryOptions(undefined, { initialData: initialForms }),
  );
  const [selectedForm, setSelectedForm] = useQueryState('form', parseAsString);
  const [selectedForms, setSelectedForms] = useQueryState('forms', parseAsArrayOf(parseAsString));
  const activeForms = forms.data.filter((form) => form.archived_at === null).reverse();
  const archivedForms = forms.data.filter((form) => form.archived_at !== null);
  const savedFormIds = selectedForms ?? activeForms.map((form) => form.id);
  const availableFormIds = [...new Set(savedFormIds)]
    .filter((id) => activeForms.some((form) => form.id === id))
    .slice(0, MAX_ACTIVE_PRINT_FORMS);
  const formIds = availableFormIds;
  const selectedArchivedForm = archivedForms.find((form) => form.id === selectedForm);
  const formId =
    selectedForm && (formIds.includes(selectedForm) || selectedArchivedForm)
      ? selectedForm
      : (formIds.at(0) ?? null);
  const archivedPreviewForm = archivedForms.find((form) => form.id === formId);
  const downloadFormIds = archivedPreviewForm ? [...formIds, archivedPreviewForm.id] : formIds;
  function formLabel(id: string) {
    const form = forms.data.find((item) => item.id === id);
    if (!form) throw new Error('This print form is not available.');
    return form.label;
  }
  const [formSettings, setFormSettings] = useState<Partial<Record<string, PrintSettings>>>({});
  const [coverPages, setCoverPages] = useState<{ id: string; file: File }[]>([]);
  const [copies, setCopies] = useState(defaultCopies);
  const [showBookletModal, setShowBookletModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const validForm = forms.data.some((form) => form.id === formId);
  const [document, setDocument] = useState<PrintDocument>('assessment');
  const defaultSettings = { ...DEFAULT_PRINT_SETTINGS, includeHonorCode: requireHonorCode };
  const [settings, setSettings] = useState<PrintSettings>(defaultSettings);
  const [selectedQuestion, setSelectedQuestion] = useState<{ number: string } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [preview, setPreview] = useState<{ url: string; state: PreviewState } | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState<'packet' | 'booklet' | null>(null);
  const [pdfPreparationProgress, setPdfPreparationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [pdfPreparationError, setPdfPreparationError] = useState<{
    target: 'packet' | 'booklet';
    error: Error;
  } | null>(null);
  const snapshotsRef = useRef(new Map<string, PrintSnapshot>());
  const previewDocumentRef = useRef<{ url: string; doc: Document } | null>(null);
  const [retry, setRetry] = useState(0);
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [exportId, setExportId] = useQueryState('export', parseAsString);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PrintSettings>({ defaultValues: defaultSettings });
  const includeCoverPage = watch('includeCoverPage');
  const questionSizes = watch('questionSizes');
  const excludedQuestions = watch('excludedQuestions');
  const excludedQuestionNumbers = new Set(excludedQuestions);
  const layout = printLayoutSearch(settings);
  const printBase = formId
    ? getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: formId })
    : '';
  const previewUrl = `${printBase}/preview?${layout}&document=${document}`;
  const questions = useQuery(
    trpc.printForms.questions.queryOptions({ printFormId: formId ?? '1' }, { enabled: validForm }),
  );
  const create = useMutation(
    trpc.printForms.create.mutationOptions({
      onSuccess: async () => {
        await forms.refetch();
      },
    }),
  );
  const regenerate = useMutation(
    trpc.printForms.regenerate.mutationOptions({
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
  const packet = useMutation(trpc.printableAssessmentExport.pdf.mutationOptions());
  const booklet = useMutation(trpc.printableAssessmentExport.pdf.mutationOptions());
  const exportStatus = useQuery(
    trpc.printableAssessmentExport.status.queryOptions(
      exportId === null ? skipToken : { printExportId: exportId },
      {
        refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2_000 : false),
      },
    ),
  );
  const exportNeedsNewPreview = exportStatus.data?.failureMessage === STALE_PRINT_SNAPSHOT_MESSAGE;
  const exportPending =
    exportId !== null && (exportStatus.isPending || exportStatus.data?.status === 'pending');
  const busy =
    create.isPending ||
    regenerate.isPending ||
    archive.isPending ||
    packet.isPending ||
    booklet.isPending ||
    preparingPdf !== null ||
    previewPending;

  function markStaleSnapshot(error: unknown) {
    if (error instanceof Error && error.message.includes(STALE_PRINT_SNAPSHOT_MESSAGE)) {
      snapshotsRef.current.clear();
      setSnapshotStale(true);
    }
  }

  function settingsForForm(id: string, appliedSettings = settings): PrintSettings {
    return {
      ...appliedSettings,
      identityFields: appliedSettings.includeCoverPage ? appliedSettings.identityFields : '',
      questionSizes:
        id === formId ? appliedSettings.questionSizes : (formSettings[id]?.questionSizes ?? {}),
      excludedQuestions:
        id === formId
          ? appliedSettings.excludedQuestions
          : (formSettings[id]?.excludedQuestions ?? []),
    };
  }

  function packetMetadata(
    ids: string[],
    copyCount: number,
    outputDocument: PrintDocument | 'booklet',
    appliedSettings = settings,
  ) {
    return {
      forms: ids.map((id) => ({
        printFormId: id,
        settings: settingsForForm(id, appliedSettings),
      })),
      copies: copyCount,
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
    snapshotsRef.current.set(url, snapshot);
    return snapshot;
  }

  async function packetInput(metadata: ReturnType<typeof packetMetadata>) {
    const input = new FormData();
    input.set('metadata', JSON.stringify(metadata));
    if (metadata.document !== 'answer_key') {
      for (const { file } of coverPages) input.append('coverPages', file);
    }
    const snapshotRequests = metadata.forms.flatMap((form, index) =>
      (metadata.document === 'booklet'
        ? (['assessment', 'answer_key'] as const)
        : ([metadata.document] as PrintDocument[])
      )
        .filter((printDocument) => printDocument !== 'assessment' || index < metadata.copies)
        .map((printDocument) => ({ form, printDocument })),
    );
    setPdfPreparationProgress({ completed: 0, total: snapshotRequests.length });
    for (let index = 0; index < snapshotRequests.length; index += SNAPSHOT_PREPARATION_BATCH_SIZE) {
      const batch = snapshotRequests.slice(index, index + SNAPSHOT_PREPARATION_BATCH_SIZE);
      const snapshots = await Promise.all(
        batch.map(({ form, printDocument }) =>
          snapshotFor(form.printFormId, formLabel(form.printFormId), form.settings, printDocument),
        ),
      );
      for (const [batchIndex, snapshot] of snapshots.entries()) {
        const { form, printDocument } = batch[batchIndex];
        input.append(
          'pages',
          new File([snapshot.html], `form-${formLabel(form.printFormId)}-${printDocument}.html`),
        );
        input.append('snapshotIds', snapshot.id);
      }
      setPdfPreparationProgress({
        completed: index + batch.length,
        total: snapshotRequests.length,
      });
    }
    return input;
  }

  async function preparePdfInput(
    metadata: ReturnType<typeof packetMetadata>,
    target: 'packet' | 'booklet',
  ) {
    setPdfPreparationError(null);
    setPdfPreparationProgress(null);
    setPreparingPdf(target);
    try {
      return await packetInput(metadata);
    } catch (error) {
      setPdfPreparationError({
        target,
        error:
          error instanceof Error ? error : new Error('The printable pages could not be prepared.'),
      });
      throw error;
    } finally {
      setPreparingPdf(null);
      setPdfPreparationProgress(null);
    }
  }

  function receiveExport(result: Awaited<ReturnType<typeof packet.mutateAsync>>) {
    void setExportId(result.printExportId);
  }

  async function downloadPacket(
    ids: string[],
    copyCount: number,
    outputDocument: PrintDocument | 'booklet',
  ) {
    packet.reset();
    try {
      const result = await packet.mutateAsync(
        await preparePdfInput(packetMetadata(ids, copyCount, outputDocument), 'packet'),
      );
      receiveExport(result);
    } catch (error) {
      markStaleSnapshot(error);
      throw error;
    }
  }

  function switchDocument(next: PrintDocument) {
    if (next === document) return;
    setDocument(next);
    setPreview(null);
  }

  function switchForm(id: string) {
    if (id === formId) return;

    void setSelectedForm(id);
    const next = { ...settingsForForm(id), identityFields: settings.identityFields };
    setSettings(next);
    reset(next);
    setSelectedQuestion(null);
    setPreview(null);
  }

  async function addForm() {
    const result = await create.mutateAsync();
    if (selectedForms !== null) void setSelectedForms([...formIds, result.printFormId]);
    switchForm(result.printFormId);
  }

  async function regenerateForm(id: string) {
    const result = await regenerate.mutateAsync({ printFormId: id });
    if (selectedForms !== null) {
      void setSelectedForms(formIds.map((value) => (value === id ? result.printFormId : value)));
    }
    switchForm(result.printFormId);
  }

  async function archiveForm(id: string) {
    await archive.mutateAsync({ printFormId: id });
    const nextIds = formIds.filter((value) => value !== id);
    if (selectedForms !== null) void setSelectedForms(nextIds.length > 0 ? nextIds : null);
    if (id === formId) {
      const nextId = nextIds[0] ?? activeForms.find((form) => form.id !== id)?.id;
      if (nextId) switchForm(nextId);
      else void setSelectedForm(null);
    }
  }
  const download = useMutation({
    mutationFn: async (id: string) => {
      const base = getPrintFormUrl({ courseInstanceId, assessmentId, printFormId: id });
      const appliedSettings = settingsForForm(id);
      const search = printLayoutSearch(appliedSettings);
      const url = `${base}/preview?${search}&document=assessment`;
      const livePreview = previewDocumentRef.current;
      const snapshot =
        livePreview?.url === url && livePreview.doc.documentElement.dataset.printStatus === 'ready'
          ? (snapshotsRef.current.get(url) ?? capturePrintSnapshot(livePreview.doc))
          : await renderPrintSnapshot(url);
      snapshotsRef.current.set(url, snapshot);
      const headers = new Headers({
        Accept: 'application/json',
        'X-CSRF-Token': docxCsrfToken,
        'Content-Type': 'application/octet-stream',
      });
      const response = await fetch(`${base}/docx?${search}&document=assessment`, {
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
      receiveExport(z.object({ printExportId: IdSchema }).parse(await response.json()));
    },
    onError: (error: Error) => markStaleSnapshot(error),
  });
  const onPreviewState = useCallback(
    (state: PreviewState) => {
      setPreview({ url: previewUrl, state });
      if (state.status === 'ready') setSnapshotStale(false);
      if (state.status !== 'loading') setPreviewPending(false);
    },
    [previewUrl],
  );
  const onSnapshotReady = useCallback(
    (snapshot: PrintSnapshot, doc: Document) => {
      snapshotsRef.current.set(previewUrl, snapshot);
      previewDocumentRef.current = { url: previewUrl, doc };
    },
    [previewUrl],
  );
  const currentPreview = preview?.url === previewUrl ? preview.state : null;
  const omitted = new Map(
    currentPreview?.status === 'ready'
      ? currentPreview.warnings.map((warning) => [warning.question_number, warning.message])
      : [],
  );
  const includedQuestions = questions.data?.filter(
    (question) => !excludedQuestionNumbers.has(question.number),
  );
  const includedOmittedCount =
    includedQuestions?.filter((question) => omitted.has(question.number)).length ?? 0;
  const reviewCount =
    includedQuestions?.filter(
      (question) => question.concerns.length || omitted.has(question.number),
    ).length ?? 0;
  const noQuestionsSelected = questions.isSuccess && includedQuestions?.length === 0;
  const previewHasError =
    currentPreview?.status === 'error' ||
    omitted.size > 0 ||
    snapshotStale ||
    exportNeedsNewPreview;
  const canDownload =
    validForm &&
    !isDirty &&
    currentPreview?.status === 'ready' &&
    currentPreview.questions > 0 &&
    omitted.size === 0 &&
    !snapshotStale &&
    !exportNeedsNewPreview &&
    !exportPending &&
    !download.isPending &&
    !busy;

  async function downloadBooklet(studentCount: number) {
    setCopies(studentCount);
    booklet.reset();
    try {
      receiveExport(
        await booklet.mutateAsync(
          await preparePdfInput(packetMetadata(formIds, studentCount, 'booklet'), 'booklet'),
        ),
      );
      setShowBookletModal(false);
    } catch (error) {
      markStaleSnapshot(error);
      throw error;
    }
  }

  async function applySettings(values: PrintSettings) {
    values = {
      ...values,
      identityFields: values.includeCoverPage
        ? PrintIdentityFieldsTextSchema.parse(values.identityFields)
        : values.identityFields,
    };
    setPreviewPending(true);
    setPreview(null);
    snapshotsRef.current.clear();
    if (exportNeedsNewPreview) void setExportId(null);
    packet.reset();
    booklet.reset();
    download.reset();
    setPdfPreparationError(null);
    try {
      if (!formId) {
        const result = await create.mutateAsync();
        if (selectedForms !== null) void setSelectedForms([result.printFormId]);
        void setSelectedForm(result.printFormId);
        setFormSettings((previous) => ({ ...previous, [result.printFormId]: values }));
      } else if (printLayoutSearch(values) === printLayoutSearch(settings)) {
        await questions.refetch();
      }
      if (formId) setFormSettings((previous) => ({ ...previous, [formId]: values }));
      setSettings(values);
      reset(values);
      setRetry((value) => value + 1);
    } catch (error) {
      setPreviewPending(false);
      throw error;
    }
  }

  return (
    <div className="print-preparation">
      <a
        className="small mb-3 align-self-start"
        href={`/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/questions`}
      >
        <i className="bi bi-arrow-left me-1" aria-hidden="true" /> Back to Questions
      </a>
      <h1 className="h4 mb-3">Print assessment</h1>
      <AppErrorAlert
        error={getAppError<PrintFormsError['create']>(create.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => create.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['list']>(forms.error)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['regenerate']>(regenerate.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => regenerate.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintFormsError['archive']>(archive.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => archive.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintableAssessmentExportError['pdf']>(
          pdfPreparationError?.target === 'packet' ? pdfPreparationError.error : packet.error,
        )}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          packet.reset();
          setPdfPreparationError(null);
        }}
      />
      {exportId && (
        <Alert
          variant={
            exportStatus.data?.status === 'failed' || exportStatus.isError ? 'danger' : 'info'
          }
        >
          {exportStatus.data?.status === 'succeeded' ? (
            <a href={exportStatus.data.downloadUrl ?? undefined}>
              Download {exportStatus.data.label ?? 'prepared file'}
              {exportStatus.data.sizeBytes !== null &&
                ` (${filesize(exportStatus.data.sizeBytes, { base: 10, round: 1 })})`}
            </a>
          ) : exportStatus.data?.status === 'failed' ? (
            (exportStatus.data.failureMessage ??
            'The file could not be prepared because of a server error.')
          ) : exportStatus.isError ? (
            'Could not check the file preparation status. Refresh the page to try again.'
          ) : exportStatus.data?.status === 'expired' ? (
            'This file is no longer available. Prepare it again.'
          ) : (
            'Preparing your file in the background. You can return to this page to download it within 24 hours.'
          )}
          {!exportPending && (
            <Button
              variant="link"
              size="sm"
              className="ms-2 p-0"
              onClick={() => {
                void setExportId(null);
              }}
            >
              Dismiss
            </Button>
          )}
        </Alert>
      )}
      {groupWork && (
        <Alert variant="info">
          Creating printable forms for group assessments is not supported yet.
        </Alert>
      )}
      {!renderingAvailable && (
        <Alert variant="warning">
          PDF downloads are not configured on this server. Word downloads may require them for some
          figures.
        </Alert>
      )}
      {savedFormIds.some((id) => !forms.data.some((form) => form.id === id)) && (
        <Alert variant="danger">
          Unavailable forms were removed from the selection. Review the remaining forms or create a
          new preview.
        </Alert>
      )}
      {savedFormIds.some((id) => archivedForms.some((form) => form.id === id)) && (
        <Alert variant="info">Archived forms were removed from the current selection.</Alert>
      )}
      {reviewCount > 0 && (
        <Alert
          variant={includedOmittedCount > 0 ? 'danger' : 'warning'}
          className="d-flex flex-wrap align-items-center justify-content-between gap-2"
        >
          <span>
            {includedOmittedCount > 0
              ? `${includedOmittedCount} ${includedOmittedCount === 1 ? 'question' : 'questions'} could not be included. Fix or deselect ${includedOmittedCount === 1 ? 'it' : 'them'} before downloading.`
              : `${reviewCount} ${reviewCount === 1 ? 'question' : 'questions'} may need adjustments for paper.`}
          </span>
          <Button
            type="button"
            variant="link"
            className="p-0"
            onClick={() =>
              window.document
                .getElementById('print-preparation-questions')
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          >
            Review questions
          </Button>
        </Alert>
      )}
      <form
        className="print-preparation-form"
        noValidate
        onSubmit={(event) => {
          void handleSubmit(applySettings)(event).catch(() => {});
        }}
      >
        <fieldset
          className="print-preparation-columns"
          disabled={isSubmitting || busy || download.isPending}
        >
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
                      Each form saves its own questions and randomization. Select a form to preview
                      it. Copies cycle through these forms in order.
                    </p>
                    <div className="d-flex flex-column gap-2" role="group" aria-label="Print forms">
                      {formIds.map((id) => {
                        const label = formLabel(id);
                        return (
                          <div key={id} className="d-flex align-items-center gap-2">
                            <Button
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
                            <OverlayTrigger
                              placement="top"
                              tooltip={{
                                props: { id: `print-regenerate-${id}` },
                                body: `Regenerate Form ${label} with new randomization`,
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
                                  groupWork ||
                                  !hasRandomization
                                }
                                onClick={() => void regenerateForm(id).catch(() => {})}
                              >
                                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                              </Button>
                            </OverlayTrigger>
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
                              onClick={() => void archiveForm(id).catch(() => {})}
                            >
                              <i className="bi bi-x-lg" aria-hidden="true" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline-primary"
                      size="sm"
                      className="mt-3"
                      disabled={
                        busy ||
                        isDirty ||
                        isSubmitting ||
                        download.isPending ||
                        groupWork ||
                        !hasRandomization ||
                        activeForms.length >= MAX_ACTIVE_PRINT_FORMS
                      }
                      onClick={() => void addForm().catch(() => {})}
                    >
                      <i className="bi bi-plus-lg me-2" aria-hidden="true" /> Add form
                    </Button>
                    {isDirty && (
                      <p className="small text-muted mt-2 mb-0">
                        Update the preview to apply your changes before switching forms.
                      </p>
                    )}
                    <p className="small text-muted mt-2 mb-0">
                      Regenerate creates a newly labeled form and archives the original. Previous
                      forms remain available below.
                    </p>
                  </Card.Body>
                </Card>
              )}
              {archivedForms.length > 0 && (
                <Card className="mb-3">
                  <Card.Body>
                    <details>
                      <summary className="h6 mb-0">Previous forms ({archivedForms.length})</summary>
                      <p className="small text-muted mt-2 mb-2">
                        Saved questions and variants remain available. Reapply the original print
                        settings when exporting an older answer key.
                      </p>
                      <div className="d-flex flex-column gap-2">
                        {archivedForms.map((form) => (
                          <Button
                            key={form.id}
                            type="button"
                            size="sm"
                            variant={form.id === formId ? 'secondary' : 'outline-secondary'}
                            className="text-start"
                            disabled={busy || isDirty || isSubmitting || download.isPending}
                            onClick={() => {
                              switchForm(form.id);
                              switchDocument('answer_key');
                            }}
                          >
                            View Form {form.label} answer key
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
                      defaultValue={DEFAULT_PRINT_SETTINGS.paperSize}
                      {...register('paperSize')}
                    >
                      <option value="Letter">US Letter · 8.5 × 11 in</option>
                      <option value="A4">A4 · 210 × 297 mm</option>
                    </Form.Select>
                  </Form.Group>
                  <Form.Group controlId="print-block-size">
                    <Form.Label>Space per question</Form.Label>
                    <Form.Select
                      defaultValue={DEFAULT_PRINT_SETTINGS.blockSize}
                      {...register('blockSize')}
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
                    defaultChecked={DEFAULT_PRINT_SETTINGS.includeCoverPage}
                    {...register('includeCoverPage')}
                  />
                  {includeCoverPage && (
                    <Form.Group controlId="print-identity-fields">
                      <Form.Label>Additional student information</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        defaultValue={DEFAULT_PRINT_SETTINGS.identityFields}
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
                    </Form.Group>
                  )}
                  {includeCoverPage && (
                    <Form.Check
                      id="print-grading-table"
                      className="mt-3"
                      label="Include grading table"
                      defaultChecked={DEFAULT_PRINT_SETTINGS.includeGradingTable}
                      {...register('includeGradingTable')}
                    />
                  )}
                  {includeCoverPage && (
                    <div className="mt-3">
                      <Form.Check
                        id="print-honor-code"
                        label="Include academic integrity pledge"
                        aria-describedby="print-honor-code-help"
                        defaultChecked={defaultSettings.includeHonorCode}
                        {...register('includeHonorCode')}
                      />
                      <Form.Text id="print-honor-code-help">
                        Uses the assessment’s honor code, or the standard pledge if none is
                        configured.
                      </Form.Text>
                    </div>
                  )}
                  <Form.Group controlId="print-cover-pages" className="mt-3">
                    <Form.Label>Custom cover pages (PDF)</Form.Label>
                    <Form.Control
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={packet.isPending || download.isPending}
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
                            'Files were not added. Use up to 10 PDFs, totaling no more than 10 MB.',
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
                      exclude uploaded pages. Up to {MAX_COVER_FILES} PDFs, 10 MB total, and{' '}
                      {MAX_COVER_PAGES} pages.
                    </Form.Text>
                  </Form.Group>
                  {coverPages.length > 0 && (
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
                                disabled={packet.isPending || download.isPending}
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
                        Files are kept in this tab until export. Re-add them if you reload the page.
                        Download the booklet PDF to inspect all student copies with their uploaded
                        pages.
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
                        Review flags are suggestions based on question content. Check the preview
                        for layout and complete instructions.
                      </p>
                    </div>
                    {reviewCount > 0 && (
                      <Form.Check
                        type="switch"
                        id="print-review-only"
                        label={`Show only items to review (${reviewCount})`}
                        checked={reviewOnly}
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
                      printed. Fix or deselect {includedOmittedCount === 1 ? 'it' : 'them'} before
                      printing the assessment.
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
                          role="group"
                          aria-label={`Question ${question.number}: ${question.title}`}
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
                            onChange={(event) => {
                              setValue(
                                'excludedQuestions',
                                event.target.checked
                                  ? excludedQuestions.filter((number) => number !== question.number)
                                  : [...excludedQuestions, question.number].sort((a, b) =>
                                      a.localeCompare(b, undefined, { numeric: true }),
                                    ),
                                { shouldDirty: true },
                              );
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
                              disabled={!!error || excluded}
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
                              disabled={!!error || excluded}
                              aria-label={`Spacing for question ${question.number}`}
                              value={questionSizes[question.number] ?? ''}
                              onChange={(event) => {
                                // Homework labels contain dots, which register() treats as nested paths.
                                setValue(
                                  'questionSizes',
                                  {
                                    ...questionSizes,
                                    [question.number]: event.target
                                      .value as PrintSettings['questionSizes'][string],
                                  },
                                  { shouldDirty: true },
                                );
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
                              aria-label={`Edit question ${question.number} (opens in a new tab)`}
                            >
                              Edit question
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
            <div className="print-preparation-actions">
              {noQuestionsSelected && (
                <p className="small text-danger mb-2" role="alert">
                  Select at least one question to prepare an assessment.
                </p>
              )}
              <Button
                type="submit"
                className="w-100"
                disabled={
                  isSubmitting ||
                  busy ||
                  noQuestionsSelected ||
                  (!!formId && !isDirty && !previewHasError) ||
                  (groupWork && !formId)
                }
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
                        disabled={isDirty || (formIds.length < 2 && !archivedPreviewForm)}
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
                      onClick={() => switchDocument('assessment')}
                    >
                      Student copy
                    </Button>
                    <Button
                      type="button"
                      variant={document === 'answer_key' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'answer_key'}
                      onClick={() => switchDocument('answer_key')}
                    >
                      Answer key
                    </Button>
                  </ButtonGroup>
                </div>
                <div className="small text-muted d-flex align-items-center gap-3">
                  {currentPreview?.status === 'ready' && (
                    <span role="status">
                      {currentPreview.pages} {currentPreview.pages === 1 ? 'page' : 'pages'} ·{' '}
                      {currentPreview.questions}{' '}
                      {currentPreview.questions === 1 ? 'question' : 'questions'} ·{' '}
                      {currentPreview.points} {currentPreview.points === 1 ? 'point' : 'points'}
                    </span>
                  )}
                  {validForm && (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open preview in a new tab"
                    >
                      <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </Card.Header>
              {isDirty && (
                <div className="px-3 py-2 bg-warning-subtle small" role="status">
                  The preview shows your last applied settings. Select Update preview to see your
                  changes or download files.
                </div>
              )}
              {validForm ? (
                <PrintPreview
                  key={`${previewUrl}:${retry}`}
                  url={previewUrl}
                  document={document}
                  paperWidth={settings.paperSize === 'Letter' ? 816 : 794}
                  selectedQuestion={selectedQuestion}
                  onStateChange={onPreviewState}
                  onSnapshotReady={onSnapshotReady}
                />
              ) : (
                <div className="print-preparation-empty">
                  <i
                    className="bi bi-file-earmark-text display-4 text-primary mb-3"
                    aria-hidden="true"
                  />
                  <h3 className="h5">Your printable assessment starts here</h3>
                  <p className="text-muted mb-0">
                    Choose your layout, then create a preview.
                    <br />
                    Review the questions before downloading.
                  </p>
                </div>
              )}
              <Card.Footer className="bg-white p-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                  <div className="print-preparation-download-help text-muted small">
                    Word exports exclude uploaded cover pages. Formatting and page breaks may differ
                    from the preview and between apps.
                  </div>
                  <div className="position-relative ms-auto flex-shrink-0">
                    <div
                      className={clsx('print-preparation-download', {
                        invisible: download.isPending || packet.isPending,
                      })}
                    >
                      <Dropdown drop="up" align="end">
                        <Dropdown.Toggle id="print-download-menu" size="sm" disabled={!canDownload}>
                          <i className="bi bi-download me-2" aria-hidden="true" />
                          Download
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                          {downloadFormIds.map((id, index) => {
                            const label = formLabel(id);
                            const formName =
                              id === archivedPreviewForm?.id ? 'Previous Form' : 'Form';
                            return (
                              <Fragment key={id}>
                                {index > 0 && <Dropdown.Divider />}
                                <Dropdown.Item
                                  disabled={!renderingAvailable}
                                  onClick={() =>
                                    void downloadPacket([id], 1, 'assessment').catch(() => {})
                                  }
                                >
                                  Download {formName} {label} (PDF)
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => download.mutate(id)}>
                                  Download {formName} {label} Word (.docx)
                                </Dropdown.Item>
                                <Dropdown.Item
                                  disabled={!renderingAvailable}
                                  onClick={() =>
                                    void downloadPacket([id], 1, 'answer_key').catch(() => {})
                                  }
                                >
                                  Download {formName} {label} answer key (PDF)
                                </Dropdown.Item>
                              </Fragment>
                            );
                          })}
                          <Dropdown.Divider />
                          {formIds.length > 1 && (
                            <Dropdown.Item
                              disabled={!renderingAvailable}
                              onClick={() =>
                                void downloadPacket(formIds, formIds.length, 'assessment').catch(
                                  () => {},
                                )
                              }
                            >
                              Download all forms (PDF)
                            </Dropdown.Item>
                          )}
                          <Dropdown.Item
                            disabled={!renderingAvailable}
                            onClick={() => {
                              booklet.reset();
                              setPdfPreparationError(null);
                              setShowBookletModal(true);
                            }}
                          >
                            Download booklet PDF…
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>
                    {(download.isPending || packet.isPending || preparingPdf === 'packet') && (
                      <div
                        className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center small"
                        role="status"
                      >
                        <Spinner size="sm" className="me-2" aria-hidden="true" />
                        {preparingPdf === 'packet' && pdfPreparationProgress
                          ? `Preparing documents ${pdfPreparationProgress.completed} of ${pdfPreparationProgress.total}…`
                          : 'Generating…'}
                      </div>
                    )}
                  </div>
                </div>
                {download.isError && (
                  <Alert variant="danger" className="mt-2 mb-0">
                    {download.error.message}
                  </Alert>
                )}
              </Card.Footer>
            </Card>
          </div>
        </fieldset>
      </form>
      <BookletDownloadModal
        show={showBookletModal}
        students={copies}
        enrolledStudents={enrolledStudents}
        formLabels={formIds.map(formLabel)}
        pending={booklet.isPending || preparingPdf === 'booklet'}
        progress={preparingPdf === 'booklet' ? pdfPreparationProgress : null}
        error={
          pdfPreparationError?.target === 'booklet' ? pdfPreparationError.error : booklet.error
        }
        onHide={() => {
          setShowBookletModal(false);
          booklet.reset();
          setPdfPreparationError(null);
        }}
        onDownload={(students) => void downloadBooklet(students).catch(() => {})}
      />
    </div>
  );
}

import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { type ChangeEvent, Fragment, useCallback, useRef, useState } from 'react';
import { Alert, Badge, Button, ButtonGroup, Card, Dropdown, Form, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { NuqsAdapter, OverlayTrigger } from '@prairielearn/ui';

import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
  MAX_PRINT_INSTANCES,
} from '../../lib/client/print-packet.js';
import {
  BLOCK_SIZE_LABELS,
  DEFAULT_PRINT_SETTINGS,
  PrintIdentityFieldsTextSchema,
  type PrintSettings,
  printLayoutSearch,
} from '../../lib/client/print-preparation.js';
import {
  type PrintSnapshot,
  capturePrintSnapshot,
  renderPrintSnapshot,
} from '../../lib/client/print-snapshot.js';
import type { StaffAssessmentInstance } from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceUrl, getQuestionUrl } from '../../lib/client/url.js';
import type { PrintDocument } from '../../lib/printing.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';
import type { PrintableExamExportError } from '../../trpc/assessment/printable-exam-export.js';
import type { PrintableExamsError } from '../../trpc/assessment/printable-exams.js';

import { BookletDownloadModal } from './BookletDownloadModal.js';
import { type PreviewState, PrintPreview } from './PrintPreview.js';

interface PrintPreparationProps {
  assessmentId: string;
  courseInstanceId: string;
  hasRandomization: boolean;
  groupWork: boolean;
  requireHonorCode: boolean;
  instances: StaffAssessmentInstance[];
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
  instances: initialInstances,
  defaultCopies,
  renderingAvailable,
  docxCsrfToken,
}: PrintPreparationProps) {
  const trpc = useTRPC();
  const instances = useQuery(
    trpc.printableExams.list.queryOptions(undefined, { initialData: initialInstances }),
  );
  const [selectedInstance, setSelectedInstance] = useQueryState('instance', parseAsString);
  const [selectedInstances, setSelectedInstances] = useQueryState(
    'instances',
    parseAsArrayOf(parseAsString),
  );
  const savedInstanceIds =
    selectedInstances ??
    [selectedInstance ?? initialInstances.at(0)?.id].filter((id): id is string => !!id);
  const availableInstanceIds = [...new Set(savedInstanceIds)]
    .filter((id) => instances.data.some((instance) => instance.id === id))
    .slice(0, MAX_PRINT_INSTANCES);
  const instanceIds = hasRandomization ? availableInstanceIds : availableInstanceIds.slice(0, 1);
  const instanceId =
    selectedInstance && instanceIds.includes(selectedInstance)
      ? selectedInstance
      : (instanceIds.at(0) ?? null);
  const formLabel = String.fromCharCode(65 + Math.max(0, instanceIds.indexOf(instanceId ?? '')));
  const [instanceSettings, setInstanceSettings] = useState<Partial<Record<string, PrintSettings>>>(
    {},
  );
  const [coverPages, setCoverPages] = useState<{ id: string; file: File }[]>([]);
  const [copies, setCopies] = useState(defaultCopies);
  const [showBookletModal, setShowBookletModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const validInstance = instances.data.some((instance) => instance.id === instanceId);
  const [document, setDocument] = useState<PrintDocument>('exam');
  const defaultSettings = { ...DEFAULT_PRINT_SETTINGS, includeHonorCode: requireHonorCode };
  const [settings, setSettings] = useState<PrintSettings>(defaultSettings);
  const [selectedQuestion, setSelectedQuestion] = useState<{ number: string } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [preview, setPreview] = useState<{ url: string; state: PreviewState } | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState<'packet' | 'booklet' | null>(null);
  const [pdfPreparationError, setPdfPreparationError] = useState<{
    target: 'packet' | 'booklet';
    error: Error;
  } | null>(null);
  const snapshotsRef = useRef(new Map<string, PrintSnapshot>());
  const previewDocumentRef = useRef<{ url: string; doc: Document } | null>(null);
  const [retry, setRetry] = useState(0);
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
  const layout = `${printLayoutSearch(settings)}&form_label=${formLabel}`;
  const paperBase = instanceId
    ? `${getAssessmentInstanceUrl({ courseInstanceId, assessmentInstanceId: instanceId })}/paper`
    : '';
  const previewUrl = `${paperBase}/preview?${layout}&document=${document}`;
  const questions = useQuery(
    trpc.printableExams.questions.queryOptions(
      { assessmentInstanceId: instanceId ?? '1' },
      { enabled: validInstance },
    ),
  );
  const create = useMutation(
    trpc.printableExams.create.mutationOptions({
      onSuccess: async () => {
        await instances.refetch();
      },
    }),
  );
  const regenerate = useMutation(
    trpc.printableExams.regenerate.mutationOptions({
      onSuccess: async () => {
        await instances.refetch();
      },
    }),
  );
  const packet = useMutation(trpc.printableExamExport.pdf.mutationOptions());
  const booklet = useMutation(trpc.printableExamExport.pdf.mutationOptions());
  const busy =
    create.isPending ||
    regenerate.isPending ||
    packet.isPending ||
    booklet.isPending ||
    preparingPdf !== null ||
    previewPending;

  function saveDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function settingsForInstance(id: string, appliedSettings = settings): PrintSettings {
    return {
      ...appliedSettings,
      identityFields: appliedSettings.includeCoverPage ? appliedSettings.identityFields : '',
      questionSizes:
        id === instanceId
          ? appliedSettings.questionSizes
          : (instanceSettings[id]?.questionSizes ?? {}),
      excludedQuestions:
        id === instanceId
          ? appliedSettings.excludedQuestions
          : (instanceSettings[id]?.excludedQuestions ?? []),
    };
  }

  function packetMetadata(
    ids: string[],
    copyCount: number,
    outputDocument: PrintDocument | 'booklet',
    appliedSettings = settings,
  ) {
    return {
      instances: ids.map((id) => ({
        assessmentInstanceId: id,
        formLabel: String.fromCharCode(65 + instanceIds.indexOf(id)),
        settings: settingsForInstance(id, appliedSettings),
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
    const base = `${getAssessmentInstanceUrl({ courseInstanceId, assessmentInstanceId: id })}/paper`;
    const url = `${base}/preview?${printLayoutSearch(appliedSettings)}&form_label=${label}&document=${printDocument}`;
    const cached = snapshotsRef.current.get(url);
    if (cached) return cached;
    const snapshot = await renderPrintSnapshot(url);
    snapshotsRef.current.set(url, snapshot);
    return snapshot;
  }

  async function packetInput(metadata: ReturnType<typeof packetMetadata>) {
    const input = new FormData();
    input.set('metadata', JSON.stringify(metadata));
    for (const { file } of coverPages) input.append('coverPages', file);
    for (const [index, instance] of metadata.instances.entries()) {
      for (const printDocument of metadata.document === 'booklet'
        ? (['exam', 'answer_key'] as const)
        : ([metadata.document] as PrintDocument[])) {
        if (printDocument === 'exam' && index >= metadata.copies) continue;
        const snapshot = await snapshotFor(
          instance.assessmentInstanceId,
          instance.formLabel,
          instance.settings,
          printDocument,
        );
        input.append(
          'pages',
          new File([snapshot.html], `form-${instance.formLabel}-${printDocument}.html`),
        );
      }
    }
    return input;
  }

  async function preparePdfInput(
    metadata: ReturnType<typeof packetMetadata>,
    target: 'packet' | 'booklet',
  ) {
    setPdfPreparationError(null);
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
    }
  }

  function savePdf(result: { base64: string; filename: string }) {
    const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
    saveDownload(new Blob([bytes], { type: 'application/pdf' }), result.filename);
  }

  async function downloadPacket(
    ids: string[],
    copyCount: number,
    outputDocument: PrintDocument | 'booklet',
  ) {
    packet.reset();
    const result = await packet.mutateAsync(
      await preparePdfInput(packetMetadata(ids, copyCount, outputDocument), 'packet'),
    );
    savePdf(result);
  }

  function switchDocument(next: PrintDocument) {
    if (next === document) return;
    setDocument(next);
    setPreview(null);
  }

  function switchInstance(id: string) {
    if (id === instanceId) return;

    void setSelectedInstance(id);
    const next = { ...settingsForInstance(id), identityFields: settings.identityFields };
    setSettings(next);
    reset(next);
    setSelectedQuestion(null);
    setPreview(null);
  }

  async function addInstance() {
    const result = await create.mutateAsync();
    void setSelectedInstances([...instanceIds, result.assessmentInstanceId]);
    switchInstance(result.assessmentInstanceId);
  }

  async function regenerateInstance(id: string) {
    const result = await regenerate.mutateAsync({ assessmentInstanceId: id });
    void setSelectedInstances(
      instanceIds.map((value) => (value === id ? result.assessmentInstanceId : value)),
    );
    switchInstance(result.assessmentInstanceId);
  }

  function removeInstance(id: string) {
    const nextIds = instanceIds.filter((value) => value !== id);
    void setSelectedInstances(nextIds);
    if (id === instanceId) switchInstance(nextIds[0]);
  }
  const download = useMutation({
    mutationFn: async (id: string) => {
      const label = String.fromCharCode(65 + instanceIds.indexOf(id));
      const base = `${getAssessmentInstanceUrl({ courseInstanceId, assessmentInstanceId: id })}/paper`;
      const appliedSettings = settingsForInstance(id);
      const search = `${printLayoutSearch(appliedSettings)}&form_label=${label}`;
      const url = `${base}/preview?${search}&document=exam`;
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
      const response = await fetch(`${base}/docx?${search}&document=exam`, {
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
      saveDownload(await response.blob(), `assessment-form-${label}.docx`);
    },
  });
  const onPreviewState = useCallback(
    (state: PreviewState) => {
      setPreview({ url: previewUrl, state });
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
  const previewHasError = currentPreview?.status === 'error' || omitted.size > 0;
  const canDownload =
    validInstance &&
    !isDirty &&
    currentPreview?.status === 'ready' &&
    currentPreview.questions > 0 &&
    omitted.size === 0 &&
    !download.isPending &&
    !busy;

  async function downloadBooklet(studentCount: number) {
    setCopies(studentCount);
    booklet.reset();
    savePdf(
      await booklet.mutateAsync(
        await preparePdfInput(packetMetadata(instanceIds, studentCount, 'booklet'), 'booklet'),
      ),
    );
    setShowBookletModal(false);
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
    try {
      if (!instanceId) {
        const result = await create.mutateAsync();
        void setSelectedInstances([result.assessmentInstanceId]);
        void setSelectedInstance(result.assessmentInstanceId);
        setInstanceSettings((previous) => ({ ...previous, [result.assessmentInstanceId]: values }));
      } else if (printLayoutSearch(values) === printLayoutSearch(settings)) {
        await questions.refetch();
      }
      if (instanceId) setInstanceSettings((previous) => ({ ...previous, [instanceId]: values }));
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
        error={getAppError<PrintableExamsError['create']>(create.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => create.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintableExamsError['list']>(instances.error)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      <AppErrorAlert
        error={getAppError<PrintableExamsError['regenerate']>(regenerate.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => regenerate.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintableExamExportError['pdf']>(
          pdfPreparationError?.target === 'packet' ? pdfPreparationError.error : packet.error,
        )}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => {
          packet.reset();
          setPdfPreparationError(null);
        }}
      />
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
      {savedInstanceIds.some((id) => !instances.data.some((instance) => instance.id === id)) && (
        <Alert variant="danger">
          Unavailable forms were removed from the selection. Review the remaining forms or create a
          new preview.
        </Alert>
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
              {hasRandomization && (
                <Card className="mb-3">
                  <Card.Body>
                    <h2 className="h6 mb-2">Assessment instances</h2>
                    <p className="small text-muted">
                      Each form is a different randomized instance of this assessment. Select a form
                      to preview it. Copies cycle through these forms in order.
                    </p>
                    <div
                      className="d-flex flex-column gap-2"
                      role="group"
                      aria-label="Assessment instances"
                    >
                      {instanceIds.map((id, index) => {
                        const label = String.fromCharCode(65 + index);
                        return (
                          <div key={id} className="d-flex align-items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="flex-grow-1 text-start"
                              variant={id === instanceId ? 'primary' : 'outline-secondary'}
                              aria-pressed={id === instanceId}
                              disabled={busy || isDirty || isSubmitting || download.isPending}
                              onClick={() => void switchInstance(id)}
                            >
                              Form {label}
                              {id === instanceId && <span className="float-end">Previewing</span>}
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
                                  busy || isDirty || isSubmitting || download.isPending || groupWork
                                }
                                onClick={() => void regenerateInstance(id).catch(() => {})}
                              >
                                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                              </Button>
                            </OverlayTrigger>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline-secondary"
                              aria-label={`Remove Form ${label}`}
                              disabled={
                                instanceIds.length === 1 ||
                                busy ||
                                isDirty ||
                                isSubmitting ||
                                download.isPending
                              }
                              onClick={() => void removeInstance(id)}
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
                        instanceIds.length >= MAX_PRINT_INSTANCES
                      }
                      onClick={() => void addInstance().catch(() => {})}
                    >
                      <i className="bi bi-plus-lg me-2" aria-hidden="true" /> Add assessment
                      instance
                    </Button>
                    {isDirty && (
                      <p className="small text-muted mt-2 mb-0">
                        Update the preview to apply your changes before switching forms.
                      </p>
                    )}
                    <p className="small text-muted mt-2 mb-0">
                      Regenerate replaces that form with new randomization. Review its questions and
                      selections again before printing.
                    </p>
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
                      Every printed copy includes all uploaded pages, in this order, before the
                      questions{includeCoverPage ? ' and after the default cover' : ''}. Up to{' '}
                      {MAX_COVER_FILES} PDFs, 10 MB total, and {MAX_COVER_PAGES} pages.
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
              {validInstance && (
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
                    error={getAppError<PrintableExamsError['questions']>(questions.error)}
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
                      {includedOmittedCount === 1 ? 'question was' : 'questions were'} omitted
                      because of rendering errors. Fix or deselect{' '}
                      {includedOmittedCount === 1 ? 'it' : 'them'} before printing the assessment.
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
                  (!!instanceId && !isDirty && !previewHasError) ||
                  (groupWork && !instanceId)
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
                    {instanceId ? 'Update preview' : 'Create preview'}
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
                    {hasRandomization && (
                      <Form.Select
                        size="sm"
                        className="w-auto"
                        aria-label="Preview form"
                        value={instanceId ?? ''}
                        disabled={isDirty || instanceIds.length < 2}
                        onChange={(event) => switchInstance(event.target.value)}
                      >
                        {instanceIds.length === 0 && <option value="">Form A</option>}
                        {instanceIds.map((id, index) => (
                          <option key={id} value={id}>
                            Form {String.fromCharCode(65 + index)}
                          </option>
                        ))}
                      </Form.Select>
                    )}
                  </div>
                  <ButtonGroup size="sm" aria-label="Preview document">
                    <Button
                      type="button"
                      variant={document === 'exam' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'exam'}
                      onClick={() => switchDocument('exam')}
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
                  {validInstance && (
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
              {validInstance ? (
                <PrintPreview
                  key={`${previewUrl}:${retry}`}
                  url={previewUrl}
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
                          {instanceIds.map((id, index) => {
                            const label = String.fromCharCode(65 + index);
                            return (
                              <Fragment key={id}>
                                {index > 0 && <Dropdown.Divider />}
                                <Dropdown.Item
                                  disabled={!renderingAvailable}
                                  onClick={() =>
                                    void downloadPacket([id], 1, 'exam').catch(() => {})
                                  }
                                >
                                  Download Form {label} (PDF)
                                </Dropdown.Item>
                                <Dropdown.Item onClick={() => download.mutate(id)}>
                                  Download Form {label} Word (.docx)
                                </Dropdown.Item>
                                <Dropdown.Item
                                  disabled={!renderingAvailable}
                                  onClick={() =>
                                    void downloadPacket([id], 1, 'answer_key').catch(() => {})
                                  }
                                >
                                  Download Form {label} answer key (PDF)
                                </Dropdown.Item>
                              </Fragment>
                            );
                          })}
                          <Dropdown.Divider />
                          {instanceIds.length > 1 && (
                            <Dropdown.Item
                              disabled={!renderingAvailable}
                              onClick={() =>
                                void downloadPacket(instanceIds, instanceIds.length, 'exam').catch(
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
                        Generating…
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
        formLabels={instanceIds.map((_, index) => String.fromCharCode(65 + index))}
        pending={booklet.isPending || preparingPdf === 'booklet'}
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

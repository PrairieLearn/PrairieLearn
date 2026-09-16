import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useState } from 'react';
import { Alert, Badge, Button, ButtonGroup, Card, Form, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { NuqsAdapter } from '@prairielearn/ui';

import {
  BLOCK_SIZE_LABELS,
  DEFAULT_PRINT_SETTINGS,
  type PrintDocument,
  type PrintSettings,
  printIdentityFields,
  printLayoutSearch,
} from '../../lib/client/print-preparation.js';
import type { StaffAssessmentInstance } from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';
import type { PrintableExamsError } from '../../trpc/assessment/printable-exams.js';

import { type PreviewState, PrintPreview } from './PrintPreview.js';

interface PrintPreparationProps {
  assessmentId: string;
  courseInstanceId: string;
  multipleInstance: boolean;
  groupWork: boolean;
  instances: StaffAssessmentInstance[];
  timezone: string;
  renderingAvailable: boolean;
  trpcCsrfToken: string;
  search: string;
}

const PrintDescriptorSchema = z.object({
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      question_number: z.string().optional(),
    }),
  ),
});

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
  courseInstanceId,
  multipleInstance,
  groupWork,
  instances: initialInstances,
  timezone,
  renderingAvailable,
}: PrintPreparationProps) {
  const trpc = useTRPC();
  const instances = useQuery(
    trpc.printableExams.list.queryOptions(undefined, { initialData: initialInstances }),
  );
  const [selectedInstance, setSelectedInstance] = useQueryState('instance', parseAsString);
  const instanceId = selectedInstance ?? instances.data.at(0)?.id ?? null;
  const validInstance = instances.data.some((instance) => instance.id === instanceId);
  const [document, setDocument] = useState<PrintDocument>('exam');
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [selectedQuestion, setSelectedQuestion] = useState<{ number: string } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [preview, setPreview] = useState<{ url: string; state: PreviewState } | null>(null);
  const [retry, setRetry] = useState(0);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PrintSettings>({ defaultValues: DEFAULT_PRINT_SETTINGS });
  const layout = printLayoutSearch(settings);
  const paperBase = instanceId
    ? `${getAssessmentInstanceUrl({ courseInstanceId, assessmentInstanceId: instanceId })}/paper`
    : '';
  const previewUrl = `${paperBase}/preview?${layout}&document=${document}`;
  const descriptor = useQuery({
    queryKey: ['print-preparation', paperBase, layout],
    enabled: validInstance,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${paperBase}?${layout}`, { signal });
      if (!response.ok) {
        throw new Error('Could not prepare this exam. Check the selected form and try again.');
      }
      return PrintDescriptorSchema.parse(await response.json());
    },
  });
  const questions = useQuery(
    trpc.printableExams.questions.queryOptions(
      { assessmentInstanceId: instanceId ?? '1' },
      { enabled: validInstance },
    ),
  );
  const create = useMutation(trpc.printableExams.create.mutationOptions());
  const download = useMutation({
    mutationFn: async ({
      format,
      document: outputDocument,
    }: {
      format: 'pdf' | 'docx';
      document: PrintDocument;
    }) => {
      const response = await fetch(`${paperBase}/${format}?${layout}&document=${outputDocument}`);
      if (!response.ok) {
        throw new Error('The download could not be generated. Review the preview and try again.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `exam-form-${instanceId}${outputDocument === 'answer_key' ? '-answer-key' : ''}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
  const onPreviewState = useCallback(
    (state: PreviewState) => setPreview({ url: previewUrl, state }),
    [previewUrl],
  );
  const currentPreview = preview?.url === previewUrl ? preview.state : null;
  const omitted = new Map(
    descriptor.data?.warnings
      .filter((warning) => warning.question_number)
      .map((warning) => [warning.question_number, warning.message]),
  );
  const reviewCount =
    questions.data?.filter((question) => question.concerns.length || omitted.has(question.number))
      .length ?? 0;
  const canDownload =
    validInstance &&
    renderingAvailable &&
    !isDirty &&
    descriptor.isSuccess &&
    currentPreview?.status === 'ready' &&
    currentPreview.questions > 0 &&
    omitted.size === 0 &&
    !download.isPending;

  async function applySettings(values: PrintSettings) {
    setPreview(null);
    if (!instanceId) {
      const result = await create.mutateAsync();
      await instances.refetch();
      await setSelectedInstance(result.assessmentInstanceId);
    } else if (printLayoutSearch(values) === layout) {
      await Promise.all([descriptor.refetch(), questions.refetch()]);
    }
    setSettings(values);
    reset(values);
    setRetry((value) => value + 1);
  }

  return (
    <div className="print-preparation">
      <div className="d-flex align-items-start gap-3 mb-4">
        <span className="print-preparation-icon">
          <i className="bi bi-printer" aria-hidden="true" />
        </span>
        <div>
          <h1 className="h3 mb-1">Print preparation</h1>
          <p className="text-muted mb-0">
            Review your questions, arrange the paper, and download an exam with its matching answer
            key.
          </p>
        </div>
      </div>
      <AppErrorAlert
        error={getAppError<PrintableExamsError['create']>(create.error)}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => create.reset()}
      />
      <AppErrorAlert
        error={getAppError<PrintableExamsError['list']>(instances.error)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {groupWork && (
        <Alert variant="info">Creating printable forms for group exams is not supported yet.</Alert>
      )}
      {!renderingAvailable && (
        <Alert variant="warning">
          You can review the HTML preview, but PDF and Word downloads are not configured on this
          server.
        </Alert>
      )}
      {selectedInstance && !validInstance && (
        <Alert variant="danger">
          This saved form is not available. Choose one of your forms below.
        </Alert>
      )}
      {reviewCount > 0 && (
        <Alert
          variant={omitted.size > 0 ? 'danger' : 'warning'}
          className="d-flex flex-wrap align-items-center justify-content-between gap-2"
        >
          <span>
            {omitted.size > 0
              ? `${omitted.size} questions could not be included. Fix the rendering errors before downloading.`
              : `${reviewCount} questions may need adjustments for paper.`}
          </span>
          <Button
            type="button"
            variant="link"
            className="p-0"
            onClick={() =>
              window.document
                .getElementById('print-preparation-questions')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Review questions
          </Button>
        </Alert>
      )}
      <form
        onSubmit={(event) => {
          void handleSubmit(applySettings)(event).catch(() => {});
        }}
      >
        <div className="print-preparation-columns">
          <div className="print-preparation-controls">
            <Card className="mb-3">
              <Card.Body>
                <h2 className="h6 mb-3">Exam form</h2>
                {instances.data.length > 0 ? (
                  <Form.Group controlId="print-instance">
                    <Form.Label>Your saved forms</Form.Label>
                    <Form.Select
                      value={instanceId ?? ''}
                      onChange={(event) => {
                        void setSelectedInstance(event.target.value);
                        const next = { ...settings, questionSizes: {} };
                        setSettings(next);
                        reset(next);
                        setSelectedQuestion(null);
                      }}
                    >
                      {!validInstance && <option value={instanceId ?? ''}>Choose a form</option>}
                      {instances.data.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          Form {instance.id} ·{' '}
                          {instance.date
                            ? formatDateYMDHM(instance.date, timezone)
                            : `Version ${instance.number}`}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text>
                      Preview and downloads use the same questions and answer choices.
                    </Form.Text>
                  </Form.Group>
                ) : (
                  <p className="small text-muted mb-0">
                    Create a form to choose the question variants for your paper exam. Changing the
                    layout will keep those variants.
                  </p>
                )}
                {multipleInstance && instances.data.length > 0 && !groupWork && (
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 pb-0 small"
                    disabled={create.isPending}
                    onClick={() => {
                      create.mutate(undefined, {
                        onSuccess: async ({ assessmentInstanceId }) => {
                          await instances.refetch();
                          await setSelectedInstance(assessmentInstanceId);
                          const next = { ...settings, questionSizes: {} };
                          setSettings(next);
                          reset(next);
                        },
                      });
                    }}
                  >
                    Create another form
                  </Button>
                )}
              </Card.Body>
            </Card>
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
                <Form.Group controlId="print-identity-fields">
                  <Form.Label>Additional student information</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    defaultValue={DEFAULT_PRINT_SETTINGS.identityFields}
                    aria-describedby="print-identity-help"
                    aria-invalid={!!errors.identityFields}
                    aria-errormessage={errors.identityFields ? 'print-identity-error' : undefined}
                    isInvalid={!!errors.identityFields}
                    {...register('identityFields', {
                      validate: (value) => {
                        const fields = printIdentityFields(value);
                        if (fields.length > 6) return 'Use up to six additional fields.';
                        if (fields.some((field) => field.length > 40)) {
                          return 'Keep each field to 40 characters or fewer.';
                        }
                        if (
                          fields.some((field) => ['name', 'date'].includes(field.toLowerCase()))
                        ) {
                          return 'Name and Date are already included.';
                        }
                        if (
                          new Set(fields.map((field) => field.toLowerCase())).size !== fields.length
                        ) {
                          return 'Use each field only once.';
                        }
                        return true;
                      },
                    })}
                  />
                  <Form.Control.Feedback type="invalid" id="print-identity-error">
                    {errors.identityFields?.message}
                  </Form.Control.Feedback>
                  <Form.Text id="print-identity-help">
                    One label per line. Name and Date are always included. Instructions come from
                    the assessment.
                  </Form.Text>
                </Form.Group>
              </Card.Body>
            </Card>
            <Button
              type="submit"
              className="w-100"
              disabled={
                isSubmitting ||
                create.isPending ||
                (groupWork && !instanceId) ||
                (!!selectedInstance && !validInstance)
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
            <p className="small text-muted mt-2 mb-0">
              {isDirty
                ? 'Apply your changes before downloading.'
                : 'Layout choices apply to the exam and answer key.'}
            </p>
          </div>
          <div className="print-preparation-workspace">
            <Card className="print-preparation-preview-card">
              <Card.Header className="bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3">
                <div className="d-flex align-items-center gap-3">
                  <h2 className="h6 mb-0">Preview</h2>
                  <ButtonGroup size="sm" aria-label="Preview document">
                    <Button
                      type="button"
                      variant={document === 'exam' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'exam'}
                      onClick={() => setDocument('exam')}
                    >
                      Student exam
                    </Button>
                    <Button
                      type="button"
                      variant={document === 'answer_key' ? 'primary' : 'outline-secondary'}
                      aria-pressed={document === 'answer_key'}
                      onClick={() => setDocument('answer_key')}
                    >
                      Answer key
                    </Button>
                  </ButtonGroup>
                </div>
                <div className="small text-muted d-flex align-items-center gap-3">
                  {currentPreview?.status === 'ready' && (
                    <span role="status">
                      {currentPreview.pages} pages · {currentPreview.questions} questions ·{' '}
                      {currentPreview.points} points
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
                  changes.
                </div>
              )}
              {descriptor.isError ? (
                <Alert variant="danger" className="m-3">
                  {descriptor.error.message}{' '}
                  <Button type="button" variant="link" onClick={() => void descriptor.refetch()}>
                    Try again
                  </Button>
                </Alert>
              ) : validInstance && descriptor.isSuccess ? (
                <PrintPreview
                  key={`${previewUrl}:${retry}`}
                  url={previewUrl}
                  paperWidth={settings.paperSize === 'Letter' ? 816 : 794}
                  selectedQuestion={selectedQuestion}
                  onStateChange={onPreviewState}
                />
              ) : (
                <div className="print-preparation-empty">
                  {validInstance ? (
                    <>
                      <Spinner className="mb-3" />
                      <p role="status">Preparing your questions…</p>
                    </>
                  ) : (
                    <>
                      <i
                        className="bi bi-file-earmark-text display-4 text-primary mb-3"
                        aria-hidden="true"
                      />
                      <h3 className="h5">Your paper exam starts here</h3>
                      <p className="text-muted mb-0">
                        Choose your layout, then create a preview.
                        <br />
                        Review the questions before downloading.
                      </p>
                    </>
                  )}
                </div>
              )}
              <Card.Footer className="bg-white p-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                  <div>
                    <div className="fw-semibold small">
                      Download {document === 'exam' ? 'student exam' : 'answer key'}
                    </div>
                    <div className="text-muted small">
                      Word content stays editable; pagination may differ.
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <Button
                      type="button"
                      variant="outline-primary"
                      size="sm"
                      disabled={!canDownload}
                      onClick={() => download.mutate({ format: 'docx', document })}
                    >
                      <i className="bi bi-file-earmark-word me-2" aria-hidden="true" />
                      Word (.docx)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canDownload}
                      onClick={() => download.mutate({ format: 'pdf', document })}
                    >
                      <i className="bi bi-download me-2" aria-hidden="true" />
                      PDF
                    </Button>
                  </div>
                </div>
                {download.isPending && (
                  <div className="small mt-2" role="status">
                    <Spinner size="sm" className="me-2" />
                    Generating your download…
                  </div>
                )}
                {download.isError && (
                  <Alert variant="danger" className="mt-2 mb-0">
                    {download.error.message}
                  </Alert>
                )}
              </Card.Footer>
            </Card>
          </div>
        </div>
        {validInstance && (
          <Card className="mt-4" id="print-preparation-questions">
            <Card.Header className="bg-white d-flex flex-wrap align-items-center justify-content-between gap-3 py-3">
              <div>
                <h2 className="h5 mb-1">
                  Questions in this form{' '}
                  {questions.data && <span className="text-muted">({questions.data.length})</span>}
                </h2>
                <p className="small text-muted mb-0">
                  Review flags are suggestions based on question content. Check the preview for
                  layout and complete instructions.
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
            {omitted.size > 0 && (
              <Alert variant="danger" className="m-3">
                {omitted.size} {omitted.size === 1 ? 'question was' : 'questions were'} omitted
                because of rendering errors. Fix these questions before using the exam.
              </Alert>
            )}
            {questions.data
              ?.filter(
                (question) =>
                  !reviewOnly ||
                  reviewCount === 0 ||
                  question.concerns.length > 0 ||
                  omitted.has(question.number),
              )
              .map((question) => {
                const error = omitted.get(question.number);
                return (
                  <div
                    key={question.number}
                    className={clsx('print-preparation-question', error && 'bg-danger-subtle')}
                  >
                    <span className="print-preparation-question-number">{question.number}</span>
                    <div className="flex-grow-1">
                      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <Button
                          type="button"
                          variant="link"
                          className="p-0 text-start fw-semibold text-decoration-none"
                          disabled={!!error}
                          onClick={() => {
                            setSelectedQuestion({ number: question.number });
                            window.document
                              .querySelector('.print-preparation-preview-card')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        >
                          {question.title}
                        </Button>
                        <span className="text-muted small">{question.points} points</span>
                      </div>
                      <div className="small">
                        {error ? (
                          <>
                            <Badge bg="danger" className="me-2">
                              Omitted
                            </Badge>
                            {error}
                          </>
                        ) : question.concerns.length > 0 ? (
                          <>
                            <Badge bg="warning" text="dark" className="me-2">
                              Review for paper
                            </Badge>
                            <span>{question.concerns.join(' ')}</span>
                          </>
                        ) : (
                          <span className="text-muted">
                            <i className="bi bi-check2 me-1" aria-hidden="true" />
                            No paper-specific concerns detected
                          </span>
                        )}
                      </div>
                    </div>
                    <Form.Group
                      controlId={`print-question-space-${question.number}`}
                      className="print-preparation-question-space"
                    >
                      <Form.Label className="small mb-1">
                        Question {question.number} space
                      </Form.Label>
                      <Form.Select
                        size="sm"
                        disabled={!!error}
                        defaultValue=""
                        {...register(`questionSizes.${question.number}`)}
                      >
                        <option value="">Use overall setting</option>
                        {Object.entries(BLOCK_SIZE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Form.Select>
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
            {isDirty && (
              <Card.Footer className="d-flex justify-content-end">
                <Button type="submit" disabled={isSubmitting}>
                  Update preview
                </Button>
              </Card.Footer>
            )}
          </Card>
        )}
      </form>
    </div>
  );
}

import { type SubmitEvent, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';

import type { IRSourceBankRef } from '@prairielearn/question-conversion';

import {
  type CollisionStrategy,
  type CourseInstanceOption,
  type ParseWarning,
  type QuestionOverrides,
  type SerializedConversionResult,
  type SerializedQuestionOutput,
  type StrippedAccessRules,
  getUnresolvedSourceBankRefs,
  hasCanvasUnresolvedSourceBankRefs,
} from '../instructorQtiImport.types.js';

import { QuestionReviewPanel } from './QuestionReviewPanel.js';

function isRubricWarning(message: string): boolean {
  return message.includes('rubric') || message.includes('Rubric');
}

export const REMOTE_IMAGE_URL_WARNING = 'Question contains an image reference to a remote URL.';
const REMOTE_IMAGE_URL_SUMMARY =
  'One or more questions contain an image reference to a remote URL.';

function uniqueCanvasCourseIds(refs: IRSourceBankRef[]): string[] {
  return [...new Set(refs.flatMap((ref) => (ref.externalCourseId ? [ref.externalCourseId] : [])))];
}

function CanvasCourseIdList({ courseIds }: { courseIds: string[] }) {
  return (
    <ul className="mb-0">
      {courseIds.map((id) => (
        <li key={id}>
          Canvas course ID <strong>{id}</strong>{' '}
          <span className="text-muted">
            (find it at <code>/courses/{id}</code> on your Canvas instance)
          </span>
        </li>
      ))}
    </ul>
  );
}

function countReferencedBankQuestions(refs: IRSourceBankRef[]) {
  return refs.reduce((sum, ref) => sum + (ref.numberChoose ?? 1), 0);
}

function sourceBankRefKey(ref: IRSourceBankRef) {
  return ref.sourceBankExportId ?? ref.sourceBankRef;
}

function uniqueSourceBankRefs(refs: IRSourceBankRef[]): IRSourceBankRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = sourceBankRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function UnresolvedBankWarnings({ results }: { results: SerializedConversionResult[] }) {
  const refs = results.flatMap((result) => getUnresolvedSourceBankRefs(result));
  if (refs.length === 0) return null;

  const courseIds = uniqueCanvasCourseIds(refs);
  const isCanvasExport = hasCanvasUnresolvedSourceBankRefs(refs);

  return (
    <Alert variant="warning" className="mb-3">
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-exclamation-triangle-fill mt-1" aria-hidden="true" />
        <div>
          <strong>Some question banks were not resolved</strong>
          <p className="mb-2 mt-1">
            {refs.length} question bank reference{refs.length !== 1 ? 's' : ''} could not be matched
            to uploaded bank content. Those questions will not be imported unless you start over and
            upload {isCanvasExport ? 'a Canvas course export' : 'an export'} that contains the
            referenced banks.
          </p>
          {courseIds.length > 0 && (
            <>
              <p className="mb-1">Canvas identified these source courses:</p>
              <CanvasCourseIdList courseIds={courseIds} />
            </>
          )}
        </div>
      </div>
    </Alert>
  );
}

export function QuestionBankDeduplicationWarning({
  deduplicatedQuestionCount,
}: {
  deduplicatedQuestionCount: number;
}) {
  if (deduplicatedQuestionCount === 0) return null;

  return (
    <Alert variant="info" className="mb-3">
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-info-circle-fill mt-1" aria-hidden="true" />
        <div>
          <strong>Duplicate question bank questions were deduplicated</strong>
          <p className="mb-0 mt-1">
            {deduplicatedQuestionCount} question{deduplicatedQuestionCount !== 1 ? 's' : ''}{' '}
            appeared in multiple question banks and will only be imported once.
          </p>
        </div>
      </div>
    </Alert>
  );
}

export function NonRubricWarnings({
  warnings,
  questions,
  questionOverrides = new Map(),
}: {
  warnings: SerializedConversionResult['warnings'];
  questions: SerializedQuestionOutput[];
  questionOverrides?: Map<string, QuestionOverrides>;
}) {
  const filtered = warnings.filter((w) => !isRubricWarning(w.message));
  const duplicateQuestionTitles = findDuplicateQuestionTitles(questions, questionOverrides);
  if (filtered.length === 0 && duplicateQuestionTitles.length === 0) return null;

  const hasRemoteImageUrlWarning = filtered.some((w) => w.message === REMOTE_IMAGE_URL_WARNING);
  const individualWarnings = uniqueWarnings(
    filtered.filter((w) => w.message !== REMOTE_IMAGE_URL_WARNING),
  );

  const questionById = new Map<string, { title: string; number: number }>();
  for (const [index, question] of questions.entries()) {
    const questionInfo = { title: question.infoJson.title, number: index + 1 };
    questionById.set(question.sourceId, questionInfo);
    questionById.set(question.directoryName, questionInfo);
    questionById.set(question.originalDirectoryName, questionInfo);
  }

  return (
    <Alert variant="warning" className="mb-3">
      <strong>Warnings:</strong>
      <ul className="mb-0 mt-1">
        {hasRemoteImageUrlWarning && (
          <li key="remote-image-url-warning">{REMOTE_IMAGE_URL_SUMMARY}</li>
        )}
        <DuplicateQuestionTitleWarningListItem duplicateTitles={duplicateQuestionTitles} />
        {individualWarnings.map((w) => {
          const q = questionById.get(w.questionId);
          return (
            <li key={warningKey(w)}>
              {q ? `For question "${q.title}" (#${q.number}): ${w.message}` : w.message}
            </li>
          );
        })}
      </ul>
    </Alert>
  );
}

export function findDuplicateQuestionTitles(
  questions: SerializedQuestionOutput[],
  questionOverrides: Map<string, QuestionOverrides>,
): string[] {
  const titleCounts = new Map<string, number>();
  for (const question of questions) {
    const override = questionOverrides.get(question.directoryName);
    if (override?.included === false) continue;

    const title = (override?.title ?? question.infoJson.title).trim();
    if (title === '') continue;

    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return [...titleCounts.entries()].filter(([, count]) => count > 1).map(([title]) => title);
}

function DuplicateQuestionTitleWarningListItem({ duplicateTitles }: { duplicateTitles: string[] }) {
  if (duplicateTitles.length === 0) return null;

  return duplicateTitles.length === 1 ? (
    <li key="duplicate-question-title">
      We detected several questions named &ldquo;{duplicateTitles[0]}&rdquo;. We recommend you add
      meaningful names to these questions to find and edit them more easily in PrairieLearn.
    </li>
  ) : (
    <li key="duplicate-question-titles">
      We detected several questions with the same names. We recommend you add meaningful names to
      these questions to find and edit them more easily in PrairieLearn.
    </li>
  );
}

function warningKey(warning: SerializedConversionResult['warnings'][number]): string {
  return [warning.questionId, warning.message, warning.level, warning.externalCourseId].join('\0');
}

function uniqueWarnings(
  warnings: SerializedConversionResult['warnings'],
): SerializedConversionResult['warnings'] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = warningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ImportSummary({
  results,
  strippedAccessRules,
  parseWarnings,
}: {
  results: SerializedConversionResult[];
  strippedAccessRules: StrippedAccessRules | null;
  parseWarnings: ParseWarning[];
}) {
  const totalAssessments = results.filter((r) => r.sourceType === 'assessment').length;
  const totalQuestionBanks = results.filter((r) => r.sourceType === 'question-bank').length;
  const uniqueQuestions = new Map(
    results.flatMap((result) =>
      result.questions.map((question) => [question.directoryName, question] as const),
    ),
  );
  const totalQuestions = uniqueQuestions.size;
  const totalAssets = [...uniqueQuestions.values()].reduce(
    (sum, question) => sum + Object.keys(question.clientFiles).length,
    0,
  );

  const allWarnings = results.flatMap((r) => r.warnings);
  const rubricWarnings = allWarnings.filter((w) => isRubricWarning(w.message));
  const hasRubricIssues = rubricWarnings.length > 0;

  const unsupportedTypes = allWarnings
    .filter((w) => !isRubricWarning(w.message) && w.message.includes('Unsupported'))
    .map((w) => w.message);
  const uniqueUnsupported = [...new Set(unsupportedTypes)];

  const totalSkippedVideos = [...uniqueQuestions.values()].reduce(
    (sum, question) => sum + question.skippedVideos.length,
    0,
  );

  const notImportedItems: string[] = [];
  if (hasRubricIssues) notImportedItems.push('Rubrics (not supported in QTI quiz exports)');
  if (strippedAccessRules?.hasTimeLimits) notImportedItems.push('Time limits');
  if (strippedAccessRules?.hasPasswords) notImportedItems.push('Access passwords');
  if (strippedAccessRules?.hasDates) notImportedItems.push('Access dates (start/end dates)');
  if (totalSkippedVideos > 0) {
    notImportedItems.push(
      `${totalSkippedVideos} video file${totalSkippedVideos !== 1 ? 's' : ''} (see individual questions for details)`,
    );
  }
  notImportedItems.push(...uniqueUnsupported);
  for (const pw of parseWarnings) {
    notImportedItems.push(`${pw.filename}: ${pw.message}`);
  }

  const hasNotImported = notImportedItems.length > 0;

  return (
    <div className="row g-3 mb-4">
      <div className={hasNotImported ? 'col-md-6' : 'col-12'}>
        <Card className="h-100">
          <Card.Body>
            <h2 className="h6 mb-2">
              <i className="bi bi-check-circle text-success me-2" aria-hidden="true" />
              What can be imported
            </h2>
            <ul className="mb-0">
              {totalAssessments > 0 && (
                <li>
                  <strong>{totalAssessments}</strong> assessment
                  {totalAssessments !== 1 ? 's' : ''}
                </li>
              )}
              {totalQuestionBanks > 0 && (
                <li>
                  <strong>{totalQuestionBanks}</strong> question bank
                  {totalQuestionBanks !== 1 ? 's' : ''}
                </li>
              )}
              <li>
                <strong>{totalQuestions}</strong> question{totalQuestions !== 1 ? 's' : ''}
              </li>
              {totalAssets > 0 && (
                <li>
                  <strong>{totalAssets}</strong> image{totalAssets !== 1 ? 's' : ''} and other asset
                  {totalAssets !== 1 ? 's' : ''}
                </li>
              )}
            </ul>
          </Card.Body>
        </Card>
      </div>
      {hasNotImported && (
        <div className="col-md-6">
          <Card className="h-100">
            <Card.Body>
              <h2 className="h6 mb-2">
                <i className="bi bi-info-circle text-muted me-2" aria-hidden="true" />
                What won't be imported
              </h2>
              <ul className="mb-0">
                {notImportedItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </div>
      )}
    </div>
  );
}

export type ProcessingPhase = 'idle' | 'trimming' | 'uploading';

const PROCESSING_PHASE_LABELS: Record<ProcessingPhase, string> = {
  idle: '',
  trimming: 'Extracting QTI content\u2026',
  uploading: 'Uploading\u2026',
};

export function UploadStep({
  uploading,
  processingPhase,
  onSubmit,
  courseInstances,
  selectedCourseInstanceId,
  onCourseInstanceChange,
}: {
  uploading: boolean;
  processingPhase: ProcessingPhase;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  courseInstances: CourseInstanceOption[];
  selectedCourseInstanceId: string;
  onCourseInstanceChange: (id: string) => void;
}) {
  return (
    <form encType="multipart/form-data" onSubmit={onSubmit}>
      <p>
        Import quiz and question content from Canvas or another LMS. Upload a quiz export (
        <code>.zip</code>) or a full course export (<code>.imscc</code>) in the QTI 1.2 format.{' '}
        <a href="https://docs.prairielearn.com/importingContent/" target="_blank" rel="noreferrer">
          Learn more about importing content into PrairieLearn
        </a>
      </p>
      {courseInstances.length > 1 && (
        <div className="mb-3">
          <Form.Label htmlFor="course-instance-select">Target course instance</Form.Label>
          <Form.Select
            id="course-instance-select"
            value={selectedCourseInstanceId}
            disabled={uploading}
            onChange={(e) => onCourseInstanceChange(e.target.value)}
          >
            {courseInstances.map((ci) => (
              <option key={ci.id} value={ci.id}>
                {ci.shortName}: {ci.longName}
              </option>
            ))}
          </Form.Select>
          <Form.Text>Assessments will be created in this course instance.</Form.Text>
        </div>
      )}
      <div className="mb-3">
        <Form.Label htmlFor="qti-file">Export file</Form.Label>
        <Form.Control
          id="qti-file"
          type="file"
          name="file"
          accept=".zip,.imscc"
          disabled={uploading}
          aria-describedby="qti-file-help"
          required
        />
        <Form.Text id="qti-file-help">
          Supported formats: .zip (quiz export), .imscc (course export).
        </Form.Text>
      </div>
      <Button type="submit" variant="primary" disabled={uploading}>
        {uploading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {PROCESSING_PHASE_LABELS[processingPhase]}
          </>
        ) : (
          <>
            <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
            Import content
          </>
        )}
      </Button>
    </form>
  );
}

export function MissingBanksStep({
  results,
  uploading,
  processingPhase,
  uploadingBankKey,
  successMessage,
  onSubmit,
  onSkip,
  onStartOver,
}: {
  results: SerializedConversionResult[];
  uploading: boolean;
  processingPhase: ProcessingPhase;
  uploadingBankKey: string | null;
  successMessage: string | null;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onSkip: () => void;
  onStartOver: () => void;
}) {
  const refs = results.flatMap((result) => getUnresolvedSourceBankRefs(result));
  const uniqueRefs = uniqueSourceBankRefs(refs);
  const courseIds = uniqueCanvasCourseIds(refs);
  const importedQuestionCount = results.reduce((sum, result) => sum + result.questions.length, 0);
  const missingQuestionCount = countReferencedBankQuestions(refs);
  const totalQuestionCount = importedQuestionCount + missingQuestionCount;
  const hasUnknownCounts = refs.some((ref) => ref.numberChoose == null);
  const countPrefix = hasUnknownCounts ? 'At least ' : '';
  const isCanvasExport = hasCanvasUnresolvedSourceBankRefs(refs);

  return (
    <>
      {successMessage && (
        <Alert variant="success" className="mb-3">
          <div className="d-flex align-items-start gap-2">
            <i className="bi bi-check-circle-fill mt-1" aria-hidden="true" />
            <div>{successMessage}</div>
          </div>
        </Alert>
      )}

      <Alert variant="warning" className="mb-3">
        <div className="d-flex align-items-start gap-2">
          <i className="bi bi-exclamation-triangle-fill mt-1" aria-hidden="true" />
          <div>
            <strong>Some questions are in question banks</strong>
            <p className="mb-2 mt-1">
              This export references {refs.length} question bank{refs.length !== 1 ? 's' : ''} that
              {isCanvasExport ? ' Canvas did not include' : ' were not included'}. Use the file
              inputs below to upload exported content for each missing bank, and PrairieLearn will
              add matching bank questions to the original assessment review.
            </p>
            {isCanvasExport && courseIds.length > 1 && (
              <p className="mb-2">
                Each input identifies the Canvas course that should contain that bank when Canvas
                provided a course ID.
              </p>
            )}
            <p className="mb-2">
              {countPrefix}
              <strong>{missingQuestionCount}</strong> of <strong>{totalQuestionCount}</strong>{' '}
              question
              {totalQuestionCount !== 1 ? 's' : ''} in this import will be missing without the
              additional exported content.
            </p>
          </div>
        </div>
      </Alert>

      <div className="d-flex flex-column gap-3 mb-3">
        {uniqueRefs.map((ref, i) => {
          const inputId = `qti-bank-file-${i}`;
          const refKey = sourceBankRefKey(ref);
          const isUploadingThisBank = uploading && uploadingBankKey === refKey;
          const label = ref.externalCourseId
            ? `Supplemental export for "${ref.title}" from Canvas course ${ref.externalCourseId}`
            : `Supplemental export for "${ref.title}"`;
          const hasCanvasRef = ref.sourceBankExportId != null || ref.externalCourseId != null;

          return (
            <form
              key={refKey}
              data-source-bank-key={refKey}
              encType="multipart/form-data"
              className="border rounded p-3"
              onSubmit={onSubmit}
            >
              <div className="fw-semibold">{ref.title}</div>
              <div className="text-muted small mb-2">
                {ref.externalCourseId ? (
                  <>
                    Canvas course ID <strong>{ref.externalCourseId}</strong>{' '}
                    <span>
                      (find it at <code>/courses/{ref.externalCourseId}</code> on your Canvas
                      instance)
                    </span>
                  </>
                ) : hasCanvasRef ? (
                  'Canvas did not identify the source course ID for this bank.'
                ) : (
                  'Upload an export that contains this bank.'
                )}
              </div>
              <Form.Label htmlFor={inputId}>{label}</Form.Label>
              <div className="d-flex flex-column flex-md-row gap-2 align-items-md-start">
                <div className="flex-grow-1">
                  <Form.Control
                    id={inputId}
                    type="file"
                    name="file"
                    accept=".zip,.imscc"
                    disabled={uploading}
                    aria-describedby={`${inputId}-help`}
                    required
                  />
                  <Form.Text id={`${inputId}-help`}>
                    Upload {hasCanvasRef ? 'the Canvas course export' : 'an export'} that contains
                    this bank.
                  </Form.Text>
                </div>
                <Button
                  type="submit"
                  className="flex-shrink-0"
                  variant="primary"
                  disabled={uploading}
                  aria-label={`Upload export for ${ref.title}`}
                >
                  {isUploadingThisBank ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      {PROCESSING_PHASE_LABELS[processingPhase]}
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
                      Upload export
                    </>
                  )}
                </Button>
              </div>
            </form>
          );
        })}
      </div>

      <div className="d-flex gap-2">
        <Button
          variant="outline-secondary"
          type="button"
          disabled={uploading}
          onClick={onStartOver}
        >
          <i className="bi bi-arrow-left me-1" aria-hidden="true" />
          Start over
        </Button>
        <Button variant="outline-secondary" type="button" disabled={uploading} onClick={onSkip}>
          Continue without additional content
        </Button>
      </div>
    </>
  );
}

export function AssessmentQuestionsSection({
  questions,
  warnings,
  questionOverrides,
  existingDirs,
  onUpdateOverride,
}: {
  questions: SerializedQuestionOutput[];
  warnings: SerializedConversionResult['warnings'];
  questionOverrides: Map<string, QuestionOverrides>;
  existingDirs: Set<string>;
  onUpdateOverride: (dirName: string, updates: Partial<QuestionOverrides>) => void;
}) {
  const [expansionCommand, setExpansionCommand] = useState({
    version: 0,
    expanded: false,
  });
  const conflictingQuestions = useMemo(
    () => questions.filter((q) => questionOverrides.get(q.directoryName)?.collides),
    [questions, questionOverrides],
  );
  const questionWarningsByDirectoryName = useMemo(
    () => buildQuestionWarningsByDirectoryName(questions, warnings),
    [questions, warnings],
  );
  const conflictCount = conflictingQuestions.length;

  const setAllConflictStrategy = (strategy: CollisionStrategy) => {
    for (const q of conflictingQuestions) {
      onUpdateOverride(q.directoryName, { collisionStrategy: strategy });
    }
  };

  return (
    <>
      {conflictCount > 0 && (
        <div className="d-flex align-items-center gap-2 p-2 bg-light border rounded mb-2 small">
          <i className="bi bi-exclamation-circle text-warning" aria-hidden="true" />
          <span className="flex-grow-1">
            {conflictCount} question{conflictCount !== 1 ? 's' : ''} conflict
            {conflictCount === 1 ? 's' : ''} with existing questions
          </span>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setAllConflictStrategy('overwrite')}
          >
            Overwrite all
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setAllConflictStrategy('rename')}
          >
            Rename all
          </Button>
        </div>
      )}

      <details>
        <summary>Questions ({questions.length})</summary>

        <div className="d-flex gap-2 mb-2 mt-1 small">
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() =>
              setExpansionCommand(({ version }) => ({ version: version + 1, expanded: true }))
            }
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() =>
              setExpansionCommand(({ version }) => ({ version: version + 1, expanded: false }))
            }
          >
            Collapse all
          </button>
        </div>

        <div className="d-flex flex-column gap-2 mt-2">
          {questions.map((q, qi) => (
            <QuestionReviewPanel
              key={q.directoryName}
              question={q}
              questionNumber={qi + 1}
              warnings={questionWarningsByDirectoryName.get(q.directoryName) ?? []}
              overrides={questionOverrides.get(q.directoryName)}
              existingDirs={existingDirs}
              expansionCommand={expansionCommand}
              onUpdateOverride={onUpdateOverride}
            />
          ))}
        </div>
      </details>
    </>
  );
}

export function buildQuestionWarningsByDirectoryName(
  questions: SerializedQuestionOutput[],
  warnings: SerializedConversionResult['warnings'],
): Map<string, SerializedConversionResult['warnings']> {
  const warningsByQuestionId = new Map<string, SerializedConversionResult['warnings']>();
  for (const warning of warnings) {
    if (isRubricWarning(warning.message)) continue;
    const questionWarnings = warningsByQuestionId.get(warning.questionId) ?? [];
    questionWarnings.push(warning);
    warningsByQuestionId.set(warning.questionId, questionWarnings);
  }

  const questionWarningsByDirectoryName = new Map<string, SerializedConversionResult['warnings']>();
  for (const question of questions) {
    const matchingWarnings: SerializedConversionResult['warnings'] = [];
    const seenWarningKeys = new Set<string>();
    for (const questionId of [
      question.directoryName,
      question.originalDirectoryName,
      question.sourceId,
    ]) {
      for (const warning of warningsByQuestionId.get(questionId) ?? []) {
        const key = warning.message;
        if (seenWarningKeys.has(key)) continue;
        seenWarningKeys.add(key);
        matchingWarnings.push(warning);
      }
    }
    questionWarningsByDirectoryName.set(question.directoryName, matchingWarnings);
  }

  return questionWarningsByDirectoryName;
}

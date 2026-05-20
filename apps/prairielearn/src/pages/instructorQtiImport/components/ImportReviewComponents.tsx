import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';

import type {
  CollisionStrategy,
  ParseWarning,
  QuestionOverrides,
  SerializedConversionResult,
  SerializedQuestionOutput,
  StrippedAccessRules,
} from '../instructorQtiImport.types.js';

import { QuestionReviewPanel } from './QuestionReviewPanel.js';

function isRubricWarning(message: string): boolean {
  return message.includes('rubric') || message.includes('Rubric');
}

function uniqueCanvasCourseIds(
  refs: NonNullable<SerializedConversionResult['sourceBankRefs']>,
): string[] {
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

export function UnresolvedBankWarnings({ results }: { results: SerializedConversionResult[] }) {
  const refs = results.flatMap((result) => result.sourceBankRefs ?? []);
  if (refs.length === 0) return null;

  const courseIds = uniqueCanvasCourseIds(refs);

  return (
    <Alert variant="warning" className="mb-3">
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-exclamation-triangle-fill mt-1" aria-hidden="true" />
        <div>
          <strong>Some question banks were not resolved</strong>
          <p className="mb-2 mt-1">
            {refs.length} question bank reference{refs.length !== 1 ? 's' : ''} could not be matched
            to uploaded bank content. Those questions will not be imported unless you start over and
            upload a course export that contains the referenced banks.
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

export function NonRubricWarnings({
  warnings,
  questions,
}: {
  warnings: SerializedConversionResult['warnings'];
  questions: SerializedQuestionOutput[];
}) {
  const filtered = warnings.filter((w) => !isRubricWarning(w.message));
  if (filtered.length === 0) return null;

  const questionBySourceId = new Map(
    questions.map((q, i) => [q.sourceId, { title: q.infoJson.title, number: i + 1 }]),
  );

  return (
    <Alert variant="warning" className="mb-3">
      <strong>Warnings:</strong>
      <ul className="mb-0 mt-1">
        {filtered.map((w) => {
          const q = questionBySourceId.get(w.questionId);
          const prefix = q
            ? `For question "${q.title}" (#${q.number})`
            : `For question "${w.questionId}"`;
          return (
            <li key={`${w.questionId}-${w.message}`}>
              {prefix}: {w.message}
            </li>
          );
        })}
      </ul>
    </Alert>
  );
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
  const totalAssessments = results.filter((r) => r.sourceType !== 'question-bank').length;
  const totalQuestionBanks = results.filter((r) => r.sourceType === 'question-bank').length;
  const totalQuestions = results.reduce((sum, r) => sum + r.questions.length, 0);
  const totalAssets = results.reduce(
    (sum, r) => sum + r.questions.reduce((qSum, q) => qSum + Object.keys(q.clientFiles).length, 0),
    0,
  );

  const allWarnings = results.flatMap((r) => r.warnings);
  const rubricWarnings = allWarnings.filter((w) => isRubricWarning(w.message));
  const hasRubricIssues = rubricWarnings.length > 0;

  const unsupportedTypes = allWarnings
    .filter((w) => !isRubricWarning(w.message) && w.message.includes('Unsupported'))
    .map((w) => w.message);
  const uniqueUnsupported = [...new Set(unsupportedTypes)];

  const totalSkippedVideos = results.reduce(
    (sum, r) => sum + r.questions.reduce((qSum, q) => qSum + q.skippedVideos.length, 0),
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

export function UploadStep({
  uploading,
  onSubmit,
}: {
  uploading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
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
      <div className="mb-3">
        <Form.Label htmlFor="qti-file">Export file</Form.Label>
        <Form.Control
          id="qti-file"
          type="file"
          name="file"
          accept=".zip,.imscc"
          disabled={uploading}
          required
        />
        <Form.Text>Supported formats: .zip (quiz export), .imscc (course export)</Form.Text>
      </div>
      <Button type="submit" variant="primary" disabled={uploading}>
        {uploading ? (
          <>
            <Spinner size="sm" className="me-2" />
            Processing...
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
  onSubmit,
  onSkip,
  onStartOver,
}: {
  results: SerializedConversionResult[];
  uploading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onSkip: () => void;
  onStartOver: () => void;
}) {
  const refs = results.flatMap((result) => result.sourceBankRefs ?? []);
  const courseIds = uniqueCanvasCourseIds(refs);

  return (
    <form encType="multipart/form-data" onSubmit={onSubmit}>
      <Alert variant="warning" className="mb-3">
        <div className="d-flex align-items-start gap-2">
          <i className="bi bi-exclamation-triangle-fill mt-1" aria-hidden="true" />
          <div>
            <strong>Some questions are in Canvas question banks</strong>
            <p className="mb-2 mt-1">
              This export references {refs.length} question bank{refs.length !== 1 ? 's' : ''} that
              Canvas did not include. Upload a course export that contains the bank, and
              PrairieLearn will add matching bank questions to the original assessment review.
            </p>
            {courseIds.length > 0 && (
              <>
                <p className="mb-1">Canvas identified these source courses:</p>
                <CanvasCourseIdList courseIds={courseIds} />
              </>
            )}
            {courseIds.length === 0 && (
              <p className="mb-0">
                Canvas did not identify the source course ID for these banks. Try uploading the full
                Canvas course export for this course, or the course that contains the original
                question banks.
              </p>
            )}
          </div>
        </div>
      </Alert>

      <div className="mb-3">
        <Form.Label htmlFor="qti-bank-file">Question bank course export</Form.Label>
        <Form.Control
          id="qti-bank-file"
          type="file"
          name="file"
          accept=".zip,.imscc"
          disabled={uploading}
          required
        />
        <Form.Text>Upload the Canvas course export that contains the referenced bank.</Form.Text>
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
          Continue without bank
        </Button>
        <Button type="submit" variant="primary" disabled={uploading} className="ms-auto">
          {uploading ? (
            <>
              <Spinner size="sm" className="me-2" />
              Processing...
            </>
          ) : (
            <>
              <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
              Upload bank export
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function AssessmentQuestionsSection({
  questions,
  questionOverrides,
  existingDirs,
  expandedQuestions,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onUpdateOverride,
}: {
  questions: SerializedQuestionOutput[];
  questionOverrides: Map<string, QuestionOverrides>;
  existingDirs: Set<string>;
  expandedQuestions: Set<string>;
  onToggleExpand: (dirName: string) => void;
  onExpandAll: (dirNames: string[]) => void;
  onCollapseAll: (dirNames: string[]) => void;
  onUpdateOverride: (dirName: string, updates: Partial<QuestionOverrides>) => void;
}) {
  const conflictingQuestions = questions.filter(
    (q) => questionOverrides.get(q.directoryName)?.collides,
  );
  const conflictCount = conflictingQuestions.length;

  const setAllConflictStrategy = (strategy: CollisionStrategy) => {
    for (const q of conflictingQuestions) {
      onUpdateOverride(q.directoryName, { collisionStrategy: strategy });
    }
  };

  const allDirNames = questions.map((q) => q.directoryName);

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
        <summary className="small text-muted mb-2">Questions ({questions.length})</summary>

        <div className="d-flex gap-2 mb-2 mt-1 small">
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() => onExpandAll(allDirNames)}
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() => onCollapseAll(allDirNames)}
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
              overrides={questionOverrides.get(q.directoryName)}
              existingDirs={existingDirs}
              isExpanded={expandedQuestions.has(q.directoryName)}
              onToggleExpand={() => onToggleExpand(q.directoryName)}
              onUpdateOverride={(updates) => onUpdateOverride(q.directoryName, updates)}
            />
          ))}
        </div>
      </details>
    </>
  );
}

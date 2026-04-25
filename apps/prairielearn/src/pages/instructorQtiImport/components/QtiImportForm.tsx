import hljs from 'highlight.js/lib/core';
import hljsJson from 'highlight.js/lib/languages/json';
import hljsPython from 'highlight.js/lib/languages/python';
import hljsHtml from 'highlight.js/lib/languages/xml';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Collapse, Form, Spinner } from 'react-bootstrap';

hljs.registerLanguage('html', hljsHtml);
hljs.registerLanguage('json', hljsJson);
hljs.registerLanguage('python', hljsPython);

import { createCourseInstanceTrpcClient } from '../../../trpc/courseInstance/client.js';
import type {
  SerializedConversionResult,
  SerializedQuestionOutput,
  StrippedAccessRules,
  UploadResponse,
} from '../instructorQtiImport.types.js';

type ImportStep = 'upload' | 'review' | 'creating';

const PL_ELEMENT_TYPE_MAP: Record<string, string> = {
  'pl-multiple-choice': 'Multiple choice',
  'pl-checkbox': 'Checkbox',
  'pl-matching': 'Matching',
  'pl-order-blocks': 'Ordering',
  'pl-number-input': 'Numeric',
  'pl-integer-input': 'Integer',
  'pl-string-input': 'Short answer',
  'pl-dropdown': 'Dropdown',
  'pl-rich-text-editor': 'Essay',
  'pl-file-upload': 'File upload',
};

const DEFAULT_ASSESSMENT_SETS = [
  'Homework',
  'Quiz',
  'Practice Quiz',
  'Exam',
  'Practice Exam',
  'Prep',
  'Machine Problem',
  'Worksheet',
];

function formatGradingMethod(method: string | undefined): string {
  switch (method) {
    case 'Manual':
      return 'Manually graded';
    case 'External':
      return 'Externally graded';
    default:
      return 'Automatically graded';
  }
}

function detectQuestionType(html: string): string {
  for (const [element, label] of Object.entries(PL_ELEMENT_TYPE_MAP)) {
    if (html.includes(`<${element}`)) return label;
  }
  if (html.includes('<pl-question-panel>') && !/<pl-(?!question-panel|answer-panel)/.test(html)) {
    return 'Text only';
  }
  return 'Unknown';
}

interface AssessmentOverrides {
  title: string;
  type: 'Homework' | 'Exam';
  set: string;
  number: string;
  included: boolean;
}

type CollisionStrategy = 'overwrite' | 'rename';

interface QuestionOverrides {
  title: string;
  topic: string;
  tags: string[];
  included: boolean;
  /** The original directoryName from the conversion output. */
  originalDirName: string;
  /** Whether this question collides with an existing question directory. */
  collides: boolean;
  /** How to handle the collision: overwrite existing or rename this question. */
  collisionStrategy: CollisionStrategy;
}

function deduplicateAssessmentNumbers(
  results: SerializedConversionResult[],
): AssessmentOverrides[] {
  const overrides: AssessmentOverrides[] = results.map((r) => ({
    title: r.assessment.infoJson.title,
    type: r.assessment.infoJson.type,
    set: r.assessment.infoJson.set,
    number: r.assessment.infoJson.number,
    included: r.questions.length > 0,
  }));

  const usedBySet = new Map<string, Set<string>>();
  for (const o of overrides) {
    const used = usedBySet.get(o.set) ?? new Set<string>();
    if (used.has(o.number)) {
      let next = Number.parseInt(o.number, 10) || 1;
      while (used.has(String(next))) {
        next++;
      }
      o.number = String(next);
    }
    used.add(o.number);
    usedBySet.set(o.set, used);
  }

  return overrides;
}

function buildInitialQuestionOverrides(
  results: SerializedConversionResult[],
  existingDirs: Set<string>,
): Map<string, QuestionOverrides> {
  const overrides = new Map<string, QuestionOverrides>();
  for (const result of results) {
    for (const q of result.questions) {
      if (!overrides.has(q.directoryName)) {
        overrides.set(q.directoryName, {
          title: q.infoJson.title,
          topic: q.infoJson.topic,
          tags: [...q.infoJson.tags],
          included: true,
          originalDirName: q.directoryName,
          collides: existingDirs.has(q.directoryName),
          collisionStrategy: 'overwrite',
        });
      }
    }
  }
  return overrides;
}

/** Generate a renamed directory by appending an incrementing suffix. */
function resolveRenamedDir(originalDir: string, existingDirs: Set<string>): string {
  let candidate = `${originalDir}-2`;
  let n = 3;
  while (existingDirs.has(candidate)) {
    candidate = `${originalDir}-${n}`;
    n++;
  }
  return candidate;
}

export function QtiImportForm({
  urlPrefix,
  courseInstanceId,
  csrfToken,
  trpcCsrfToken,
}: {
  urlPrefix: string;
  courseInstanceId: string;
  csrfToken: string;
  trpcCsrfToken: string;
}) {
  const [trpcClient] = useState(() =>
    createCourseInstanceTrpcClient({ csrfToken: trpcCsrfToken, courseInstanceId }),
  );
  const [step, setStep] = useState<ImportStep>('upload');
  const [results, setResults] = useState<SerializedConversionResult[]>([]);
  const [overrides, setOverrides] = useState<AssessmentOverrides[]>([]);
  const [existingDirs, setExistingDirs] = useState<Set<string>>(new Set());
  const [strippedRules, setStrippedRules] = useState<StrippedAccessRules | null>(null);
  const [questionOverrides, setQuestionOverrides] = useState<Map<string, QuestionOverrides>>(
    new Map(),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch(`${urlPrefix}/instance_admin/qti_import/upload`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (!response.ok) {
        let message = `Upload failed with status ${response.status}`;
        try {
          const body = await response.json();
          if (typeof body?.error === 'string') {
            message = body.error;
          }
        } catch {
          // Response wasn't JSON; use default message.
        }
        throw new Error(message);
      }

      const data: UploadResponse = await response.json();

      if (data.results.length === 0) {
        throw new Error('No assessments found in the uploaded file');
      }

      const dirs = new Set(data.existingQuestionDirs);
      setExistingDirs(dirs);
      setStrippedRules(data.strippedAccessRules);
      setResults(data.results);
      setOverrides(deduplicateAssessmentNumbers(data.results));
      setQuestionOverrides(buildInitialQuestionOverrides(data.results, dirs));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    setError(null);
    setStep('creating');

    try {
      const includedAssessments = results
        .map((result, i) => ({ result, override: overrides[i] }))
        .filter(({ override }) => override.included);

      // Track all allocated directory names so that multiple renames within
      // the same import don't collide with each other.
      const allocatedDirs = new Set(existingDirs);

      const payload = {
        assessments: includedAssessments.map(({ result, override }) => ({
          directoryName: result.assessment.directoryName,
          infoJson: {
            ...result.assessment.infoJson,
            title: override.title,
            type: override.type,
            set: override.set,
            number: override.number,
          } as Record<string, unknown>,
          questions: result.questions
            .filter((q) => questionOverrides.get(q.directoryName)?.included !== false)
            .map((q) => {
              const qOverride = questionOverrides.get(q.directoryName);
              let dirName = q.directoryName;
              if (qOverride?.collides && qOverride.collisionStrategy === 'rename') {
                dirName = resolveRenamedDir(qOverride.originalDirName, allocatedDirs);
              }
              allocatedDirs.add(dirName);
              return {
                directoryName: dirName,
                infoJson: {
                  ...q.infoJson,
                  ...(qOverride && {
                    title: qOverride.title,
                    topic: qOverride.topic,
                    tags: qOverride.tags,
                  }),
                } as unknown as Record<string, unknown>,
                questionHtml: q.questionHtml,
                serverPy: q.serverPy,
                clientFiles: q.clientFiles,
              };
            }),
        })),
      };

      await trpcClient.qtiImport.create.mutate(payload);
      window.location.href = `${urlPrefix}/instance_admin/assessments`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assessments');
      setStep('review');
    }
  };

  const updateOverride = (index: number, updates: Partial<AssessmentOverrides>) => {
    setOverrides((prev) => prev.map((o, i) => (i === index ? { ...o, ...updates } : o)));
  };

  const updateQuestionOverride = (dirName: string, updates: Partial<QuestionOverrides>) => {
    setQuestionOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(dirName);
      if (current) {
        next.set(dirName, { ...current, ...updates });
      }
      return next;
    });
  };

  const toggleExpandedQuestion = (dirName: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(dirName)) {
        next.delete(dirName);
      } else {
        next.add(dirName);
      }
      return next;
    });
  };

  const expandAllQuestions = (dirNames: string[]) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      for (const d of dirNames) next.add(d);
      return next;
    });
  };

  const collapseAllQuestions = (dirNames: string[]) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      for (const d of dirNames) next.delete(d);
      return next;
    });
  };

  const includedCount = overrides.filter((o) => o.included).length;

  const resetAll = () => {
    setStep('upload');
    setResults([]);
    setOverrides([]);
    setExistingDirs(new Set());
    setStrippedRules(null);
    setQuestionOverrides(new Map());
    setExpandedQuestions(new Set());
  };

  return (
    <Card className="mb-4">
      <Card.Header className="bg-primary text-white">
        <h1 className="h6 mb-0">Import QTI content</h1>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {step === 'upload' && <UploadStep uploading={uploading} onSubmit={handleUpload} />}

        {step === 'review' && (
          <>
            <ImportSummary results={results} strippedAccessRules={strippedRules} />

            <p className="text-muted">
              Review the assessments and questions below, then confirm to create them in your
              PrairieLearn course.
            </p>

            {results.map((result, i) => (
              <Card key={result.assessment.directoryName} className="mb-3">
                <Card.Header className="d-flex align-items-center gap-2">
                  <Form.Check
                    id={`include-${i}`}
                    checked={overrides[i].included}
                    disabled={result.questions.length === 0}
                    label=""
                    aria-label={`Include ${result.assessmentTitle}`}
                    onChange={(e) => updateOverride(i, { included: e.target.checked })}
                  />
                  <div className="flex-grow-1">
                    <strong>{result.assessmentTitle}</strong>
                    <span className="text-muted ms-2">
                      ({result.questions.length} question
                      {result.questions.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                </Card.Header>
                {result.questions.length === 0 && (
                  <Card.Body>
                    <div className="text-muted d-flex align-items-center gap-2">
                      <i className="bi bi-info-circle" aria-hidden="true" />
                      This assessment doesn't contain any questions
                    </div>
                  </Card.Body>
                )}
                {overrides[i].included && result.questions.length > 0 && (
                  <Card.Body>
                    <div className="row g-3 mb-3">
                      <div className="col-md-6">
                        <Form.Label htmlFor={`title-${i}`}>Title</Form.Label>
                        <Form.Control
                          id={`title-${i}`}
                          type="text"
                          value={overrides[i].title}
                          onChange={(e) => updateOverride(i, { title: e.target.value })}
                        />
                      </div>
                      <div className="col-md-2">
                        <Form.Label htmlFor={`type-${i}`}>Type</Form.Label>
                        <Form.Select
                          id={`type-${i}`}
                          value={overrides[i].type}
                          onChange={(e) =>
                            updateOverride(i, {
                              type: e.target.value as 'Homework' | 'Exam',
                            })
                          }
                        >
                          <option value="Homework">Homework</option>
                          <option value="Exam">Exam</option>
                        </Form.Select>
                      </div>
                      <div className="col-md-2">
                        <Form.Label htmlFor={`set-${i}`}>Set</Form.Label>
                        <Form.Select
                          id={`set-${i}`}
                          value={overrides[i].set}
                          onChange={(e) => updateOverride(i, { set: e.target.value })}
                        >
                          {DEFAULT_ASSESSMENT_SETS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      <div className="col-md-2">
                        <Form.Label htmlFor={`number-${i}`}>Number</Form.Label>
                        <Form.Control
                          id={`number-${i}`}
                          type="text"
                          value={overrides[i].number}
                          onChange={(e) => updateOverride(i, { number: e.target.value })}
                        />
                      </div>
                    </div>

                    <NonRubricWarnings warnings={result.warnings} />

                    <AssessmentQuestionsSection
                      questions={result.questions}
                      questionOverrides={questionOverrides}
                      expandedQuestions={expandedQuestions}
                      onToggleExpand={toggleExpandedQuestion}
                      onExpandAll={expandAllQuestions}
                      onCollapseAll={collapseAllQuestions}
                      onUpdateOverride={updateQuestionOverride}
                    />
                  </Card.Body>
                )}
              </Card>
            ))}

            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={resetAll}>
                <i className="bi bi-arrow-left me-1" aria-hidden="true" />
                Start over
              </Button>
              <Button
                className="ms-auto"
                variant="primary"
                disabled={includedCount === 0}
                onClick={() => void handleCreate()}
              >
                Create {includedCount} assessment{includedCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}

        {step === 'creating' && (
          <div className="text-center py-4">
            <Spinner className="mb-3" />
            <p>Creating assessments and questions...</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
QtiImportForm.displayName = 'QtiImportForm';

function isRubricWarning(message: string): boolean {
  return message.includes('rubric') || message.includes('Rubric');
}

function NonRubricWarnings({ warnings }: { warnings: SerializedConversionResult['warnings'] }) {
  const filtered = warnings.filter((w) => !isRubricWarning(w.message));
  if (filtered.length === 0) return null;

  return (
    <Alert variant="warning" className="mb-3">
      <strong>Warnings:</strong>
      <ul className="mb-0 mt-1">
        {filtered.map((w) => (
          <li key={`${w.questionId}-${w.message}`}>
            [{w.questionId}] {w.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function ImportSummary({
  results,
  strippedAccessRules,
}: {
  results: SerializedConversionResult[];
  strippedAccessRules: StrippedAccessRules | null;
}) {
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
              <li>
                <strong>{results.length}</strong> assessment{results.length !== 1 ? 's' : ''}
              </li>
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

function UploadStep({
  uploading,
  onSubmit,
}: {
  uploading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form encType="multipart/form-data" onSubmit={onSubmit}>
      <p>
        Import quiz and question content from Canvas or other learning management systems. Upload a
        quiz export (<code>.zip</code>) or a full course export (<code>.imscc</code>) to get
        started. (Supports the QTI 1.2 interchange format.)
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

function AssessmentQuestionsSection({
  questions,
  questionOverrides,
  expandedQuestions,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onUpdateOverride,
}: {
  questions: SerializedQuestionOutput[];
  questionOverrides: Map<string, QuestionOverrides>;
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

      {conflictCount > 0 && (
        <div className="d-flex align-items-center gap-2 p-2 bg-light border rounded mb-2 mt-2 small">
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

      <div className="d-flex flex-column gap-2 mt-2">
        {questions.map((q, qi) => (
          <QuestionReviewPanel
            key={q.directoryName}
            question={q}
            questionNumber={qi + 1}
            overrides={questionOverrides.get(q.directoryName)}
            isExpanded={expandedQuestions.has(q.directoryName)}
            onToggleExpand={() => onToggleExpand(q.directoryName)}
            onUpdateOverride={(updates) => onUpdateOverride(q.directoryName, updates)}
          />
        ))}
      </div>
    </details>
  );
}

function QuestionReviewPanel({
  question: q,
  questionNumber,
  overrides: qo,
  isExpanded,
  onToggleExpand,
  onUpdateOverride,
}: {
  question: SerializedQuestionOutput;
  questionNumber: number;
  overrides: QuestionOverrides | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateOverride: (updates: Partial<QuestionOverrides>) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>('question.html');
  const questionType = detectQuestionType(q.questionHtml);
  const included = qo?.included ?? true;

  const mergedInfoJson = {
    ...q.infoJson,
    ...(qo && {
      title: qo.title,
      topic: qo.topic,
      tags: qo.tags,
    }),
  };

  const fileEntries: { name: string; path: string; content: string; icon: string }[] = [
    {
      name: 'info.json',
      path: 'info.json',
      content: JSON.stringify(mergedInfoJson, null, 2),
      icon: 'bi-file-earmark-code',
    },
    {
      name: 'question.html',
      path: 'question.html',
      content: q.questionHtml,
      icon: 'bi-filetype-html',
    },
  ];
  if (q.serverPy) {
    fileEntries.push({
      name: 'server.py',
      path: 'server.py',
      content: q.serverPy,
      icon: 'bi-filetype-py',
    });
  }
  for (const name of Object.keys(q.clientFiles)) {
    fileEntries.push({
      name,
      path: `clientFilesQuestion/${name}`,
      content: `(binary file — ${Math.ceil((q.clientFiles[name].length * 3) / 4)} bytes)`,
      icon: 'bi-file-earmark-image',
    });
  }

  const selectedContent = fileEntries.find((f) => f.path === selectedFile)?.content ?? null;

  return (
    <Card className={!included ? 'opacity-50' : ''}>
      <Card.Header className="d-flex align-items-center gap-2 py-2">
        <Form.Check
          id={`q-include-${q.directoryName}`}
          checked={included}
          label=""
          aria-label={`Include question ${questionNumber}: ${qo?.title ?? q.infoJson.title}`}
          onChange={(e) => onUpdateOverride({ included: e.target.checked })}
          onClick={(e) => e.stopPropagation()}
        />
        <div
          className="d-flex align-items-center gap-2 flex-grow-1"
          style={{ cursor: 'pointer' }}
          role="button"
          aria-expanded={isExpanded}
          aria-controls={`q-panel-${q.directoryName}`}
          tabIndex={0}
          onClick={onToggleExpand}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand();
            }
          }}
        >
          <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} aria-hidden="true" />
          <span className="text-muted">{questionNumber}.</span>
          <span className="fw-medium">{qo?.title ?? q.infoJson.title}</span>
          {q.skippedVideos.length > 0 && (
            <i
              className="bi bi-exclamation-triangle-fill text-danger flex-grow-1"
              aria-label={`${q.skippedVideos.length} video file${q.skippedVideos.length !== 1 ? 's' : ''} excluded`}
              title={`${q.skippedVideos.length} video file${q.skippedVideos.length !== 1 ? 's' : ''} excluded`}
            />
          )}
        </div>
        <Badge bg="primary" className="fw-normal">
          {questionType}
        </Badge>
        {(qo?.tags ?? q.infoJson.tags).map((tag) => (
          <Badge key={tag} bg="secondary" className="fw-normal">
            {tag}
          </Badge>
        ))}
      </Card.Header>
      {qo?.collides && included && (
        <div className="px-3 py-2 bg-light border-bottom d-flex align-items-center gap-2 small">
          <i className="bi bi-exclamation-circle text-warning" aria-hidden="true" />
          <span>
            Conflicts with existing question <code>{qo.originalDirName}</code>
          </span>
          <Form.Select
            size="sm"
            style={{ width: 'auto' }}
            value={qo.collisionStrategy}
            disabled={!included}
            onChange={(e) =>
              onUpdateOverride({ collisionStrategy: e.target.value as CollisionStrategy })
            }
            onClick={(e) => e.stopPropagation()}
          >
            <option value="overwrite">Overwrite existing</option>
            <option value="rename">Create with new name</option>
          </Form.Select>
        </div>
      )}
      <Collapse in={isExpanded && included}>
        <div id={`q-panel-${q.directoryName}`}>
          <Card.Body className="p-0">
            <div className="d-flex flex-wrap" style={{ minHeight: '280px' }}>
              {/* Column 1: Question info & editing */}
              <div
                className="p-3 border-end border-bottom border-bottom-md-0"
                style={{ flex: '0 0 300px' }}
              >
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-title-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Title
                  </Form.Label>
                  <Form.Control
                    id={`q-title-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={qo?.title ?? ''}
                    onChange={(e) => onUpdateOverride({ title: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-topic-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Topic
                  </Form.Label>
                  <Form.Control
                    id={`q-topic-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={qo?.topic ?? ''}
                    onChange={(e) => onUpdateOverride({ topic: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-tags-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Tags (comma-separated)
                  </Form.Label>
                  <Form.Control
                    id={`q-tags-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={qo?.tags.join(', ') ?? ''}
                    onChange={(e) =>
                      onUpdateOverride({
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div>
                  <div className="small text-muted mb-1">Grading</div>
                  <div>{formatGradingMethod(q.infoJson.gradingMethod)}</div>
                </div>
              </div>

              {/* Columns 2+3: File tree and viewer (stay together) */}
              <div className="d-flex flex-grow-1" style={{ minWidth: '0', flex: '2 1 400px' }}>
                {/* Column 2: File tree */}
                <div
                  className="p-3 border-end small d-flex flex-column"
                  style={{ width: '300px', flexShrink: 0 }}
                >
                  <FileTree
                    rootLabel={`${q.directoryName}/`}
                    entries={fileEntries}
                    selectedFile={selectedFile}
                    onSelectFile={(p) => setSelectedFile(p === selectedFile ? null : p)}
                  />
                </div>

                {/* Column 3: File content viewer */}
                <div className="flex-grow-1 overflow-hidden">
                  {selectedFile && selectedContent ? (
                    <CodeViewer content={selectedContent} filename={selectedFile} />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                      Select a file to view its contents
                    </div>
                  )}
                </div>
              </div>
            </div>
            {q.skippedVideos.length > 0 && (
              <div className="px-3 py-2 border-top bg-light d-flex align-items-start gap-2 small">
                <i
                  className="bi bi-exclamation-triangle-fill text-danger mt-1"
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {q.skippedVideos.length} video file
                    {q.skippedVideos.length !== 1 ? 's' : ''} excluded:
                  </strong>
                  <ul className="mb-0 mt-1">
                    {q.skippedVideos.map((name) => (
                      <li key={name} className="text-muted">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
}

const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  '.json': 'json',
  '.html': 'html',
  '.py': 'python',
};

function detectLanguage(filename: string): string | undefined {
  for (const [ext, lang] of Object.entries(FILENAME_LANGUAGE_MAP)) {
    if (filename.endsWith(ext)) return lang;
  }
  return undefined;
}

function CodeViewer({ content, filename }: { content: string; filename: string }) {
  const highlighted = useMemo(() => {
    const language = detectLanguage(filename);
    if (language) {
      return hljs.highlight(content, { language }).value;
    }
    return null;
  }, [content, filename]);

  return (
    <pre
      className="m-0 p-3 h-100 small hljs"
      style={{
        overflow: 'auto',
        maxHeight: '400px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {highlighted ? (
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Rendering highlight.js output
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <code>{content}</code>
      )}
    </pre>
  );
}

interface TreeNode {
  name: string;
  path?: string;
  icon?: string;
  children?: TreeNode[];
}

function buildTree(entries: { name: string; path: string; icon: string }[]): TreeNode[] {
  const root: TreeNode[] = [];

  const rootFiles = entries.filter((e) => !e.path.includes('/'));
  const nested = entries.filter((e) => e.path.includes('/'));

  for (const f of rootFiles) {
    root.push({ name: f.name, path: f.path, icon: f.icon });
  }

  const dirs = new Map<string, typeof nested>();
  for (const f of nested) {
    const slashIdx = f.path.indexOf('/');
    const dirName = f.path.slice(0, slashIdx);
    const group = dirs.get(dirName) ?? [];
    group.push(f);
    dirs.set(dirName, group);
  }

  for (const [dirName, files] of dirs) {
    const dirNode: TreeNode = {
      name: `${dirName}/`,
      icon: 'bi-folder',
      children: [],
    };

    const subDirs = new Map<string, typeof files>();
    const directFiles: typeof files = [];

    for (const f of files) {
      const rest = f.path.slice(dirName.length + 1);
      const subSlash = rest.indexOf('/');
      if (subSlash === -1) {
        directFiles.push(f);
      } else {
        const subDirName = rest.slice(0, subSlash);
        const group = subDirs.get(subDirName) ?? [];
        group.push(f);
        subDirs.set(subDirName, group);
      }
    }

    for (const [subDirName, subFiles] of subDirs) {
      dirNode.children!.push({
        name: `${subDirName}/`,
        icon: 'bi-folder',
        children: subFiles.map((f) => ({
          name: f.path.slice(f.path.lastIndexOf('/') + 1),
          path: f.path,
          icon: f.icon,
        })),
      });
    }

    for (const f of directFiles) {
      dirNode.children!.push({
        name: f.path.slice(f.path.lastIndexOf('/') + 1),
        path: f.path,
        icon: f.icon,
      });
    }

    root.push(dirNode);
  }

  return root;
}

function FileTree({
  rootLabel,
  entries,
  selectedFile,
  onSelectFile,
}: {
  rootLabel: string;
  entries: { name: string; path: string; content: string; icon: string }[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);

  return (
    <>
      <div className="text-muted mb-2 font-monospace">
        <i className="bi bi-folder-fill me-1" aria-hidden="true" />
        {rootLabel}
      </div>
      <div className="font-monospace">
        <TreeNodes nodes={tree} depth={0} selectedFile={selectedFile} onSelectFile={onSelectFile} />
      </div>
      <div className="text-muted small px-2 mt-auto">
        You'll be able to edit question files once they've been imported.
      </div>
    </>
  );
}

function TreeNodes({
  nodes,
  depth,
  selectedFile,
  onSelectFile,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path ?? node.name}>
          {node.path ? (
            <div
              className={`px-2 py-1 rounded d-flex align-items-center gap-1 ${selectedFile === node.path ? 'bg-primary text-white' : 'text-body'}`}
              style={{ cursor: 'pointer', marginLeft: `${depth * 16}px` }}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFile(node.path!)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectFile(node.path!);
                }
              }}
            >
              <i className={`bi ${node.icon ?? 'bi-file-earmark'}`} aria-hidden="true" />
              <span className="text-truncate">{node.name}</span>
            </div>
          ) : (
            <div
              className="px-2 py-1 text-muted d-flex align-items-center gap-1"
              style={{ marginLeft: `${depth * 16}px` }}
            >
              <i className={`bi ${node.icon ?? 'bi-folder'}`} aria-hidden="true" />
              {node.name}
            </div>
          )}
          {node.children && (
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      ))}
    </>
  );
}

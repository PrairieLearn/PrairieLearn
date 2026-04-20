import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Collapse, Form, Spinner, Table } from 'react-bootstrap';

import { createCourseInstanceTrpcClient } from '../../../trpc/courseInstance/client.js';
import type {
  SerializedConversionResult,
  SerializedQuestionOutput,
  UploadResponse,
} from '../instructorCanvasImport.types.js';

type ImportStep = 'upload' | 'review' | 'creating' | 'done';

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

function formatGradingMethod(method: string | undefined): string {
  switch (method) {
    case 'Manual':
      return 'Manually graded';
    case 'External':
      return 'Externally graded';
    default:
      return 'Internally graded';
  }
}

/** Detect the PL question type from the question HTML by finding PL elements. */
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
  type: 'Homework' | 'Exam';
  set: string;
  number: string;
  included: boolean;
}

interface QuestionOverrides {
  title: string;
  tags: string[];
}

/** Deduplicated question entry with a reference to its source data. */
interface DeduplicatedQuestion {
  directoryName: string;
  source: SerializedQuestionOutput;
  /** Which assessment indices contain this question. */
  assessmentIndices: number[];
}

function buildDeduplicatedQuestions(results: SerializedConversionResult[]): DeduplicatedQuestion[] {
  const map = new Map<string, DeduplicatedQuestion>();
  for (let ai = 0; ai < results.length; ai++) {
    for (const q of results[ai].questions) {
      const existing = map.get(q.directoryName);
      if (existing) {
        existing.assessmentIndices.push(ai);
      } else {
        map.set(q.directoryName, {
          directoryName: q.directoryName,
          source: q,
          assessmentIndices: [ai],
        });
      }
    }
  }
  return Array.from(map.values());
}

function buildInitialQuestionOverrides(
  questions: DeduplicatedQuestion[],
): Map<string, QuestionOverrides> {
  const overrides = new Map<string, QuestionOverrides>();
  for (const q of questions) {
    overrides.set(q.directoryName, {
      title: q.source.infoJson.title,
      tags: [...q.source.infoJson.tags],
    });
  }
  return overrides;
}

export function CanvasImportForm({
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
  const [questionOverrides, setQuestionOverrides] = useState<Map<string, QuestionOverrides>>(
    new Map(),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [previewingQuestions, setPreviewingQuestions] = useState<Set<string>>(new Set());
  const [expandedAssessments, setExpandedAssessments] = useState<Set<number>>(new Set());
  const [questionsExpanded, setQuestionsExpanded] = useState(true);

  const deduplicatedQuestions = useMemo(() => buildDeduplicatedQuestions(results), [results]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch(`${urlPrefix}/instance_admin/canvas_import/upload`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Upload failed with status ${response.status}`);
      }

      const data: UploadResponse = await response.json();

      if (data.results.length === 0) {
        throw new Error('No assessments found in the uploaded file');
      }

      setResults(data.results);
      setOverrides(
        data.results.map((r) => ({
          type: r.assessment.infoJson.type,
          set: r.assessment.infoJson.set,
          number: r.assessment.infoJson.number,
          included: true,
        })),
      );

      const deduplicated = buildDeduplicatedQuestions(data.results);
      setQuestionOverrides(buildInitialQuestionOverrides(deduplicated));
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

      const payload = {
        assessments: includedAssessments.map(({ result, override }) => ({
          directoryName: result.assessment.directoryName,
          infoJson: {
            ...result.assessment.infoJson,
            type: override.type,
            set: override.set,
            number: override.number,
          } as Record<string, unknown>,
          rubricJson: result.assessment.rubricJson as Record<string, unknown> | undefined,
          questions: result.questions.map((q) => {
            const qOverride = questionOverrides.get(q.directoryName);
            return {
              directoryName: q.directoryName,
              infoJson: {
                ...q.infoJson,
                ...(qOverride && {
                  title: qOverride.title,
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

      const response = await trpcClient.canvasImport.create.mutate(payload);
      setCreatedIds(response.assessmentIds);
      setStep('done');
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

  const togglePreviewQuestion = (dirName: string) => {
    setPreviewingQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(dirName)) {
        next.delete(dirName);
      } else {
        next.add(dirName);
      }
      return next;
    });
  };

  const toggleExpandedAssessment = (index: number) => {
    setExpandedAssessments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const includedCount = overrides.filter((o) => o.included).length;
  const totalQuestions = deduplicatedQuestions.length;

  return (
    <Card className="mb-4">
      <Card.Header className="bg-primary text-white">
        <h1 className="h6 mb-0">Import from Canvas</h1>
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
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <strong>{includedCount}</strong> assessment{includedCount !== 1 ? 's' : ''} and{' '}
                <strong>{totalQuestions}</strong> question{totalQuestions !== 1 ? 's' : ''} to
                import
              </div>
            </div>

            {/* Questions review section */}
            <Card className="mb-4">
              <Card.Header className="d-flex align-items-center">
                <div className="flex-grow-1">
                  <strong>Questions</strong>
                  <span className="text-muted ms-2">({totalQuestions})</span>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  aria-expanded={questionsExpanded}
                  aria-controls="questions-review-section"
                  onClick={() => setQuestionsExpanded((prev) => !prev)}
                >
                  {questionsExpanded ? 'Collapse' : 'Expand'}
                </Button>
              </Card.Header>
              <Collapse in={questionsExpanded}>
                <div id="questions-review-section">
                  <div className="list-group list-group-flush">
                    {deduplicatedQuestions.map((dq) => (
                      <QuestionReviewItem
                        key={dq.directoryName}
                        question={dq}
                        overrides={questionOverrides.get(dq.directoryName)}
                        isExpanded={expandedQuestions.has(dq.directoryName)}
                        isPreviewing={previewingQuestions.has(dq.directoryName)}
                        onToggleExpand={() => toggleExpandedQuestion(dq.directoryName)}
                        onTogglePreview={() => togglePreviewQuestion(dq.directoryName)}
                        onUpdateOverride={(updates) =>
                          updateQuestionOverride(dq.directoryName, updates)
                        }
                      />
                    ))}
                  </div>
                </div>
              </Collapse>
            </Card>

            {/* Assessments review section */}
            <h2 className="h6 mb-3">Assessments</h2>
            {results.map((result, i) => (
              <Card key={result.assessment.directoryName} className="mb-3">
                <Card.Header className="d-flex align-items-center gap-3">
                  <Form.Check
                    id={`include-${i}`}
                    checked={overrides[i].included}
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
                  <Button
                    variant="link"
                    size="sm"
                    aria-expanded={expandedAssessments.has(i)}
                    aria-controls={`assessment-${i}`}
                    onClick={() => toggleExpandedAssessment(i)}
                  >
                    {expandedAssessments.has(i) ? 'Hide details' : 'Show details'}
                  </Button>
                </Card.Header>
                {overrides[i].included && (
                  <Card.Body>
                    <div className="row g-3 mb-3">
                      <div className="col-md-3">
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
                      <div className="col-md-3">
                        <Form.Label htmlFor={`set-${i}`}>Set</Form.Label>
                        <Form.Control
                          id={`set-${i}`}
                          type="text"
                          value={overrides[i].set}
                          onChange={(e) => updateOverride(i, { set: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <Form.Label htmlFor={`number-${i}`}>Number</Form.Label>
                        <Form.Control
                          id={`number-${i}`}
                          type="text"
                          value={overrides[i].number}
                          onChange={(e) => updateOverride(i, { number: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <AssessmentMetaSummary infoJson={result.assessment.infoJson} />
                      </div>
                    </div>

                    {result.warnings.length > 0 && (
                      <Alert variant="warning" className="mb-3">
                        <strong>Warnings:</strong>
                        <ul className="mb-0 mt-1">
                          {result.warnings.map((w) => (
                            <li key={`${w.questionId}-${w.message}`}>
                              [{w.questionId}] {w.message}
                            </li>
                          ))}
                        </ul>
                      </Alert>
                    )}

                    <Collapse in={expandedAssessments.has(i)}>
                      <div id={`assessment-${i}`}>
                        <Table size="sm" hover>
                          <thead>
                            <tr>
                              <th>Question</th>
                              <th>Type</th>
                              <th>Grading</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.questions.map((q) => {
                              const qo = questionOverrides.get(q.directoryName);
                              return (
                                <tr key={q.directoryName}>
                                  <td>{qo?.title ?? q.infoJson.title}</td>
                                  <td className="text-muted">
                                    {detectQuestionType(q.questionHtml)}
                                  </td>
                                  <td>{formatGradingMethod(q.infoJson.gradingMethod)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </div>
                    </Collapse>
                  </Card.Body>
                )}
              </Card>
            ))}

            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={() => setStep('upload')}>
                <i className="bi bi-arrow-left me-1" aria-hidden="true" />
                Back
              </Button>
              <Button
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

        {step === 'done' && (
          <div className="text-center py-4">
            <i
              className="bi bi-check-circle-fill text-success d-block mb-3"
              style={{ fontSize: '3rem' }}
              aria-hidden="true"
            />
            <p className="h5 mb-3">Import complete</p>
            <p className="text-muted mb-3">
              {createdIds.length} assessment{createdIds.length !== 1 ? 's' : ''} created
              successfully.
            </p>
            <div className="d-flex justify-content-center gap-2">
              <Button variant="outline-secondary" href={`${urlPrefix}/instance_admin/assessments`}>
                View all assessments
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setStep('upload');
                  setResults([]);
                  setOverrides([]);
                  setQuestionOverrides(new Map());
                  setCreatedIds([]);
                  setExpandedQuestions(new Set());
                  setPreviewingQuestions(new Set());
                }}
              >
                Import more
              </Button>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
CanvasImportForm.displayName = 'CanvasImportForm';

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
        Upload a Canvas quiz export (<code>.zip</code>) or a full Canvas course export (
        <code>.imscc</code>) to import assessments and questions into this course instance.
      </p>
      <div className="mb-3">
        <Form.Label htmlFor="canvas-file">Canvas export file</Form.Label>
        <Form.Control
          id="canvas-file"
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
            Upload and analyze
          </>
        )}
      </Button>
    </form>
  );
}

function QuestionReviewItem({
  question: dq,
  overrides: qo,
  isExpanded,
  isPreviewing,
  onToggleExpand,
  onTogglePreview,
  onUpdateOverride,
}: {
  question: DeduplicatedQuestion;
  overrides: QuestionOverrides | undefined;
  isExpanded: boolean;
  isPreviewing: boolean;
  onToggleExpand: () => void;
  onTogglePreview: () => void;
  onUpdateOverride: (updates: Partial<QuestionOverrides>) => void;
}) {
  const questionType = detectQuestionType(dq.source.questionHtml);

  return (
    <div className="list-group-item">
      <div className="d-flex align-items-center gap-2">
        <Button
          variant="link"
          size="sm"
          className="p-0 text-decoration-none"
          aria-expanded={isExpanded}
          aria-controls={`q-edit-${dq.directoryName}`}
          onClick={onToggleExpand}
        >
          <i
            className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`}
            aria-hidden="true"
          />
        </Button>
        <div className="flex-grow-1 d-flex align-items-center gap-2">
          <span className="fw-medium">{qo?.title ?? dq.source.infoJson.title}</span>
          <span className="text-muted small">
            {formatGradingMethod(dq.source.infoJson.gradingMethod)}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex gap-1">
            <Badge bg="primary" className="fw-normal">
              {questionType}
            </Badge>
            {(qo?.tags ?? dq.source.infoJson.tags).map((tag) => (
              <Badge key={tag} bg="secondary" className="fw-normal">
                {tag}
              </Badge>
            ))}
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            aria-expanded={isPreviewing}
            aria-controls={`q-preview-${dq.directoryName}`}
            onClick={onTogglePreview}
          >
            <i className="bi bi-code-slash me-1" aria-hidden="true" />
            {isPreviewing ? 'Hide markup' : 'View markup'}
          </Button>
        </div>
      </div>

      <Collapse in={isPreviewing}>
        <div id={`q-preview-${dq.directoryName}`}>
          <pre
            className="mt-2 p-3 bg-dark text-white rounded small mb-0"
            style={{ maxHeight: '400px', overflow: 'auto' }}
          >
            <code>{dq.source.questionHtml}</code>
          </pre>
        </div>
      </Collapse>

      <Collapse in={isExpanded}>
        <div id={`q-edit-${dq.directoryName}`}>
          <div className="row g-3 mt-1">
            <div className="col-md-5">
              <Form.Label htmlFor={`q-title-${dq.directoryName}`} className="small">
                Title
              </Form.Label>
              <Form.Control
                id={`q-title-${dq.directoryName}`}
                size="sm"
                type="text"
                value={qo?.title ?? ''}
                onChange={(e) => onUpdateOverride({ title: e.target.value })}
              />
            </div>
            <div className="col-md-7">
              <Form.Label htmlFor={`q-tags-${dq.directoryName}`} className="small">
                Tags (comma-separated)
              </Form.Label>
              <Form.Control
                id={`q-tags-${dq.directoryName}`}
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
          </div>
          <QuestionFileTree question={dq} />
        </div>
      </Collapse>
    </div>
  );
}

function QuestionFileTree({ question: dq }: { question: DeduplicatedQuestion }) {
  const files: string[] = ['info.json', 'question.html'];
  if (dq.source.serverPy) {
    files.push('server.py');
  }
  const clientFileNames = Object.keys(dq.source.clientFiles);
  const hasClientFiles = clientFileNames.length > 0;

  return (
    <div className="small text-muted mt-2 font-monospace">
      <div>
        <i className="bi bi-folder-fill me-1" aria-hidden="true" />
        questions/{dq.directoryName}/
        {dq.assessmentIndices.length > 1 && (
          <span className="ms-2 font-sans fst-italic">
            (shared across {dq.assessmentIndices.length} assessments)
          </span>
        )}
      </div>
      {files.map((f) => (
        <div key={f} className="ms-3">
          <i className="bi bi-file-earmark me-1" aria-hidden="true" />
          {f}
        </div>
      ))}
      {hasClientFiles && (
        <>
          <div className="ms-3">
            <i className="bi bi-folder me-1" aria-hidden="true" />
            clientFilesQuestion/
          </div>
          {clientFileNames.map((f) => (
            <div key={f} className="ms-5">
              <i className="bi bi-file-earmark-image me-1" aria-hidden="true" />
              {f}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AssessmentMetaSummary({
  infoJson,
}: {
  infoJson: SerializedConversionResult['assessment']['infoJson'];
}) {
  const rules = infoJson.allowAccess ?? [];
  const timeLimit = rules.find((r) => r.timeLimitMin)?.timeLimitMin;
  const hasPassword = rules.some((r) => r.password);

  return (
    <div>
      <Form.Label>Properties</Form.Label>
      <div className="small text-muted">
        {timeLimit && (
          <div>
            <i className="bi bi-clock me-1" aria-hidden="true" />
            {timeLimit} min time limit
          </div>
        )}
        {hasPassword && (
          <div>
            <i className="bi bi-lock me-1" aria-hidden="true" />
            Password protected
          </div>
        )}
        {infoJson.shuffleQuestions && (
          <div>
            <i className="bi bi-shuffle me-1" aria-hidden="true" />
            Shuffled questions
          </div>
        )}
        {!timeLimit && !hasPassword && !infoJson.shuffleQuestions && (
          <span className="text-muted">No special properties</span>
        )}
      </div>
    </div>
  );
}

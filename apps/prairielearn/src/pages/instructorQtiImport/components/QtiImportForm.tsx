import { filesize } from 'filesize';
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';

import type { IRSourceBankRef, PLAssessmentQuestion } from '@prairielearn/question-conversion';
import {
  defaultTrimmedQtiArchiveName,
  trimQtiArchive,
} from '@prairielearn/question-conversion/trimmer';
import { getAppError } from '@prairielearn/trpc/client';

import { getCourseInstanceBaseUrl } from '../../../lib/client/url.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import type { QtiImportError } from '../../../trpc/course/qti-import.js';
import { buildImportPayload, getIncludedQuestionCount } from '../instructorQtiImport.payload.js';
import {
  type AssessmentOverrides,
  type CourseInstanceOption,
  type ParseWarning,
  QTI_IMPORT_MAX_UPLOAD_BYTES,
  type QuestionOverrides,
  type SerializedConversionResult,
  type StrippedAccessRules,
  type UploadResponse,
  deduplicateAssessmentZoneQuestions,
  getUnresolvedSourceBankRefs,
  hasCanvasUnresolvedSourceBankRefs,
} from '../instructorQtiImport.types.js';

import {
  AssessmentQuestionsSection,
  ImportSummary,
  MissingBanksStep,
  NonRubricWarnings,
  type ProcessingPhase,
  QuestionBankDeduplicationWarning,
  UnresolvedBankWarnings,
  UploadStep,
} from './ImportReviewComponents.js';

type ImportStep = 'upload' | 'missing-banks' | 'review' | 'creating';

const FALLBACK_ASSESSMENT_SETS = [
  'Homework',
  'Quiz',
  'Practice Quiz',
  'Exam',
  'Practice Exam',
  'Prep',
  'Machine Problem',
  'Worksheet',
];
const QTI_IMPORT_MAX_TRIMMED_SIZE_LABEL = filesize(QTI_IMPORT_MAX_UPLOAD_BYTES, {
  round: 0,
  standard: 'jedec',
});

function useBeforeUnload(enabled: boolean): () => void {
  const disabledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: BeforeUnloadEvent) => {
      if (disabledRef.current) return;
      event.preventDefault();
      // MDN recommends setting returnValue for legacy browser support:
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = 'prompt';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);

  return () => {
    disabledRef.current = true;
  };
}

function deduplicateAssessmentNumbers(
  results: SerializedConversionResult[],
  existingLabels: { set: string; number: string }[],
): AssessmentOverrides[] {
  const overrides: AssessmentOverrides[] = results.map((r) => {
    if (r.sourceType === 'assessment') {
      return {
        title: r.assessment.infoJson.title,
        type: r.assessment.infoJson.type,
        set: r.assessment.infoJson.set,
        number: r.assessment.infoJson.number,
        included: r.questions.length > 0,
      };
    }
    return {
      title: r.title,
      type: 'Homework',
      set: 'Homework',
      number: '1',
      included: r.questions.length > 0,
    };
  });

  // Seed with existing (set, number) pairs so imports don't collide.
  const usedBySet = new Map<string, Set<string>>();
  for (const { set, number } of existingLabels) {
    const used = usedBySet.get(set) ?? new Set<string>();
    used.add(number);
    usedBySet.set(set, used);
  }

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

function resultDirectoryName(result: SerializedConversionResult): string {
  return result.sourceType === 'assessment'
    ? result.assessment.directoryName
    : result.directoryName;
}

function countUnresolvedSourceBankRefs(results: SerializedConversionResult[]): number {
  return results.reduce((count, result) => count + getUnresolvedSourceBankRefs(result).length, 0);
}

function hasUnresolvedSourceBankRefs(results: SerializedConversionResult[]): boolean {
  return results.some((result) => getUnresolvedSourceBankRefs(result).length > 0);
}

function mergeSourceBankResults(
  primaryResults: SerializedConversionResult[],
  supplementalResults: SerializedConversionResult[],
  { includeUnmatchedBanks = true }: { includeUnmatchedBanks?: boolean } = {},
): SerializedConversionResult[] {
  const bankResults = supplementalResults.filter((result) => result.sourceType === 'question-bank');
  const bankBySourceId = new Map(bankResults.map((result) => [result.sourceId, result]));
  const usedBankSourceIds = new Set<string>();

  const mergedPrimary = primaryResults.map((result) => {
    if (result.sourceType === 'question-bank') return result;

    const refs = getUnresolvedSourceBankRefs(result);
    if (refs.length === 0) return result;

    let changed = false;
    const questionsByDir = new Map(
      result.questions.map((question) => [question.directoryName, question]),
    );
    const zones = [...result.assessment.infoJson.zones];
    const remainingRefs: IRSourceBankRef[] = [];
    const removedWarningQuestionIds = new Set<string>();

    for (const ref of refs) {
      const bank = bankBySourceId.get(ref.sourceBankExportId ?? ref.sourceBankRef);
      if (!bank || bank.questions.length === 0) {
        remainingRefs.push(ref);
        continue;
      }

      usedBankSourceIds.add(bank.sourceId);
      changed = true;
      removedWarningQuestionIds.add(ref.sourceBankRef);

      for (const question of bank.questions) {
        questionsByDir.set(question.directoryName, question);
      }

      const zoneQuestions: PLAssessmentQuestion[] = bank.questions.map((question) => {
        const zoneQuestion: PLAssessmentQuestion = { id: question.directoryName };
        if (question.infoJson.gradingMethod === 'Manual') {
          if (ref.points != null) zoneQuestion.manualPoints = ref.points;
        } else if (ref.points != null) {
          zoneQuestion.autoPoints = ref.points;
        }
        return zoneQuestion;
      });
      zones.push({
        title: ref.title,
        questions: zoneQuestions,
        ...(ref.numberChoose != null && ref.numberChoose < zoneQuestions.length
          ? { numberChoose: ref.numberChoose }
          : {}),
      });
    }

    if (!changed) return result;

    // A bank question may already be on the assessment directly, or two
    // matched banks may share deduplicated questions; keep only the first
    // reference so the assessment can sync.
    const { zones: dedupedZones, warnings: duplicateWarnings } =
      deduplicateAssessmentZoneQuestions(zones);

    return {
      ...result,
      unresolvedSourceBankRefs: remainingRefs.length > 0 ? remainingRefs : undefined,
      assessment: {
        ...result.assessment,
        infoJson: {
          ...result.assessment.infoJson,
          zones: dedupedZones,
        },
      },
      questions: [...questionsByDir.values()],
      warnings: [
        ...result.warnings.filter((warning) => !removedWarningQuestionIds.has(warning.questionId)),
        ...duplicateWarnings,
      ],
    };
  });

  const unmatchedBanks = includeUnmatchedBanks
    ? bankResults.filter((result) => !usedBankSourceIds.has(result.sourceId))
    : [];
  return [...mergedPrimary, ...unmatchedBanks];
}

function mergeEmbeddedSourceBanks(
  results: SerializedConversionResult[],
): SerializedConversionResult[] {
  const assessments = results.filter((result) => result.sourceType === 'assessment');
  if (assessments.length === 0) return results;

  return mergeSourceBankResults(assessments, results);
}

export function QtiImportForm({
  courseId,
  urlPrefix,
  courseInstances,
  initialCourseInstanceId,
  csrfTokens,
  returnTo,
}: {
  courseId: string;
  urlPrefix: string;
  courseInstances: CourseInstanceOption[];
  /** Preselected import target; null when the course has no course instances. */
  initialCourseInstanceId: string | null;
  csrfTokens: { upload: string; trpc: string };
  returnTo: 'assessments' | 'questions';
}) {
  const [selectedCourseInstanceId, setSelectedCourseInstanceId] = useState(initialCourseInstanceId);
  // Assessments live in a course instance, so without one only questions can be imported.
  const canImportAssessments = selectedCourseInstanceId != null;
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: csrfTokens.trpc, courseId }),
  );
  const [step, setStep] = useState<ImportStep>('upload');
  const [results, setResults] = useState<SerializedConversionResult[]>([]);
  const [overrides, setOverrides] = useState<AssessmentOverrides[]>([]);
  const [existingDirs, setExistingDirs] = useState<Set<string>>(new Set());
  const [strippedRules, setStrippedRules] = useState<StrippedAccessRules | null>(null);
  const [parseWarnings, setParseWarnings] = useState<ParseWarning[]>([]);
  const [deduplicatedQuestionBankQuestionCount, setDeduplicatedQuestionBankQuestionCount] =
    useState(0);
  const [questionOverrides, setQuestionOverrides] = useState<Map<string, QuestionOverrides>>(
    new Map(),
  );
  const [assessmentSetNames, setAssessmentSetNames] = useState<string[]>(FALLBACK_ASSESSMENT_SETS);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle');
  const uploading = processingPhase !== 'idle';
  const [uploadingBankKey, setUploadingBankKey] = useState<string | null>(null);
  const [error, setError] = useState<{
    message: string;
    jobSequenceId?: string;
    canRestart?: boolean;
  } | null>(null);
  const [supplementalSuccessMessage, setSupplementalSuccessMessage] = useState<string | null>(null);
  const hasUnsavedImportWork =
    results.length > 0 && (step === 'missing-banks' || step === 'review');
  const disableBeforeUnload = useBeforeUnload(hasUnsavedImportWork);

  const uploadExport = async (form: HTMLFormElement): Promise<UploadResponse> => {
    const formData = new FormData(form);
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new Error('No file selected');
    }

    const trimmed = await trimQtiArchive(file, file.name);
    if (trimmed.blob.size > QTI_IMPORT_MAX_UPLOAD_BYTES) {
      const trimmedSizeLabel = filesize(trimmed.blob.size, { round: 0, standard: 'jedec' });
      throw new Error(
        `The importable QTI content is ${trimmedSizeLabel}. The maximum import size is ${QTI_IMPORT_MAX_TRIMMED_SIZE_LABEL}.`,
      );
    }
    const trimmedFile = new File([trimmed.blob], defaultTrimmedQtiArchiveName(file.name), {
      type: 'application/zip',
      lastModified: Date.now(),
    });
    formData.set('file', trimmedFile);

    if (selectedCourseInstanceId != null) {
      formData.set('course_instance_id', selectedCourseInstanceId);
    }

    setProcessingPhase('uploading');
    const response = await fetch(`${urlPrefix}/course_admin/qti_import/upload`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfTokens.upload,
        Accept: 'application/json',
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

    return response.json() as Promise<UploadResponse>;
  };

  const handleExportUpload = async (
    e: SubmitEvent<HTMLFormElement>,
    onSuccess: (data: UploadResponse) => void,
  ) => {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setSupplementalSuccessMessage(null);
    setProcessingPhase('trimming');
    setUploadingBankKey(form.dataset.sourceBankKey ?? null);

    try {
      const data = await uploadExport(form);
      onSuccess(data);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploadingBankKey(null);
      setProcessingPhase('idle');
    }
  };

  const handleUpload = async (e: SubmitEvent<HTMLFormElement>) => {
    await handleExportUpload(e, (data) => {
      if (data.results.length === 0 && data.parseWarnings.length === 0) {
        throw new Error('No QTI content found in the uploaded file');
      }

      if (data.results.length === 0 && data.parseWarnings.length > 0) {
        throw new Error(
          `All QTI entries failed to parse:\n${data.parseWarnings.map((w) => `  ${w.filename}: ${w.message}`).join('\n')}`,
        );
      }

      const dirs = new Set(data.existingQuestionDirs);
      setExistingDirs(dirs);
      setStrippedRules(data.strippedAccessRules);
      setParseWarnings(data.parseWarnings);
      setDeduplicatedQuestionBankQuestionCount(data.deduplicatedQuestionBankQuestionCount);
      const mergedResults = mergeEmbeddedSourceBanks(data.results);
      setResults(mergedResults);
      if (data.assessmentSetNames.length > 0) {
        setAssessmentSetNames(data.assessmentSetNames);
      }
      setOverrides(deduplicateAssessmentNumbers(mergedResults, data.existingAssessmentLabels));
      setQuestionOverrides(buildInitialQuestionOverrides(mergedResults, dirs));
      setStep(hasUnresolvedSourceBankRefs(mergedResults) ? 'missing-banks' : 'review');
    });
  };

  const handleBankUpload = async (e: SubmitEvent<HTMLFormElement>) => {
    await handleExportUpload(e, (data) => {
      const previousUnresolvedCount = countUnresolvedSourceBankRefs(results);
      const mergedResults = mergeSourceBankResults(results, data.results, {
        includeUnmatchedBanks: false,
      });
      const unresolvedCount = countUnresolvedSourceBankRefs(mergedResults);
      setResults(mergedResults);
      setParseWarnings((prev) => [...prev, ...data.parseWarnings]);
      setQuestionOverrides(buildInitialQuestionOverrides(mergedResults, existingDirs));
      setOverrides(deduplicateAssessmentNumbers(mergedResults, data.existingAssessmentLabels));
      if (unresolvedCount >= previousUnresolvedCount) {
        const refs = results.flatMap((result) => getUnresolvedSourceBankRefs(result));
        const exportType = hasCanvasUnresolvedSourceBankRefs(refs)
          ? 'Canvas course export'
          : 'export';
        setError({
          message: `No matching question banks were found in that upload. Try another ${exportType}, or continue without the missing bank questions.`,
        });
      } else if (unresolvedCount > 0) {
        const matchedCount = previousUnresolvedCount - unresolvedCount;
        setSupplementalSuccessMessage(
          `Matched ${matchedCount} question bank${matchedCount !== 1 ? 's' : ''} from that upload. Upload the remaining exported content to resolve the rest.`,
        );
      }
      setStep(hasUnresolvedSourceBankRefs(mergedResults) ? 'missing-banks' : 'review');
    });
  };

  const handleCreate = async () => {
    setError(null);
    setStep('creating');

    try {
      const payload = buildImportPayload({
        results,
        overrides,
        questionOverrides,
        existingDirs,
        courseInstanceId: selectedCourseInstanceId,
      });

      const payloadJson = JSON.stringify(payload);
      const payloadBytes = new TextEncoder().encode(payloadJson).length;
      const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        throw new Error(
          `The import payload is too large (${(payloadBytes / (1024 * 1024)).toFixed(1)} MB). ` +
            'Try importing fewer items at once, or remove large image assets from the export before importing.',
        );
      }

      await trpcClient.qtiImport.create.mutate(payload);

      disableBeforeUnload();
      window.location.href =
        returnTo === 'assessments' && selectedCourseInstanceId != null
          ? `${getCourseInstanceBaseUrl(selectedCourseInstanceId)}/instructor/instance_admin/assessments`
          : `${urlPrefix}/course_admin/questions`;
    } catch (err) {
      const appError = getAppError<QtiImportError['Create']>(err);
      if (appError?.code === 'SYNC_JOB_FAILED') {
        setError({ message: appError.message, jobSequenceId: appError.jobSequenceId });
      } else if (appError?.code === 'QTI_IMPORT_DRAFT_UNAVAILABLE') {
        setError({ message: appError.message, canRestart: true });
      } else {
        setError({
          message: err instanceof Error ? err.message : `Failed to create ${createContentLabel}`,
        });
      }
      setStep('review');
    }
  };

  const updateOverride = (index: number, updates: Partial<AssessmentOverrides>) => {
    setOverrides((prev) => prev.map((o, i) => (i === index ? { ...o, ...updates } : o)));
  };

  const updateQuestionOverride = useCallback(
    (dirName: string, updates: Partial<QuestionOverrides>) => {
      setQuestionOverrides((prev) => {
        const next = new Map(prev);
        const current = next.get(dirName);
        if (current) {
          next.set(dirName, { ...current, ...updates });
        }
        return next;
      });
    },
    [],
  );

  const includedAssessmentCount = canImportAssessments
    ? results.filter(
        (result, i) =>
          overrides[i]?.included &&
          result.sourceType === 'assessment' &&
          getIncludedQuestionCount(result, questionOverrides) > 0,
      ).length
    : 0;
  const hasAssessmentResults = results.some((result) => result.sourceType === 'assessment');
  const includedQuestionDirs = new Set<string>();
  for (const [i, result] of results.entries()) {
    if (!overrides[i]?.included) continue;
    if (canImportAssessments && result.sourceType === 'assessment') continue;
    for (const question of result.questions) {
      if (questionOverrides.get(question.directoryName)?.included !== false) {
        includedQuestionDirs.add(question.directoryName);
      }
    }
  }
  const includedQuestionCount = includedQuestionDirs.size;
  const canImport = includedAssessmentCount > 0 || includedQuestionCount > 0;
  const labelParts: string[] = [];
  if (canImportAssessments && hasAssessmentResults) {
    labelParts.push(
      `${includedAssessmentCount} assessment${includedAssessmentCount !== 1 ? 's' : ''}`,
    );
  }
  if (includedQuestionCount > 0 || labelParts.length === 0) {
    labelParts.push(`${includedQuestionCount} question${includedQuestionCount !== 1 ? 's' : ''}`);
  }
  const importButtonLabel = `Import ${labelParts.join(' and ')}`;
  const createContentLabel =
    includedAssessmentCount > 0 ? 'assessments and questions' : 'questions';
  const indexedResults = results.map((result, index) => ({ result, index }));
  const assessmentResults = indexedResults.filter(
    ({ result }) => result.sourceType === 'assessment',
  );
  const questionBankResults = indexedResults.filter(
    ({ result }) => result.sourceType === 'question-bank',
  );

  const resetAll = () => {
    setStep('upload');
    setResults([]);
    setOverrides([]);
    setExistingDirs(new Set());
    setStrippedRules(null);
    setParseWarnings([]);
    setDeduplicatedQuestionBankQuestionCount(0);
    setQuestionOverrides(new Map());
    setSupplementalSuccessMessage(null);
    setUploadingBankKey(null);
  };

  const skipMissingBanks = () => {
    setError(null);
    setSupplementalSuccessMessage(null);
    setStep('review');
  };

  const renderResultCard = ({
    result,
    index: i,
  }: {
    result: SerializedConversionResult;
    index: number;
  }) => (
    <Card key={resultDirectoryName(result)} className="mb-3">
      <Card.Header className="d-flex align-items-center gap-2">
        <Form.Check
          id={`include-${i}`}
          checked={overrides[i].included}
          disabled={result.questions.length === 0}
          label=""
          aria-label={`Include ${result.title}`}
          onChange={(e) => updateOverride(i, { included: e.target.checked })}
        />
        <div className="flex-grow-1">
          <strong>{result.title}</strong>
          <span className="text-muted ms-2">
            ({result.questions.length} question{result.questions.length !== 1 ? 's' : ''})
          </span>
          {result.sourceType === 'question-bank' && (
            <span className="badge color-blue3 ms-2">Question bank</span>
          )}
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
          {canImportAssessments && result.sourceType === 'assessment' && (
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
                  {assessmentSetNames.map((s) => (
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
          )}

          <NonRubricWarnings
            warnings={result.warnings}
            questions={result.questions}
            questionOverrides={questionOverrides}
          />

          <AssessmentQuestionsSection
            questions={result.questions}
            warnings={result.warnings}
            questionOverrides={questionOverrides}
            existingDirs={existingDirs}
            onUpdateOverride={updateQuestionOverride}
          />
        </Card.Body>
      )}
    </Card>
  );

  return (
    <Card className="mb-4">
      <Card.Header className="bg-primary text-white">
        <h1 className="h6 mb-0">Import QTI content</h1>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error.message}
            {error.jobSequenceId && (
              <>
                {' '}
                <Alert.Link href={`${urlPrefix}/edit_error/${error.jobSequenceId}`}>
                  View sync errors
                </Alert.Link>
              </>
            )}
            {error.canRestart && (
              <div className="mt-2">
                <Button variant="outline-danger" size="sm" onClick={resetAll}>
                  Start over
                </Button>
              </div>
            )}
          </Alert>
        )}

        {step === 'upload' && (
          <UploadStep
            uploading={uploading}
            processingPhase={processingPhase}
            courseInstances={courseInstances}
            selectedCourseInstanceId={selectedCourseInstanceId}
            onSubmit={handleUpload}
            onCourseInstanceChange={setSelectedCourseInstanceId}
          />
        )}

        {step === 'missing-banks' && (
          <MissingBanksStep
            results={results}
            uploading={uploading}
            processingPhase={processingPhase}
            uploadingBankKey={uploadingBankKey}
            successMessage={supplementalSuccessMessage}
            onSubmit={handleBankUpload}
            onSkip={skipMissingBanks}
            onStartOver={resetAll}
          />
        )}

        {step === 'review' && (
          <>
            <ImportSummary
              results={results}
              strippedAccessRules={strippedRules}
              parseWarnings={parseWarnings}
              canImportAssessments={canImportAssessments}
            />

            <UnresolvedBankWarnings results={results} />

            <p className="text-muted">
              Review the assessments and questions below, then confirm to create them in your
              PrairieLearn course.
            </p>

            {assessmentResults.length > 0 && (
              <section className="mb-4" aria-labelledby="qti-import-assessments-heading">
                <h2 id="qti-import-assessments-heading" className="h4 mb-1">
                  Assessments
                </h2>
                {canImportAssessments ? (
                  <p className="text-muted mb-3">
                    Assessments are imported to PrairieLearn with their questions and basic quiz
                    structure. After import, you can edit their settings, adjust question order and
                    points, and assign them like any other assessment.
                  </p>
                ) : (
                  <p className="text-muted mb-3">
                    This course has no course instances yet, so only the questions from these
                    assessments will be imported.
                  </p>
                )}
                {assessmentResults.map(renderResultCard)}
              </section>
            )}

            {questionBankResults.length > 0 && (
              <section
                className={assessmentResults.length > 0 ? 'mb-4 border-top pt-4' : 'mb-4'}
                aria-labelledby="qti-import-question-banks-heading"
              >
                <h2 id="qti-import-question-banks-heading" className="h4 mb-1">
                  Question banks
                </h2>
                <p className="text-muted mb-3">
                  Question banks are imported as a set of PrairieLearn questions in your course. You
                  can add them to existing assessments or use them in any new assessments you
                  create.
                </p>
                <QuestionBankDeduplicationWarning
                  deduplicatedQuestionCount={deduplicatedQuestionBankQuestionCount}
                />
                {questionBankResults.map(renderResultCard)}
              </section>
            )}

            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={resetAll}>
                <i className="bi bi-arrow-left me-1" aria-hidden="true" />
                Start over
              </Button>
              <Button
                className="ms-auto"
                variant="primary"
                disabled={!canImport}
                onClick={() => void handleCreate()}
              >
                {importButtonLabel}
              </Button>
            </div>
          </>
        )}

        {step === 'creating' && (
          <div className="text-center py-4">
            <Spinner className="mb-3" />
            <p>Creating {createContentLabel}...</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
QtiImportForm.displayName = 'QtiImportForm';

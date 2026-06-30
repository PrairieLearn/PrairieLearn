import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { StickySaveBar, type StickySaveBarAlert, useModalState } from '@prairielearn/ui';

import { GitHubButton } from '../../components/GitHubButton.js';
import { StudentLinkSharing } from '../../components/LinkSharing.js';
import { ShareSourcePubliclyCard } from '../../components/ShareSourcePubliclyCard.js';
import { AssessmentShortNameDescription } from '../../components/ShortNameDescriptions.js';
import {
  AppErrorAlert,
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../../lib/client/errors.js';
import type {
  StaffAssessment,
  StaffAssessmentModule,
  StaffAssessmentSet,
  StaffCourseInstance,
} from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import {
  getAssessmentLogsUrl,
  getAssessmentStudentsUrl,
  getCourseInstanceSettingsUrl,
  getQuestionSettingsUrl,
} from '../../lib/client/url.js';
import type { AssessmentToolsConfig } from '../../lib/editors.js';
import { validateShortName } from '../../lib/short-name.js';
import type {
  AssessmentSettingsError,
  TypeChangeLocation,
} from '../../trpc/assessment/assessment-settings.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

function ScoringSummary({
  zonePointsRange,
  useCustomMaxPoints,
  customMaxPoints,
  bonusPoints,
}: {
  zonePointsRange: { min: number; max: number };
  useCustomMaxPoints: boolean;
  customMaxPoints: number;
  bonusPoints: number;
}) {
  const totalPoints = useCustomMaxPoints ? customMaxPoints + bonusPoints : zonePointsRange.max;

  if (useCustomMaxPoints) {
    if (customMaxPoints <= 0) {
      return (
        <Alert variant="light" className="mb-0 small">
          <i className="bi bi-info-circle-fill me-2" aria-hidden="true" />
          {bonusPoints > 0 ? (
            <>
              Students get up to {totalPoints} points: all points are treated as bonus &mdash; 100%
              is achieved with 0 points.
            </>
          ) : (
            <>Students need 0 points for 100%.</>
          )}
        </Alert>
      );
    }
    const maxPerc =
      bonusPoints > 0 ? Math.round(((customMaxPoints + bonusPoints) / customMaxPoints) * 100) : 100;
    return (
      <Alert variant="light" className="mb-0 small">
        <i className="bi bi-info-circle-fill me-2" aria-hidden="true" />
        {bonusPoints > 0 ? (
          <>
            Students get up to {totalPoints} points: 100% at {customMaxPoints} points, and up to{' '}
            {maxPerc}% with {bonusPoints} bonus points.
          </>
        ) : (
          <>Students need {customMaxPoints} points for 100%.</>
        )}
      </Alert>
    );
  }

  if (bonusPoints >= zonePointsRange.max && bonusPoints > 0) {
    return (
      <Alert variant="light" className="mb-0 small">
        <i className="bi bi-info-circle-fill me-2" aria-hidden="true" />
        Students get up to {totalPoints} points: all zone points are treated as bonus &mdash; 100%
        is achieved with 0 points.
      </Alert>
    );
  }

  const effectiveMax = Math.max(zonePointsRange.max - bonusPoints, 0);
  const effectiveMin = Math.max(zonePointsRange.min - bonusPoints, 0);
  const isRange = effectiveMin !== effectiveMax;
  const neededText = isRange ? `${effectiveMin}–${effectiveMax}` : String(effectiveMax);
  const maxPerc =
    bonusPoints > 0 ? Math.round(((effectiveMax + bonusPoints) / effectiveMax) * 100) : 100;

  return (
    <Alert variant="light" className="mb-0 small">
      <i className="bi bi-info-circle-fill me-2" aria-hidden="true" />
      {bonusPoints > 0 ? (
        <>
          Students get up to {totalPoints} points: 100% at {neededText} points, and up to {maxPerc}%
          with {bonusPoints} bonus points.
        </>
      ) : (
        <>Students need {neededText} points for 100%.</>
      )}
    </Alert>
  );
}

interface SettingsFormValues {
  aid: string;
  title: string;
  set: string;
  number: string;
  module: string;
  text?: string;
  allow_issue_reporting: boolean;
  allow_personal_notes: boolean;
  showQuestionTitles: boolean;
  multiple_instance: boolean;
  auto_close: boolean;
  require_honor_code: boolean;
  honor_code?: string;
  max_points: string;
  max_bonus_points: string;
  constant_question_value: boolean;
  shuffle_questions: boolean;
  advance_score_perc: string;
  allow_real_time_grading: boolean;
  grade_rate_minutes: string;
  tools?: Record<string, boolean>;
  share_source_publicly?: boolean;
}

interface InstructorAssessmentSettingsProps {
  trpcCsrfToken: string;
  urlPrefix: string;
  canEdit: boolean;
  canViewLogs: boolean;
  origHash: string;
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  assessmentGHLink: string | null;
  tids: string[];
  studentLink: string;
  publicLink: string;
  assessmentSets: StaffAssessmentSet[];
  assessmentModules: StaffAssessmentModule[];
  courseInstance: StaffCourseInstance;
  isDevMode: boolean;
  assessmentTools: AssessmentToolsConfig;
  zonePointsRange: { min: number; max: number };
  nonPublicQuestionsInAssessment: { id: string; qid: string }[];
  questionSharingEnabled: boolean;
  hasInstances: boolean;
}

export function InstructorAssessmentSettings({
  trpcCsrfToken,
  urlPrefix,
  canEdit,
  canViewLogs,
  origHash,
  assessment: initialAssessment,
  assessmentSet,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  assessmentSets,
  assessmentModules,
  courseInstance,
  isDevMode,
  assessmentTools,
  zonePointsRange: initialZonePointsRange,
  nonPublicQuestionsInAssessment,
  questionSharingEnabled,
  hasInstances,
}: InstructorAssessmentSettingsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
      assessmentId: initialAssessment.id,
    }),
  );
  const [assessment, setAssessment] = useState(initialAssessment);
  const [zonePointsRange, setZonePointsRange] = useState(initialZonePointsRange);
  const [currentOrigHash, setCurrentOrigHash] = useState(origHash);
  const [typeChangeMessage, setTypeChangeMessage] = useState<string | null>(null);

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentSettingsInner
          key={assessment.type}
          urlPrefix={urlPrefix}
          canEdit={canEdit}
          canViewLogs={canViewLogs}
          origHash={currentOrigHash}
          setCurrentOrigHash={setCurrentOrigHash}
          assessment={assessment}
          setAssessment={setAssessment}
          assessmentSet={assessmentSet}
          assessmentGHLink={assessmentGHLink}
          tids={tids}
          studentLink={studentLink}
          publicLink={publicLink}
          assessmentSets={assessmentSets}
          assessmentModules={assessmentModules}
          assessmentTools={assessmentTools}
          zonePointsRange={zonePointsRange}
          setZonePointsRange={setZonePointsRange}
          nonPublicQuestionsInAssessment={nonPublicQuestionsInAssessment}
          courseInstanceSharedPublicly={courseInstance.share_source_publicly}
          questionSharingEnabled={questionSharingEnabled}
          hasInstances={hasInstances}
          typeChangeMessage={typeChangeMessage}
          setTypeChangeMessage={setTypeChangeMessage}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentSettings.displayName = 'InstructorAssessmentSettings';

function CopyAssessmentModal({
  show,
  onHide,
  onExited,
  assessment,
  assessmentSet,
  assessmentSets,
  tidSet,
  urlPrefix,
}: {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  assessmentSets: StaffAssessmentSet[];
  tidSet: Set<string>;
  urlPrefix: string;
}) {
  const trpc = useTRPC();
  const copyMutation = useMutation(trpc.assessmentSettings.copyAssessment.mutationOptions());
  const copyError = getAppError<AssessmentSettingsError['CopyAssessment']>(copyMutation.error);

  const placeholderNumber = assessment.number;
  const defaultSet = assessmentSet.name;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ aid: string; title: string; number: string; set: string }>({
    mode: 'onSubmit',
    defaultValues: { aid: '', title: '', number: '', set: defaultSet },
  });

  const handleExited = () => {
    copyMutation.reset();
    reset({ aid: '', title: '', number: '', set: defaultSet });
    onExited();
  };

  const onSubmit = handleSubmit((data) => {
    copyMutation.mutate(data, {
      onSuccess: (result) => {
        window.location.href = `${urlPrefix}/assessment/${result.assessmentId}/settings`;
      },
    });
  });

  return (
    <Modal show={show} onHide={onHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>Make a copy of this assessment</Modal.Title>
      </Modal.Header>
      <form onSubmit={onSubmit}>
        <Modal.Body>
          <AppErrorAlert
            error={copyError}
            render={{
              SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => copyMutation.reset()}
          />
          <p className="text-muted small mb-3">
            Making a copy of <code>{assessment.tid}</code>.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="copy-assessment-title">
              Title
            </label>
            <input
              id="copy-assessment-title"
              type="text"
              className={clsx('form-control', errors.title && 'is-invalid')}
              aria-invalid={errors.title ? 'true' : 'false'}
              {...(errors.title ? { 'aria-errormessage': 'copy-assessment-title-error' } : {})}
              defaultValue=""
              {...register('title', {
                validate: (value) => (value.trim() === '' ? 'Title is required' : true),
              })}
            />
            {errors.title && (
              <div id="copy-assessment-title-error" className="invalid-feedback">
                {errors.title.message}
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="copy-assessment-aid">
              Short name
            </label>
            <input
              id="copy-assessment-aid"
              type="text"
              className={clsx('form-control font-monospace', errors.aid && 'is-invalid')}
              aria-describedby="copy-assessment-aid-help"
              aria-invalid={errors.aid ? 'true' : 'false'}
              {...(errors.aid ? { 'aria-errormessage': 'copy-assessment-aid-error' } : {})}
              defaultValue=""
              {...register('aid', {
                validate: (value) => {
                  const trimmed = value.trim();
                  if (trimmed === '') return 'Short name is required';
                  const result = validateShortName(trimmed);
                  if (!result.valid) return result.message;
                  if (tidSet.has(trimmed)) return 'This ID is already in use';
                  return true;
                },
              })}
            />
            {errors.aid && (
              <div id="copy-assessment-aid-error" className="invalid-feedback">
                {errors.aid.message}
              </div>
            )}
            <small id="copy-assessment-aid-help" className="form-text text-muted">
              <AssessmentShortNameDescription />
            </small>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3 mb-md-0">
              <label className="form-label" htmlFor="copy-assessment-set">
                Set
              </label>
              <Form.Select id="copy-assessment-set" defaultValue={defaultSet} {...register('set')}>
                {assessmentSets.map((set) => (
                  <option key={set.id} value={set.name}>
                    {set.name}
                  </option>
                ))}
              </Form.Select>
            </div>
            <div className="col-md-6 mb-0">
              <label className="form-label" htmlFor="copy-assessment-number">
                Number
              </label>
              <input
                id="copy-assessment-number"
                type="text"
                className="form-control"
                placeholder={placeholderNumber}
                defaultValue=""
                {...register('number')}
              />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={copyMutation.isPending} onClick={onHide}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={copyMutation.isPending}>
            {copyMutation.isPending ? 'Copying...' : 'Make a copy'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function formatTypeChangeLocation(location: TypeChangeLocation): string {
  if (location.kind === 'assessment') return 'Assessment';
  const zoneLabel = location.zoneTitle
    ? `Zone ${location.zoneIndex + 1} (${location.zoneTitle})`
    : `Zone ${location.zoneIndex + 1}`;
  if (location.kind === 'zone') return zoneLabel;
  const questionLabel = location.qid
    ? `${zoneLabel}, question ${location.qid}`
    : `${zoneLabel}, question ${location.questionIndex + 1}`;
  if (location.kind === 'question') return questionLabel;
  return location.alternativeQid
    ? `${questionLabel}, alternative ${location.alternativeQid}`
    : `${questionLabel}, alternative ${location.alternativeIndex + 1}`;
}

const BLOCKER_FIELD_LABELS: Record<string, string> = {
  multipleInstance: 'Multiple instances',
  autoClose: 'Auto close disabled',
  requireHonorCode: 'Honor code requirement',
  honorCode: 'Custom honor code',
  advanceScorePerc: 'Advance score threshold',
  allowRealTimeGrading: 'Real-time grading disabled',
  constantQuestionValue: 'Constant question value',
  maxPoints: 'Max points cap',
  maxAutoPoints: 'Max auto points cap',
};

function ChangeTypeModal({
  show,
  newType,
  currentType,
  hasInstances,
  origHash,
  onHide,
  onExited,
  urlPrefix,
  studentsTabUrl,
  onSuccess,
}: {
  show: boolean;
  newType: 'Exam' | 'Homework' | null;
  currentType: 'Exam' | 'Homework';
  hasInstances: boolean;
  origHash: string;
  onHide: () => void;
  onExited: () => void;
  urlPrefix: string;
  studentsTabUrl: string;
  onSuccess: (result: {
    origHash: string;
    assessment: StaffAssessment;
    zonePointsRange: { min: number; max: number };
  }) => void;
}) {
  const trpc = useTRPC();
  const [acknowledged, setAcknowledged] = useState(false);

  const analysisQuery = useQuery(
    trpc.assessmentSettings.analyzeTypeChange.queryOptions(
      { newType: newType ?? currentType, origHash },
      { enabled: show && !hasInstances && newType != null && newType !== currentType },
    ),
  );

  const changeMutation = useMutation(
    trpc.assessmentSettings.changeAssessmentType.mutationOptions(),
  );

  const changeError = getAppError<AssessmentSettingsError['ChangeAssessmentType']>(
    changeMutation.error,
  );

  const blockers = analysisQuery.data?.blockers ?? [];
  const pointsListCollapses = analysisQuery.data?.pointsListCollapses ?? [];
  const pointsListPromotions = analysisQuery.data?.pointsListPromotions ?? [];
  const hasDestructiveChanges =
    blockers.length > 0 || pointsListCollapses.length > 0 || pointsListPromotions.length > 0;

  const handleExited = () => {
    setAcknowledged(false);
    changeMutation.reset();
    onExited();
  };

  const handleConfirm = () => {
    if (newType == null) return;
    changeMutation.mutate({ newType, origHash }, { onSuccess });
  };

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>Change assessment type</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {hasInstances ? (
          <Alert variant="warning" className="mb-0">
            Students have already started this assessment. The type can't be changed while
            assessment instances exist. Delete all instances on the{' '}
            <Alert.Link href={studentsTabUrl}>Students tab</Alert.Link> to allow changes.
          </Alert>
        ) : (
          <>
            <p className="mb-3">
              You are about to change this assessment from <strong>{currentType}</strong> to{' '}
              <strong>{newType ?? currentType}</strong>.
            </p>

            <Alert variant="info" className="small mb-3">
              <strong>What changes:</strong>
              {newType === 'Homework' ? (
                <ul className="mb-0 mt-1 ps-3">
                  <li>
                    Each question generates new variants on each attempt, accumulating points across
                    them.
                  </li>
                  <li>Real-time grading is always enabled and cannot be disabled.</li>
                  <li>
                    Multiple instances, time limits, passwords, auto-close, and honor code are not
                    supported.
                  </li>
                  <li>Question ordering defaults to fixed order; honor code is off by default.</li>
                </ul>
              ) : newType === 'Exam' ? (
                <ul className="mb-0 mt-1 ps-3">
                  <li>
                    Each student gets a single variant per question, retried in place with declining
                    points.
                  </li>
                  <li>
                    Multiple instances, time limits, passwords, auto-close, and honor code become
                    available.
                  </li>
                  <li>
                    Real-time grading can be disabled per assessment, zone, question, or
                    alternative.
                  </li>
                  <li>Question ordering defaults to shuffled; honor code is on by default.</li>
                </ul>
              ) : null}
            </Alert>

            {analysisQuery.isLoading && (
              <div className="text-center py-3">
                <Spinner animation="border" role="status" size="sm" />
                <span className="ms-2 text-muted">Analyzing current configuration...</span>
              </div>
            )}

            {analysisQuery.isError && (
              <Alert variant="danger">Failed to analyze current configuration. Try again.</Alert>
            )}

            {blockers.length > 0 && (
              <Alert variant="warning" className="mb-3">
                <strong>The following configuration will be removed:</strong>
                <ul className="mb-0 mt-2 ps-3 small">
                  {blockers.map((b) => {
                    const locationKey = formatTypeChangeLocation(b.location);
                    return (
                      <li key={`${b.field}:${locationKey}`}>
                        <code>{BLOCKER_FIELD_LABELS[b.field] ?? b.field}</code> on {locationKey}
                      </li>
                    );
                  })}
                </ul>
              </Alert>
            )}

            {pointsListCollapses.length > 0 && (
              <Alert variant="warning" className="mb-3">
                <strong>Question points lists will be collapsed:</strong>
                <ul className="mb-0 mt-2 ps-3 small">
                  {pointsListCollapses.map((r) => {
                    const locationKey = formatTypeChangeLocation(r.location);
                    return (
                      <li key={`${r.field}:${locationKey}`}>
                        {locationKey} ({r.field}): <code>[{r.currentValue.join(', ')}]</code> →{' '}
                        <code>{r.newValue}</code>
                      </li>
                    );
                  })}
                </ul>
                <div className="small mt-2 mb-0">
                  Homework questions use a single per-variant value. The remaining attempt values
                  will be lost. You can adjust each question's points after the change.
                </div>
              </Alert>
            )}

            {pointsListPromotions.length > 0 && (
              <Alert variant="warning" className="mb-3">
                <strong>Each question will start as single-attempt:</strong>
                <ul className="mb-0 mt-2 ps-3 small">
                  {pointsListPromotions.map((r) => {
                    const locationKey = formatTypeChangeLocation(r.location);
                    return (
                      <li key={`${r.field}:${locationKey}`}>
                        {locationKey} ({r.field}): <code>{r.currentValue}</code> →{' '}
                        <code>[{r.newValue.join(', ')}]</code>
                      </li>
                    );
                  })}
                </ul>
                <div className="small mt-2 mb-0">
                  Homework grants the same points on every variant attempt; Exam grants points once,
                  optionally with a declining retry schedule. After the change, you can edit each
                  question to add retry values (e.g. <code>[10, 7, 5]</code>).
                </div>
              </Alert>
            )}

            <AppErrorAlert
              error={changeError}
              render={{
                SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
                UNKNOWN: ({ message }) => message,
              }}
              onDismiss={() => changeMutation.reset()}
            />

            {hasDestructiveChanges && (
              <Form.Check
                id="change-type-acknowledge"
                type="checkbox"
                className="mb-0"
                label="I understand the changes that will be made and that this can't be undone."
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={changeMutation.isPending} onClick={onHide}>
          {hasInstances ? 'Close' : 'Cancel'}
        </Button>
        {!hasInstances && (
          <Button
            variant="primary"
            disabled={
              newType == null ||
              analysisQuery.isLoading ||
              analysisQuery.isError ||
              (hasDestructiveChanges && !acknowledged) ||
              changeMutation.isPending
            }
            onClick={handleConfirm}
          >
            {changeMutation.isPending ? 'Changing type...' : `Change to ${newType ?? ''}`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

function InstructorAssessmentSettingsInner({
  urlPrefix,
  canEdit,
  canViewLogs,
  origHash,
  setCurrentOrigHash,
  assessment,
  setAssessment,
  assessmentSet,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  assessmentSets,
  assessmentModules,
  assessmentTools,
  zonePointsRange,
  setZonePointsRange,
  nonPublicQuestionsInAssessment,
  courseInstanceSharedPublicly,
  questionSharingEnabled,
  hasInstances,
  typeChangeMessage,
  setTypeChangeMessage,
}: Omit<InstructorAssessmentSettingsProps, 'trpcCsrfToken' | 'isDevMode' | 'courseInstance'> & {
  setCurrentOrigHash: (hash: string) => void;
  setAssessment: (assessment: StaffAssessment) => void;
  setZonePointsRange: (range: { min: number; max: number }) => void;
  courseInstanceSharedPublicly: boolean;
  typeChangeMessage: string | null;
  setTypeChangeMessage: (message: string | null) => void;
}) {
  const trpc = useTRPC();
  const copyModalState = useModalState<true>();
  const deleteModalState = useModalState<true>();
  const typeChangeModalState = useModalState<'Exam' | 'Homework'>();

  const currentType =
    assessment.type === 'Exam' || assessment.type === 'Homework' ? assessment.type : null;
  const [displayType, setDisplayType] = useState<'Exam' | 'Homework' | null>(currentType);

  const tidSet = new Set(tids);

  const currentModuleName =
    assessmentModules.find((m) => m.id === assessment.assessment_module_id)?.name ??
    assessmentModules[0]?.name;

  const defaultValues: SettingsFormValues = {
    aid: assessment.tid ?? '',
    title: assessment.title ?? '',
    set: assessmentSet.name,
    number: assessment.number,
    module: currentModuleName,
    text: assessment.text ?? '',
    allow_issue_reporting: assessment.allow_issue_reporting ?? true,
    allow_personal_notes: assessment.allow_personal_notes,
    showQuestionTitles: assessment.show_question_titles,
    multiple_instance: assessment.multiple_instance,
    auto_close: assessment.auto_close ?? true,
    require_honor_code: assessment.require_honor_code ?? true,
    honor_code: assessment.honor_code ?? '',
    max_points: assessment.max_points != null ? String(assessment.max_points) : '',
    max_bonus_points:
      assessment.max_bonus_points != null ? String(assessment.max_bonus_points) : '',
    constant_question_value: assessment.constant_question_value ?? false,
    shuffle_questions: assessment.shuffle_questions ?? assessment.type === 'Exam',
    advance_score_perc:
      assessment.advance_score_perc != null ? String(assessment.advance_score_perc) : '',
    allow_real_time_grading: assessment.json_allow_real_time_grading !== false,
    grade_rate_minutes:
      assessment.json_grade_rate_minutes != null ? String(assessment.json_grade_rate_minutes) : '',
    tools: Object.fromEntries(assessmentTools.map(({ name, enabled }) => [name, enabled])),
    share_source_publicly: assessment.share_source_publicly,
  };

  const {
    register,
    reset,
    watch,
    setValue,
    getValues,
    handleSubmit,
    formState: { isDirty, errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const [useCustomMaxPoints, setUseCustomMaxPoints] = useState(assessment.max_points != null);

  const saveMutation = useMutation(trpc.assessmentSettings.updateAssessment.mutationOptions());
  const deleteMutation = useMutation(trpc.assessmentSettings.deleteAssessment.mutationOptions());

  const appError = getAppError<AssessmentSettingsError['UpdateAssessment']>(saveMutation.error);
  const deleteError = getAppError<AssessmentSettingsError['DeleteAssessment']>(
    deleteMutation.error,
  );

  const saveAlert = run<StickySaveBarAlert | null>(() => {
    if (appError) {
      return {
        variant: 'danger',
        message: renderAppError(appError, {
          SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
          UNKNOWN: ({ message }) => message,
        }),
        onDismiss: () => saveMutation.reset(),
      };
    }
    if (typeChangeMessage) {
      return {
        variant: 'success',
        message: typeChangeMessage,
        onDismiss: () => setTypeChangeMessage(null),
      };
    }
    if (saveMutation.isSuccess) {
      return {
        variant: 'success',
        message: 'Assessment updated successfully.',
        onDismiss: () => saveMutation.reset(),
      };
    }
    return null;
  });

  const toNullableNumber = (v: string) => (v === '' ? null : Number(v));

  const onFormSubmit = (data: SettingsFormValues) => {
    saveMutation.mutate(
      {
        ...data,
        share_source_publicly: data.share_source_publicly,
        max_points: useCustomMaxPoints ? toNullableNumber(data.max_points) : null,
        max_bonus_points: toNullableNumber(data.max_bonus_points),
        advance_score_perc: toNullableNumber(data.advance_score_perc),
        grade_rate_minutes: toNullableNumber(data.grade_rate_minutes),
        origHash,
      },
      {
        onSuccess: (result) => {
          setCurrentOrigHash(result.origHash);
          // The sharing card reflects `assessment.share_source_publicly` (not form
          // state), and the mutation returns only the new hash, so mirror the saved
          // value onto `assessment` to avoid showing stale sharing status until the
          // next page load. `??` keeps the current value when the field was omitted
          // (e.g. a disabled checkbox).
          setAssessment({
            ...assessment,
            share_source_publicly: data.share_source_publicly ?? assessment.share_source_publicly,
          });
          reset(data);
          setUseCustomMaxPoints(data.max_points !== '');
        },
      },
    );
  };

  const requireHonorCode = watch('require_honor_code');
  const currentAid = watch('aid');
  const currentBonusPoints = Number(watch('max_bonus_points')) || 0;
  const effectiveMaxPoints = Math.max(zonePointsRange.max - currentBonusPoints, 0);
  const effectiveMinPoints = Math.max(zonePointsRange.min - currentBonusPoints, 0);
  const effectiveMaxPointsDisplay =
    effectiveMinPoints !== effectiveMaxPoints
      ? `${effectiveMinPoints}–${effectiveMaxPoints}`
      : String(effectiveMaxPoints);

  const currentGHLink =
    assessmentGHLink && assessment.tid
      ? assessmentGHLink.replace(
          `/assessments/${encodeURIComponent(assessment.tid)}`,
          `/assessments/${encodeURIComponent(currentAid)}`,
        )
      : assessmentGHLink;

  return (
    <>
      <CopyAssessmentModal
        show={copyModalState.show}
        assessment={assessment}
        assessmentSet={assessmentSet}
        assessmentSets={assessmentSets}
        tidSet={tidSet}
        urlPrefix={urlPrefix}
        onHide={copyModalState.onHide}
        onExited={copyModalState.onExited}
      />

      {currentType != null && (
        <ChangeTypeModal
          show={typeChangeModalState.show}
          newType={typeChangeModalState.data}
          currentType={currentType}
          hasInstances={hasInstances}
          origHash={origHash}
          urlPrefix={urlPrefix}
          studentsTabUrl={getAssessmentStudentsUrl({
            courseInstanceId: assessment.course_instance_id,
            assessmentId: assessment.id,
          })}
          onHide={() => {
            setDisplayType(currentType);
            typeChangeModalState.onHide();
          }}
          onExited={typeChangeModalState.onExited}
          onSuccess={(result) => {
            setAssessment(result.assessment);
            setZonePointsRange(result.zonePointsRange);
            setCurrentOrigHash(result.origHash);
            setTypeChangeMessage(`Assessment type changed to ${result.assessment.type}.`);
            typeChangeModalState.onHide();
          }}
        />
      )}

      <Modal
        show={deleteModalState.show}
        onHide={deleteModalState.onHide}
        onExited={() => {
          deleteMutation.reset();
          deleteModalState.onExited();
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={deleteError}
            render={{
              SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => deleteMutation.reset()}
          />
          <p>
            Are you sure you want to delete the assessment <b>{assessment.tid}</b>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={deleteModalState.onHide}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() =>
              deleteMutation.mutate(undefined, {
                onSuccess: () => {
                  window.location.href = `${urlPrefix}/instance_admin/assessments`;
                },
              })
            }
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>

      <form name="edit-assessment-settings-form" onSubmit={handleSubmit(onFormSubmit)}>
        <div className="container d-flex flex-column gap-3 py-3">
          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">General</h2>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="aid">
                    Short name
                  </label>
                  <input
                    type="text"
                    className={clsx('form-control font-monospace', errors.aid && 'is-invalid')}
                    id="aid"
                    aria-invalid={errors.aid ? 'true' : 'false'}
                    aria-describedby="aid-help"
                    {...(errors.aid ? { 'aria-errormessage': 'aid-error' } : {})}
                    disabled={!canEdit}
                    defaultValue={defaultValues.aid}
                    {...register('aid', {
                      required: 'Short name is required',
                      validate: {
                        shortName: (value) => {
                          const result = validateShortName(value, defaultValues.aid);
                          return result.valid || result.message;
                        },
                        duplicate: (value) => {
                          if (tidSet.has(value) && value !== defaultValues.aid) {
                            return 'This ID is already in use';
                          }
                          return true;
                        },
                      },
                    })}
                  />
                  {errors.aid && (
                    <div id="aid-error" className="invalid-feedback">
                      {errors.aid.message}
                    </div>
                  )}
                  <small id="aid-help" className="form-text text-muted">
                    <AssessmentShortNameDescription />
                  </small>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="type">
                    Type
                  </label>
                  {currentType == null ? (
                    <input
                      type="text"
                      className="form-control"
                      id="type"
                      aria-describedby="type-help"
                      value={assessment.type}
                      disabled
                      readOnly
                    />
                  ) : (
                    <Form.Select
                      id="type"
                      aria-describedby="type-help"
                      disabled={!canEdit || isDirty}
                      value={displayType ?? currentType}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value !== 'Exam' && value !== 'Homework') return;
                        setDisplayType(value);
                        if (value !== currentType) {
                          typeChangeModalState.showWithData(value);
                        }
                      }}
                    >
                      <option value="Exam">Exam</option>
                      <option value="Homework">Homework</option>
                    </Form.Select>
                  )}
                  <small id="type-help" className="form-text text-muted">
                    The type of the assessment. This can be either{' '}
                    <a href="https://docs.prairielearn.com/assessment/configuration/#assessment-types">
                      Homework or Exam
                    </a>
                    .{' '}
                    {isDirty
                      ? 'Save or discard your other changes before switching the type.'
                      : 'Changing the type may modify or remove existing configuration.'}
                  </small>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="title">
                  Title
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="title"
                  aria-describedby="title-help"
                  disabled={!canEdit}
                  defaultValue={defaultValues.title}
                  {...register('title')}
                />
                <small id="title-help" className="form-text text-muted">
                  The full name of the assessment, visible to users.
                </small>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="set">
                    Set
                  </label>
                  <Form.Select
                    id="set"
                    aria-describedby="set-help"
                    disabled={!canEdit}
                    defaultValue={defaultValues.set}
                    {...register('set')}
                  >
                    {assessmentSets.map((set) => (
                      <option key={set.id} value={set.name}>
                        {set.name}
                      </option>
                    ))}
                  </Form.Select>
                  <small id="set-help" className="form-text text-muted">
                    The <a href={`${urlPrefix}/course_admin/sets`}>assessment set</a> this
                    assessment belongs to.
                  </small>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="number">
                    Number
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="number"
                    aria-describedby="number-help"
                    disabled={!canEdit}
                    defaultValue={defaultValues.number}
                    {...register('number')}
                  />
                  <small id="number-help" className="form-text text-muted">
                    The number of the assessment within the set.
                  </small>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="module">
                  Module
                </label>
                <Form.Select
                  id="module"
                  aria-describedby="module-help"
                  disabled={!canEdit}
                  defaultValue={defaultValues.module}
                  {...register('module')}
                >
                  {assessmentModules.map((mod) => (
                    <option key={mod.id} value={mod.name}>
                      {mod.name}
                    </option>
                  ))}
                </Form.Select>
                <small id="module-help" className="form-text text-muted">
                  The <a href={`${urlPrefix}/course_admin/modules`}>module</a> this assessment
                  belongs to.
                </small>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="text">
                  Text
                </label>
                <textarea
                  className="form-control"
                  id="text"
                  aria-describedby="text-help"
                  disabled={!canEdit}
                  defaultValue={defaultValues.text}
                  {...register('text')}
                />
                <small id="text-help" className="form-text text-muted">
                  HTML text shown on the assessment overview page.
                </small>
              </div>

              <StudentLinkSharing
                studentLink={studentLink}
                studentLinkMessage="The link that students will use to access this assessment."
              />
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Scoring</h2>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="use_custom_max_points"
                  checked={useCustomMaxPoints}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setUseCustomMaxPoints(e.target.checked);
                    if (e.target.checked) {
                      if (getValues('max_points') === '') {
                        setValue(
                          'max_points',
                          String(Math.max(zonePointsRange.max - currentBonusPoints, 0)),
                          { shouldDirty: true },
                        );
                      }
                    } else {
                      setValue('max_points', '', { shouldDirty: true });
                    }
                  }}
                />
                <label className="form-check-label" htmlFor="use_custom_max_points">
                  Set a custom maximum
                </label>
                <div className="small text-muted">
                  By default, the maximum points are the sum of all zone points.
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="max_points">
                    Maximum points
                  </label>
                  {useCustomMaxPoints ? (
                    <input
                      type="number"
                      className={clsx('form-control', errors.max_points && 'is-invalid')}
                      id="max_points"
                      aria-describedby="max-points-help"
                      aria-invalid={errors.max_points ? 'true' : 'false'}
                      {...(errors.max_points ? { 'aria-errormessage': 'max-points-error' } : {})}
                      step="any"
                      disabled={!canEdit}
                      defaultValue={defaultValues.max_points}
                      {...register('max_points', {
                        validate: (v) => v === '' || Number(v) >= 0 || 'Must be 0 or greater',
                      })}
                    />
                  ) : (
                    <input
                      type="text"
                      className="form-control"
                      id="max_points"
                      aria-describedby="max-points-help"
                      value={effectiveMaxPointsDisplay}
                      disabled
                      readOnly
                    />
                  )}
                  {errors.max_points && (
                    <div id="max-points-error" className="invalid-feedback">
                      {errors.max_points.message}
                    </div>
                  )}
                  <small id="max-points-help" className="form-text text-muted">
                    The number of points that must be earned in this assessment to achieve a score
                    of 100%.
                    {useCustomMaxPoints
                      ? ` Overriding the computed sum of zone points (${zonePointsRange.min !== zonePointsRange.max ? `${zonePointsRange.min}–${zonePointsRange.max}` : zonePointsRange.max}).`
                      : ''}
                  </small>
                  {zonePointsRange.min !== zonePointsRange.max && (
                    <Alert variant="warning" className="mt-2 mb-0 py-2 small">
                      Students may receive different total points because this assessment contains
                      zones or alternative pools that randomly select questions with different point
                      values.
                    </Alert>
                  )}
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label" htmlFor="max_bonus_points">
                    Bonus points
                  </label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.max_bonus_points && 'is-invalid')}
                    id="max_bonus_points"
                    aria-describedby="max-bonus-points-help"
                    aria-invalid={errors.max_bonus_points ? 'true' : 'false'}
                    {...(errors.max_bonus_points
                      ? { 'aria-errormessage': 'max-bonus-points-error' }
                      : {})}
                    placeholder="0"
                    step="any"
                    disabled={!canEdit}
                    defaultValue={defaultValues.max_bonus_points}
                    {...register('max_bonus_points', {
                      validate: (v) => v === '' || Number(v) >= 0 || 'Must be 0 or greater',
                    })}
                  />
                  {errors.max_bonus_points && (
                    <div id="max-bonus-points-error" className="invalid-feedback">
                      {errors.max_bonus_points.message}
                    </div>
                  )}
                  <small id="max-bonus-points-help" className="form-text text-muted">
                    Additional points students can earn beyond 100% on this assessment.
                  </small>
                </div>
              </div>
              <ScoringSummary
                zonePointsRange={zonePointsRange}
                useCustomMaxPoints={useCustomMaxPoints}
                customMaxPoints={Number(watch('max_points')) || 0}
                bonusPoints={currentBonusPoints}
              />
              {assessment.type === 'Homework' && (
                <div className="form-check border-top mt-3 pt-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="constant_question_value"
                    aria-describedby="constant-question-value-help"
                    disabled={!canEdit}
                    defaultChecked={defaultValues.constant_question_value}
                    {...register('constant_question_value')}
                  />
                  <label className="form-check-label" htmlFor="constant_question_value">
                    Constant question value
                  </label>
                  <div id="constant-question-value-help" className="small text-muted">
                    Whether to keep the value of a question constant after a student solves it
                    correctly.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Question behaviour</h2>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="shuffle_questions"
                  aria-describedby="shuffle-questions-help"
                  disabled={!canEdit}
                  defaultChecked={defaultValues.shuffle_questions}
                  {...register('shuffle_questions')}
                />
                <label className="form-check-label" htmlFor="shuffle_questions">
                  Shuffle questions
                </label>
                <div id="shuffle-questions-help" className="small text-muted">
                  Whether the questions will be shuffled in the student view of an assessment.
                </div>
              </div>
              {assessment.type === 'Exam' && (
                <div className="border-top mt-3 pt-3">
                  <label className="form-label" htmlFor="advance_score_perc">
                    Advance score threshold
                  </label>
                  <div className="row">
                    <div className="col-md-4">
                      <InputGroup>
                        <input
                          type="number"
                          className={clsx(
                            'form-control',
                            errors.advance_score_perc && 'is-invalid',
                          )}
                          id="advance_score_perc"
                          aria-describedby="advance-score-perc-help"
                          aria-invalid={errors.advance_score_perc ? 'true' : 'false'}
                          {...(errors.advance_score_perc
                            ? { 'aria-errormessage': 'advance-score-perc-error' }
                            : {})}
                          step="1"
                          disabled={!canEdit}
                          defaultValue={defaultValues.advance_score_perc}
                          {...register('advance_score_perc', {
                            validate: (v) => {
                              if (v === '') return true;
                              const n = Number(v);
                              if (n < 0 || n > 100) return 'Must be between 0 and 100';
                              return true;
                            },
                          })}
                        />
                        <InputGroup.Text>%</InputGroup.Text>
                      </InputGroup>
                    </div>
                  </div>
                  {errors.advance_score_perc && (
                    <div id="advance-score-perc-error" className="invalid-feedback d-block">
                      {errors.advance_score_perc.message}
                    </div>
                  )}
                  <small id="advance-score-perc-help" className="form-text text-muted">
                    Default minimum autograding score percentage on each question to unlock the
                    following question. May be overridden for individual questions.
                  </small>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Grading</h2>
              {assessment.type === 'Exam' && (
                <div className="form-check mb-3 pb-3 border-bottom">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="allow_real_time_grading"
                    aria-describedby="allow-real-time-grading-help"
                    disabled={!canEdit}
                    defaultChecked={defaultValues.allow_real_time_grading}
                    {...register('allow_real_time_grading')}
                  />
                  <label className="form-check-label" htmlFor="allow_real_time_grading">
                    Allow real-time grading
                  </label>
                  <div id="allow-real-time-grading-help" className="small text-muted">
                    Allow students to see grading results while the assessment is being taken.
                    Enabled by default.
                  </div>
                </div>
              )}
              <div>
                <label className="form-label" htmlFor="grade_rate_minutes">
                  Grade rate (minutes)
                </label>
                <div className="row">
                  <div className="col-md-4">
                    <input
                      type="number"
                      className={clsx('form-control', errors.grade_rate_minutes && 'is-invalid')}
                      id="grade_rate_minutes"
                      aria-describedby="grade-rate-minutes-help"
                      aria-invalid={errors.grade_rate_minutes ? 'true' : 'false'}
                      {...(errors.grade_rate_minutes
                        ? { 'aria-errormessage': 'grade-rate-minutes-error' }
                        : {})}
                      placeholder="0"
                      step="any"
                      disabled={!canEdit}
                      defaultValue={defaultValues.grade_rate_minutes}
                      {...register('grade_rate_minutes', {
                        validate: (v) => v === '' || Number(v) >= 0 || 'Must be 0 or greater',
                      })}
                    />
                    {errors.grade_rate_minutes && (
                      <div id="grade-rate-minutes-error" className="invalid-feedback">
                        {errors.grade_rate_minutes.message}
                      </div>
                    )}
                  </div>
                </div>
                <small id="grade-rate-minutes-help" className="form-text text-muted">
                  Minimum amount of time (in minutes) between graded submissions to the same
                  question.
                </small>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Student options</h2>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="allow_issue_reporting"
                  aria-describedby="allow-issue-reporting-help"
                  disabled={!canEdit}
                  defaultChecked={defaultValues.allow_issue_reporting}
                  {...register('allow_issue_reporting')}
                />
                <label className="form-check-label" htmlFor="allow_issue_reporting">
                  Allow issue reporting
                </label>
                <div id="allow-issue-reporting-help" className="small text-muted">
                  Allow students to report issues for assessment questions.
                </div>
              </div>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="allow_personal_notes"
                  aria-describedby="allow-personal-notes-help"
                  disabled={!canEdit}
                  defaultChecked={defaultValues.allow_personal_notes}
                  {...register('allow_personal_notes')}
                />
                <label className="form-check-label" htmlFor="allow_personal_notes">
                  Allow personal notes
                </label>
                <div id="allow-personal-notes-help" className="small text-muted">
                  Allow students to upload personal notes for this assessment.
                </div>
              </div>
              <div className={clsx('form-check', assessment.type === 'Exam' && 'mb-3')}>
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="show_question_titles"
                  aria-describedby="show-question-titles-help"
                  disabled={!canEdit}
                  defaultChecked={defaultValues.showQuestionTitles}
                  {...register('showQuestionTitles')}
                />
                <label className="form-check-label" htmlFor="show_question_titles">
                  Show question titles to students
                </label>
                <div id="show-question-titles-help" className="small text-muted">
                  Question titles can help students identify questions, but may contain topic names
                  or other context intended only for staff.
                </div>
              </div>
              {assessment.type === 'Exam' && (
                <>
                  <div className="form-check mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="multiple_instance"
                      aria-describedby="multiple-instance-help"
                      disabled={!canEdit}
                      defaultChecked={defaultValues.multiple_instance}
                      {...register('multiple_instance')}
                    />
                    <label className="form-check-label" htmlFor="multiple_instance">
                      Multiple instances
                    </label>
                    <div id="multiple-instance-help" className="small text-muted">
                      Allow students to create additional instances of the assessment.
                    </div>
                  </div>
                  <div className="form-check mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="auto_close"
                      aria-describedby="auto-close-help"
                      disabled={!canEdit}
                      defaultChecked={defaultValues.auto_close}
                      {...register('auto_close')}
                    />
                    <label className="form-check-label" htmlFor="auto_close">
                      Auto close
                    </label>
                    <div id="auto-close-help" className="small text-muted">
                      Automatically close the assessment after 6 hours of inactivity.
                    </div>
                  </div>
                  <div className={clsx('form-check', requireHonorCode && 'mb-3')}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="require_honor_code"
                      aria-describedby="require-honor-code-help"
                      disabled={!canEdit}
                      defaultChecked={defaultValues.require_honor_code}
                      {...register('require_honor_code')}
                    />
                    <label className="form-check-label" htmlFor="require_honor_code">
                      Require honor code
                    </label>
                    <div id="require-honor-code-help" className="small text-muted">
                      Require students to accept an honor code before starting the exam.
                    </div>
                  </div>
                  {requireHonorCode && (
                    <div className="mb-0">
                      <label className="form-label" htmlFor="honor_code">
                        Custom honor code
                      </label>
                      <textarea
                        className="form-control"
                        id="honor_code"
                        aria-describedby="honor-code-help"
                        disabled={!canEdit}
                        defaultValue={defaultValues.honor_code}
                        {...register('honor_code')}
                      />
                      <small id="honor-code-help" className="form-text text-muted">
                        Custom honor code text shown to students before starting the exam. Supports
                        Markdown formatting; HTML is not supported. Use{' '}
                        <code>{'{{user_name}}'}</code> to include the student's name. Leave blank
                        for the default honor code.
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Tools</h2>
              {assessmentTools.map(({ name, label, enabled }, i) => (
                <div
                  key={name}
                  className={clsx('form-check', i < assessmentTools.length - 1 && 'mb-3')}
                >
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`tool_${name}`}
                    disabled={!canEdit}
                    defaultChecked={enabled}
                    {...register(`tools.${name}`)}
                  />
                  <label className="form-check-label" htmlFor={`tool_${name}`}>
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {questionSharingEnabled && (
            <ShareSourcePubliclyCard
              alreadyShared={assessment.share_source_publicly}
              canEdit={canEdit}
              registerProps={register('share_source_publicly')}
              defaultChecked={defaultValues.share_source_publicly}
              blockingChildren={nonPublicQuestionsInAssessment.map((q) => ({
                id: q.id,
                href: getQuestionSettingsUrl({
                  questionId: q.id,
                  courseInstanceId: assessment.course_instance_id,
                }),
                label: q.qid,
              }))}
              publicLink={publicLink}
              entityNoun="assessment"
              childNoun="questions"
              unshareBlock={
                assessment.share_source_publicly && courseInstanceSharedPublicly
                  ? {
                      parentNoun: 'course instance',
                      href: getCourseInstanceSettingsUrl(assessment.course_instance_id),
                    }
                  : undefined
              }
            />
          )}

          {(currentGHLink || canViewLogs || canEdit) && (
            <div className="card">
              <div className="card-body">
                <h2 className="h5 card-title mb-3">Manage assessment</h2>
                <div className="d-flex flex-column gap-3">
                  {currentGHLink && (
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                      <div>
                        <div className="fw-semibold">View source on GitHub</div>
                        <div className="small text-muted">
                          Open this assessment's source files in the course's repository.
                        </div>
                      </div>
                      <GitHubButton gitHubLink={currentGHLink} variant="outline-secondary" />
                    </div>
                  )}
                  {canViewLogs && (
                    <div
                      className={clsx(
                        'd-flex flex-wrap align-items-center justify-content-between gap-3',
                        currentGHLink && 'border-top pt-3',
                      )}
                    >
                      <div>
                        <div className="fw-semibold">View assessment logs</div>
                        <div className="small text-muted">
                          Review the history of batch operations performed on instances of this
                          assessment.
                        </div>
                      </div>
                      <a
                        href={getAssessmentLogsUrl({
                          courseInstanceId: assessment.course_instance_id,
                          assessmentId: assessment.id,
                        })}
                        className="btn btn-sm btn-outline-secondary"
                      >
                        <i className="bi bi-clock-history me-1" aria-hidden="true" />
                        View logs
                      </a>
                    </div>
                  )}
                  {canEdit && (
                    <>
                      <div
                        className={clsx(
                          'd-flex flex-wrap align-items-center justify-content-between gap-3',
                          (currentGHLink || canViewLogs) && 'border-top pt-3',
                        )}
                      >
                        <div>
                          <div className="fw-semibold">Make a copy of this assessment</div>
                          <div className="small text-muted">
                            Create a duplicate of this assessment to use as a starting point.
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => copyModalState.showWithData(true)}
                        >
                          <i className="bi bi-copy me-1" aria-hidden="true" />
                          Make a copy
                        </Button>
                      </div>
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top pt-3">
                        <div>
                          <div className="fw-semibold">Delete this assessment</div>
                          <div className="small text-muted">
                            Permanently remove this assessment and all associated student data.
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => deleteModalState.showWithData(true)}
                        >
                          <i className="bi bi-trash me-1" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {canEdit && (
          <StickySaveBar
            visible={isDirty}
            isSaving={isSubmitting || saveMutation.isPending}
            alert={saveAlert}
            onCancel={() => {
              reset();
              setUseCustomMaxPoints(getValues('max_points') !== '');
              saveMutation.reset();
            }}
          />
        )}
      </form>
    </>
  );
}

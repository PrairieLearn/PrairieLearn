import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PublicLinkSharing, StudentLinkSharing } from '../../components/LinkSharing.js';
import { AssessmentShortNameDescription } from '../../components/ShortNameDescriptions.js';
import { getAppError } from '../../lib/client/errors.js';
import type {
  StaffAssessment,
  StaffAssessmentModule,
  StaffAssessmentSet,
  StaffCourseInstance,
} from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { AssessmentToolsConfig } from '../../lib/editors.js';
import { validateShortName } from '../../lib/short-name.js';
import type { AssessmentSettingsError } from '../../trpc/assessment/assessment-settings.js';
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
}

interface InstructorAssessmentSettingsProps {
  trpcCsrfToken: string;
  urlPrefix: string;
  canEdit: boolean;
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
}

export function InstructorAssessmentSettings({
  trpcCsrfToken,
  urlPrefix,
  canEdit,
  origHash,
  assessment,
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
  zonePointsRange,
}: InstructorAssessmentSettingsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentSettingsInner
          urlPrefix={urlPrefix}
          canEdit={canEdit}
          origHash={origHash}
          assessment={assessment}
          assessmentSet={assessmentSet}
          assessmentGHLink={assessmentGHLink}
          tids={tids}
          studentLink={studentLink}
          publicLink={publicLink}
          assessmentSets={assessmentSets}
          assessmentModules={assessmentModules}
          assessmentTools={assessmentTools}
          zonePointsRange={zonePointsRange}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentSettings.displayName = 'InstructorAssessmentSettings';

function InstructorAssessmentSettingsInner({
  urlPrefix,
  canEdit,
  origHash,
  assessment,
  assessmentSet,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  assessmentSets,
  assessmentModules,
  assessmentTools,
  zonePointsRange,
}: Omit<InstructorAssessmentSettingsProps, 'trpcCsrfToken' | 'isDevMode' | 'courseInstance'>) {
  const trpc = useTRPC();
  const [currentOrigHash, setCurrentOrigHash] = useState(origHash);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
  const copyMutation = useMutation(trpc.assessmentSettings.copyAssessment.mutationOptions());
  const deleteMutation = useMutation(trpc.assessmentSettings.deleteAssessment.mutationOptions());

  const appError = getAppError<AssessmentSettingsError['UpdateAssessment']>(saveMutation.error);
  const copyError = getAppError<AssessmentSettingsError['CopyAssessment']>(copyMutation.error);
  const deleteError = getAppError<AssessmentSettingsError['DeleteAssessment']>(
    deleteMutation.error,
  );

  const toNullableNumber = (v: string) => (v === '' ? null : Number(v));

  const onFormSubmit = (data: SettingsFormValues) => {
    saveMutation.mutate(
      {
        ...data,
        max_points: useCustomMaxPoints ? toNullableNumber(data.max_points) : null,
        max_bonus_points: toNullableNumber(data.max_bonus_points),
        advance_score_perc: toNullableNumber(data.advance_score_perc),
        grade_rate_minutes: toNullableNumber(data.grade_rate_minutes),
        origHash: currentOrigHash,
      },
      {
        onSuccess: (result) => {
          setCurrentOrigHash(result.origHash);
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
      <Modal show={showCopyModal} onHide={() => setShowCopyModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Copy assessment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {copyError && (
            <Alert variant="danger" dismissible onClose={() => copyMutation.reset()}>
              {copyError.message}
            </Alert>
          )}
          <p>
            Are you sure you want to copy the assessment <b>{assessment.tid}</b>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCopyModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={copyMutation.isPending}
            onClick={() =>
              copyMutation.mutate(undefined, {
                onSuccess: (result) => {
                  window.location.href = `${urlPrefix}/assessment/${result.assessmentId}/settings`;
                },
              })
            }
          >
            {copyMutation.isPending ? 'Copying...' : 'Copy'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteError && (
            <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
              {deleteError.message}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the assessment <b>{assessment.tid}</b>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
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
                  <input
                    type="text"
                    className="form-control"
                    id="type"
                    aria-describedby="type-help"
                    value={assessment.type}
                    disabled
                    readOnly
                  />
                  <small id="type-help" className="form-text text-muted">
                    The type of the assessment. This can be either{' '}
                    <a href="https://docs.prairielearn.com/assessment/configuration/#assessment-types">
                      Homework or Exam
                    </a>
                    .
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

              <p className="form-label">Sharing</p>
              {assessment.share_source_publicly ? (
                <PublicLinkSharing
                  publicLink={publicLink}
                  sharingMessage="This assessment's source is publicly shared."
                  publicLinkMessage="The link that other instructors can use to view this assessment."
                />
              ) : (
                <p className="form-text text-muted">This assessment is not being shared.</p>
              )}
            </div>
            <div className="card-footer d-flex flex-wrap align-items-center gap-2">
              <GitHubButton gitHubLink={currentGHLink} />
              {canEdit && (
                <div className="ms-auto d-flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setShowCopyModal(true)}
                  >
                    <i className="bi bi-copy" aria-hidden="true" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <i className="bi bi-trash" aria-hidden="true" /> Delete
                  </Button>
                </div>
              )}
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
              <div className={clsx('form-check', assessment.type === 'Exam' && 'mb-3')}>
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
                        Markdown formatting. Use <code>{'{{user_name}}'}</code> to include the
                        student's name. Leave blank for the default honor code.
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
        </div>

        {canEdit && (
          <div className="position-sticky bottom-0 z-3 bg-body border-top">
            {saveMutation.isSuccess && (
              <Alert
                className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
                variant="success"
                dismissible
                onClose={() => saveMutation.reset()}
              >
                Assessment updated successfully.
              </Alert>
            )}
            {appError && (
              <Alert
                className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
                variant="danger"
                dismissible
                onClose={() => saveMutation.reset()}
              >
                {appError.message}
              </Alert>
            )}
            <div
              className={clsx(
                'container align-items-center justify-content-between gap-2 py-3',
                isDirty ? 'd-flex' : 'd-none',
              )}
            >
              <div className="small text-muted">You have unsaved changes</div>
              <div className="d-flex gap-2">
                <button
                  id="cancel-button"
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={isSubmitting || saveMutation.isPending}
                  onClick={() => {
                    reset();
                    setUseCustomMaxPoints(getValues('max_points') !== '');
                    saveMutation.reset();
                  }}
                >
                  Cancel
                </button>
                <button
                  id="save-button"
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={isSubmitting || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save and sync'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </>
  );
}

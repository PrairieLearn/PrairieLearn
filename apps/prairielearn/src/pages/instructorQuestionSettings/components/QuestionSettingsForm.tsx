import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import {
  type FieldArrayWithId,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
  useFieldArray,
  useForm,
} from 'react-hook-form';

import { ComboBox, type ComboBoxItem, TagPicker } from '@prairielearn/ui';

import { QuestionShortNameDescription } from '../../../components/ShortNameDescriptions.js';
import { TagBadge } from '../../../components/TagBadge.js';
import { TagDescription } from '../../../components/TagDescription.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import { TopicDescription } from '../../../components/TopicDescription.js';
import type {
  StaffCourseInstance,
  StaffQuestion,
  StaffTag,
  StaffTopic,
} from '../../../lib/client/safe-db-types.js';
import { idsEqual } from '../../../lib/id.js';
import { validateShortName } from '../../../lib/short-name.js';
import { DragHandle } from '../../instructorAssessmentQuestions/components/tree/DragHandle.js';
import { makeDraggableStyle } from '../../instructorAssessmentQuestions/components/tree/dragUtils.js';
import { coerceToNumber } from '../../instructorAssessmentQuestions/utils/formHelpers.js';
import type { SelectedAssessments } from '../instructorQuestionSettings.types.js';

function AssessmentBadges({
  assessmentsWithQuestion,
  courseInstanceId,
}: {
  assessmentsWithQuestion: SelectedAssessments[];
  courseInstanceId: string;
}) {
  const assessmentsInCourseInstance = assessmentsWithQuestion.find((a) =>
    idsEqual(a.course_instance_id, courseInstanceId),
  );

  if (
    !assessmentsInCourseInstance?.assessments ||
    assessmentsInCourseInstance.assessments.length === 0
  ) {
    return (
      <small className="text-muted text-center">
        This question is not included in any assessments in this course instance.
      </small>
    );
  }

  return (
    <div className="d-flex flex-wrap gap-1">
      {assessmentsInCourseInstance.assessments.map((assessment) => (
        <a
          key={assessment.assessment_id}
          href={`/pl/course_instance/${assessmentsInCourseInstance.course_instance_id}/instructor/assessment/${assessment.assessment_id}`}
          className={`btn btn-badge color-${assessment.color}`}
        >
          {assessment.label}
        </a>
      ))}
    </div>
  );
}

interface PreferenceField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  enum: string[];
}

interface QuestionSettingsFormValues {
  qid: string;
  title: string;
  topic: string;
  tags: string[];
  grading_method: 'Internal' | 'External' | 'Manual';
  single_variant: boolean;
  show_correct_answer: boolean;
  workspace_enabled: boolean;
  workspace_image: string;
  workspace_port: string;
  workspace_home: string;
  workspace_graded_files: string;
  workspace_args: string;
  workspace_environment: string;
  workspace_enable_networking: boolean;
  workspace_rewrite_url: boolean;
  preferences: PreferenceField[];
  /** Tracks the state of the checkbox */
  external_grading_enabled: boolean;
  external_grading_image: string;
  external_grading_entrypoint: string;
  external_grading_files: string;
  external_grading_timeout: number | undefined;
  external_grading_enable_networking: boolean;
  external_grading_environment: string;
}

function validateJsonObject(value: string): string | true {
  if (!value || value.trim() === '' || value.trim() === '{}') return true;
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'Must be a valid JSON object';
    }
    return true;
  } catch {
    return 'Invalid JSON format';
  }
}

export const QuestionSettingsForm = ({
  question,
  topic,
  courseInstance,
  assessmentsWithQuestion,
  courseTopics,
  courseTags,
  questionTags,
  qids,
  origHash,
  csrfToken,
  canEdit,
}: {
  question: StaffQuestion;
  courseInstance?: StaffCourseInstance | null;
  assessmentsWithQuestion: SelectedAssessments[];
  topic: StaffTopic;
  courseTopics: StaffTopic[];
  courseTags: StaffTag[];
  questionTags: StaffTag[];
  qids: string[];
  origHash: string;
  csrfToken: string;
  canEdit: boolean;
}) => {
  // `handleSubmit` runs after react-hook-form processes the submit event, so use a
  // stable ref rather than depending on `event.currentTarget` here.
  // If we didn't wrap in `handleSubmit`, we could use `event.currentTarget`.
  const formRef = useRef<HTMLFormElement>(null);

  const preferences: PreferenceField[] = question.preferences_schema
    ? Object.entries(question.preferences_schema).map(([name, schema]) => ({
        name,
        type: schema.type,
        default: schema.default,
        enum: schema.enum?.map(String) ?? [],
      }))
    : [];

  const defaultValues: QuestionSettingsFormValues = {
    qid: question.qid ?? '',
    title: question.title ?? '',
    topic: topic.name,
    tags: questionTags.map((t) => t.name),
    grading_method: question.grading_method,
    single_variant: question.single_variant ?? false,
    show_correct_answer: question.show_correct_answer ?? true,
    workspace_enabled: !!question.workspace_image,
    workspace_image: question.workspace_image ?? '',
    workspace_port: question.workspace_port?.toString() ?? '',
    workspace_home: question.workspace_home ?? '',
    workspace_graded_files: question.workspace_graded_files?.join(', ') ?? '',
    workspace_args: question.workspace_args ?? '',
    workspace_environment:
      Object.keys(question.workspace_environment ?? {}).length > 0
        ? JSON.stringify(question.workspace_environment, null, 2)
        : '{}',
    workspace_enable_networking: question.workspace_enable_networking ?? false,
    workspace_rewrite_url: question.workspace_url_rewrite ?? true,
    preferences,
    // The state of the checkbox, defaulting to the presence of an external grading image
    external_grading_enabled: !!question.external_grading_image,
    external_grading_image: question.external_grading_image ?? '',
    external_grading_entrypoint: question.external_grading_entrypoint ?? '',
    external_grading_files: question.external_grading_files?.join(', ') ?? '',
    external_grading_timeout: question.external_grading_timeout ?? undefined,
    external_grading_enable_networking: question.external_grading_enable_networking ?? false,
    external_grading_environment:
      Object.keys(question.external_grading_environment).length > 0
        ? JSON.stringify(question.external_grading_environment, null, 2)
        : '{}',
  };

  const {
    handleSubmit,
    register,
    watch,
    setValue,
    clearErrors,
    control,
    formState: { errors, isDirty },
  } = useForm<QuestionSettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'preferences',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  }

  const selectedTopic = watch('topic');
  const selectedTags = watch('tags');
  const selectedGradingMethod = watch('grading_method');
  const workspaceEnabled = watch('workspace_enabled');
  const externalGradingEnabled = watch('external_grading_enabled');

  const isExternalGrading = selectedGradingMethod === 'External';

  const topicItems: ComboBoxItem<StaffTopic>[] = useMemo(
    () =>
      courseTopics.map((t) => ({
        id: t.name,
        data: t,
        label: t.name,
        searchableText: `${t.name} ${t.description}`,
      })),
    [courseTopics],
  );

  const tagItems: ComboBoxItem<StaffTag>[] = useMemo(
    () =>
      [...courseTags]
        .sort((a, b) => {
          // Sort explicit tags above implicit tags, then by name
          if (a.implicit !== b.implicit) {
            return a.implicit ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
        })
        .map((t) => ({
          id: t.name,
          data: t,
          label: t.name,
          searchableText: `${t.name} ${t.description}`,
        })),
    [courseTags],
  );

  const currentTopicData = courseTopics.find((t) => t.name === selectedTopic);
  const currentTagsData = courseTags.filter((t) => selectedTags.includes(t.name));

  const otherQids = new Set(qids.filter((q) => q !== defaultValues.qid));

  const handleFormSubmit = handleSubmit(() => {
    formRef.current?.submit();
  });

  return (
    <form
      ref={formRef}
      name="edit-question-settings-form"
      method="POST"
      onSubmit={handleFormSubmit}
    >
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="update_question" />
      <input type="hidden" name="orig_hash" value={origHash} />

      <div className="mb-3">
        <label className="form-label" htmlFor="qid">
          QID
        </label>
        <input
          type="text"
          className={clsx('form-control font-monospace', errors.qid && 'is-invalid')}
          id="qid"
          disabled={!canEdit}
          aria-invalid={!!errors.qid || undefined}
          defaultValue={defaultValues.qid}
          aria-errormessage={errors.qid ? 'qid-error' : undefined}
          {...register('qid', {
            required: 'QID is required',
            validate: {
              shortName: (value) => {
                const result = validateShortName(value, defaultValues.qid);
                return result.valid || result.message;
              },
              duplicate: (value) => {
                if (otherQids.has(value)) {
                  return 'This QID is already in use';
                }
                return true;
              },
            },
          })}
        />
        {errors.qid && (
          <div id="qid-error" className="invalid-feedback">
            {errors.qid.message}
          </div>
        )}
        <small className="form-text text-muted">
          <QuestionShortNameDescription />
        </small>
      </div>

      <div className="mb-3">
        <h2 className="h4">General</h2>
        <label className="form-label" htmlFor="title">
          Title
        </label>
        <input
          type="text"
          className="form-control"
          id="title"
          disabled={!canEdit}
          defaultValue={defaultValues.title}
          {...register('title')}
        />
        <small className="form-text text-muted">
          The title of the question (e.g., "Add two numbers").
        </small>
      </div>

      <div className="table-responsive card mb-3 overflow-visible">
        <table
          className="table two-column-description"
          aria-label="Question topic, tags, and assessments"
        >
          <tbody>
            <tr>
              <th className="align-middle">
                <label id="topic-label" htmlFor="topic">
                  Topic
                </label>
              </th>
              <td>
                {canEdit ? (
                  <ComboBox
                    id="topic"
                    name="topic"
                    items={topicItems}
                    value={selectedTopic}
                    placeholder="Select a topic"
                    aria-labelledby="topic-label"
                    renderItem={(item) => (
                      <div style={{ whiteSpace: 'normal' }}>
                        <TopicBadge topic={item.data!} />
                        {item.data!.description && (
                          <div>
                            <small className="text-muted">
                              <TopicDescription topic={item.data!} />
                            </small>
                          </div>
                        )}
                      </div>
                    )}
                    onChange={(value) => setValue('topic', value ?? '', { shouldDirty: true })}
                  />
                ) : currentTopicData ? (
                  <TopicBadge topic={currentTopicData} />
                ) : null}
              </td>
            </tr>
            <tr>
              <th className="align-middle">
                <label id="tags-label" htmlFor="tags">
                  Tags
                </label>
              </th>
              <td>
                {canEdit ? (
                  <TagPicker
                    id="tags"
                    name="tags"
                    items={tagItems}
                    value={selectedTags}
                    placeholder="Select tags"
                    aria-labelledby="tags-label"
                    renderItem={(item) => (
                      <div style={{ whiteSpace: 'normal' }}>
                        <TagBadge tag={item.data!} />
                        {!item.data!.implicit && item.data!.description && (
                          <div>
                            <small className="text-muted">
                              <TagDescription tag={item.data!} />
                            </small>
                          </div>
                        )}
                      </div>
                    )}
                    renderTagContent={(data) => data.name}
                    tagClassName={(data) => `badge color-${data.color}`}
                    onChange={(value) => setValue('tags', value, { shouldDirty: true })}
                  />
                ) : (
                  currentTagsData.map((tag) => (
                    <span key={tag.name} className="me-1">
                      <TagBadge tag={tag} />
                    </span>
                  ))
                )}
              </td>
            </tr>
            {courseInstance && (
              <tr>
                <th className="align-middle">Assessments</th>
                <td>
                  <AssessmentBadges
                    assessmentsWithQuestion={assessmentsWithQuestion}
                    courseInstanceId={courseInstance.id}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="grading_method">
          Grading method
        </label>
        <select
          className="form-select"
          id="grading_method"
          disabled={!canEdit}
          defaultValue={defaultValues.grading_method}
          {...register('grading_method')}
        >
          <option value="Internal">Internal</option>
          <option value="External">External</option>
          <option value="Manual">Manual</option>
        </select>
        <small className="form-text text-muted">The grading method used for this question.</small>
      </div>

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="single_variant"
          disabled={!canEdit}
          defaultChecked={defaultValues.single_variant}
          {...register('single_variant')}
        />
        <label className="form-check-label" htmlFor="single_variant">
          Single variant
        </label>
        <div className="small text-muted">
          If enabled, students will only be able to try a single variant of this question on any
          given assessment.
        </div>
      </div>

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="show_correct_answer"
          disabled={!canEdit}
          defaultChecked={defaultValues.show_correct_answer}
          {...register('show_correct_answer')}
        />
        <label className="form-check-label" htmlFor="show_correct_answer">
          Show correct answer
        </label>
        <div className="small text-muted">
          If enabled, the correct answer panel will be shown after all submission attempts have been
          exhausted.
        </div>
      </div>

      <div className="mb-3">
        <h2 className="h4">Preferences</h2>
        <small className="text-muted d-block mb-3">
          Define preference fields that can be overridden per assessment. Values are available in{' '}
          <code>server.py</code> and <code>question.html</code>.{' '}
          <a
            href="https://prairielearn.readthedocs.io/en/latest/question/preferences/"
            target="_blank"
            rel="noreferrer"
          >
            Learn more about preferences
          </a>
        </small>

        {fields.length === 0 && (
          <div className="border rounded p-4 text-center text-muted mb-3">
            <i className="bi bi-sliders fs-3 d-block mb-2" aria-hidden="true" />
            No preferences defined
          </div>
        )}

        {fields.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="table-responsive card mb-3">
                <table className="table table-sm align-middle mb-0" aria-label="Preferences">
                  <thead>
                    <tr>
                      {canEdit && <th style={{ width: '2rem' }} />}
                      <th>Name</th>
                      <th style={{ width: '7rem' }}>Type</th>
                      <th>Default</th>
                      <th>Allowed values</th>
                      {canEdit && <th style={{ width: '2.5rem' }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <PreferenceRow
                        key={field.id}
                        field={field}
                        index={index}
                        canEdit={canEdit}
                        register={register}
                        watch={watch}
                        setValue={setValue}
                        errors={errors.preferences?.[index]}
                        remove={remove}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </SortableContext>
          </DndContext>
        )}

        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={!canEdit}
          onClick={() => append({ name: '', type: 'string', default: '', enum: [] })}
        >
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          Add preference
        </button>
      </div>

      <div className="mb-3">
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="workspaceEnabled"
            checked={workspaceEnabled}
            disabled={!canEdit}
            onChange={() => {
              if (workspaceEnabled) {
                clearErrors([
                  'workspace_image',
                  'workspace_port',
                  'workspace_home',
                  'workspace_environment',
                ]);
              }
              setValue('workspace_enabled', !workspaceEnabled, { shouldDirty: true });
            }}
          />
          <label className="form-check-label h4 mb-0" htmlFor="workspaceEnabled">
            Workspace
          </label>
        </div>
        <small className="text-muted ps-4">
          Configure a{' '}
          <a href="https://prairielearn.readthedocs.io/en/latest/workspaces/">
            remote development environment
          </a>{' '}
          for students.
        </small>
        {workspaceEnabled && (
          <div className="mt-3 ps-4" id="workspace-options">
            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_image">
                Image
              </label>
              <input
                type="text"
                className={clsx('form-control', errors.workspace_image && 'is-invalid')}
                id="workspace_image"
                disabled={!canEdit}
                aria-invalid={!!errors.workspace_image || undefined}
                defaultValue={defaultValues.workspace_image}
                aria-errormessage={errors.workspace_image ? 'workspace_image-error' : undefined}
                {...register('workspace_image', {
                  required: 'Image is required for workspace',
                })}
              />
              {errors.workspace_image && (
                <div id="workspace_image-error" className="invalid-feedback">
                  {errors.workspace_image.message}
                </div>
              )}
              <small className="form-text text-muted">
                The Docker image that will be used to serve this workspace. Only images from the
                Dockerhub registry are supported.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_port">
                Port
              </label>
              <input
                type="number"
                className={clsx('form-control', errors.workspace_port && 'is-invalid')}
                id="workspace_port"
                disabled={!canEdit}
                aria-invalid={!!errors.workspace_port || undefined}
                defaultValue={defaultValues.workspace_port}
                aria-errormessage={errors.workspace_port ? 'workspace_port-error' : undefined}
                // Disable default behavior of incrementing/decrementing the value when scrolling
                onWheel={(e) => e.currentTarget.blur()}
                {...register('workspace_port', {
                  required: 'Port is required for workspace',
                })}
              />
              {errors.workspace_port && (
                <div id="workspace_port-error" className="invalid-feedback">
                  {errors.workspace_port.message}
                </div>
              )}
              <small className="form-text text-muted">
                The port number used in the Docker image.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_home">
                Home
              </label>
              <input
                type="text"
                className={clsx('form-control', errors.workspace_home && 'is-invalid')}
                id="workspace_home"
                disabled={!canEdit}
                aria-invalid={!!errors.workspace_home || undefined}
                defaultValue={defaultValues.workspace_home}
                aria-errormessage={errors.workspace_home ? 'workspace_home-error' : undefined}
                {...register('workspace_home', {
                  required: 'Home is required for workspace',
                })}
              />
              {errors.workspace_home && (
                <div id="workspace_home-error" className="invalid-feedback">
                  {errors.workspace_home.message}
                </div>
              )}
              <small className="form-text text-muted">
                The home directory of the workspace container.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_graded_files">
                Graded files
              </label>
              <input
                type="text"
                className="form-control"
                id="workspace_graded_files"
                disabled={!canEdit}
                defaultValue={defaultValues.workspace_graded_files}
                {...register('workspace_graded_files')}
              />
              <small className="form-text text-muted">
                The list of files or directories that will be copied out of the workspace container
                when saving a submission. You may enter multiple files or directories, separated by
                commas.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_args">
                Arguments
              </label>
              <input
                type="text"
                className="form-control"
                id="workspace_args"
                disabled={!canEdit}
                defaultValue={defaultValues.workspace_args}
                {...register('workspace_args')}
              />
              <small className="form-text text-muted">
                Command line arguments to pass to the Docker container. Multiple arguments should be
                separated by spaces and escaped as necessary using the same format as a typical
                shell.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="workspace_environment">
                Environment
              </label>
              <textarea
                className={clsx('form-control', errors.workspace_environment && 'is-invalid')}
                id="workspace_environment"
                disabled={!canEdit}
                aria-invalid={!!errors.workspace_environment || undefined}
                defaultValue={defaultValues.workspace_environment}
                aria-errormessage={
                  errors.workspace_environment ? 'workspace_environment-error' : undefined
                }
                {...register('workspace_environment', {
                  validate: validateJsonObject,
                })}
              />
              {errors.workspace_environment && (
                <div id="workspace_environment-error" className="invalid-feedback">
                  {errors.workspace_environment.message}
                </div>
              )}
              <small className="form-text text-muted">
                Environment variables to set inside the workspace container. Variables must be
                specified as a JSON object (e.g. <code>{'{"key":"value"}'}</code>).
              </small>
            </div>

            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="workspace_enable_networking"
                disabled={!canEdit}
                defaultChecked={defaultValues.workspace_enable_networking}
                {...register('workspace_enable_networking')}
              />
              <label className="form-check-label" htmlFor="workspace_enable_networking">
                Enable networking
              </label>
              <div className="small text-muted">
                Whether the workspace should have network access. Access is disabled by default.
              </div>
            </div>

            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="workspace_rewrite_url"
                disabled={!canEdit}
                defaultChecked={defaultValues.workspace_rewrite_url}
                {...register('workspace_rewrite_url')}
              />
              <label className="form-check-label" htmlFor="workspace_rewrite_url">
                Rewrite URL
              </label>
              <div className="small text-muted">
                If enabled, the URL will be rewritten such that the workspace container will see all
                requests as originating from "/".
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3">
        {/* If the grading method is external, you must specify external grading options */}
        {isExternalGrading ? (
          <h4 className="mb-0">External grading</h4>
        ) : (
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="externalGradingEnabled"
              disabled={!canEdit}
              defaultChecked={defaultValues.external_grading_enabled}
              {...register('external_grading_enabled')}
            />
            <label className="form-check-label h4 mb-0" htmlFor="externalGradingEnabled">
              External grading
            </label>
          </div>
        )}
        <small className={clsx('text-muted', !isExternalGrading && 'ps-4')}>
          Configure{' '}
          <a href="https://prairielearn.readthedocs.io/en/latest/externalGrading/">
            grading using a Docker container
          </a>
          .
        </small>
        {(isExternalGrading || externalGradingEnabled) && (
          <div className={clsx('mt-3', !isExternalGrading && 'ps-4')} id="external-grading-options">
            <div className="mb-3">
              <label className="form-label" htmlFor="external_grading_image">
                Image
              </label>
              <input
                type="text"
                className={clsx('form-control', errors.external_grading_image && 'is-invalid')}
                id="external_grading_image"
                disabled={!canEdit}
                aria-invalid={!!errors.external_grading_image || undefined}
                defaultValue={defaultValues.external_grading_image}
                aria-errormessage={
                  errors.external_grading_image ? 'external_grading_image-error' : undefined
                }
                {...register('external_grading_image', {
                  required: 'Image is required for external grading',
                })}
              />
              {errors.external_grading_image && (
                <div id="external_grading_image-error" className="invalid-feedback">
                  {errors.external_grading_image.message}
                </div>
              )}
              <small className="form-text text-muted">
                The Docker image that will be used to grade this question. Only images from the
                Dockerhub registry are supported.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="external_grading_entrypoint">
                Entrypoint
              </label>
              <input
                type="text"
                className="form-control"
                id="external_grading_entrypoint"
                disabled={!canEdit}
                defaultValue={defaultValues.external_grading_entrypoint}
                {...register('external_grading_entrypoint')}
              />
              <small className="form-text text-muted">
                Program or command to run as the entrypoint to your grader. If not provided, the
                default entrypoint for the image will be used.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="external_grading_files">
                Server files
              </label>
              <input
                type="text"
                className="form-control"
                id="external_grading_files"
                disabled={!canEdit}
                defaultValue={defaultValues.external_grading_files}
                {...register('external_grading_files')}
              />
              <small className="form-text text-muted">
                The list of files or directories that will be copied from{' '}
                <code>course/serverFilesCourse</code> into the grading job. You may enter multiple
                files or directories, separated by commas.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="external_grading_timeout">
                Timeout
              </label>
              <input
                type="number"
                className={clsx('form-control', errors.external_grading_timeout && 'is-invalid')}
                id="external_grading_timeout"
                disabled={!canEdit}
                aria-invalid={!!errors.external_grading_timeout || undefined}
                defaultValue={defaultValues.external_grading_timeout}
                aria-errormessage={
                  errors.external_grading_timeout ? 'external_grading_timeout-error' : undefined
                }
                // Disable default behavior of incrementing/decrementing the value when scrolling
                onWheel={(e) => e.currentTarget.blur()}
                {...register('external_grading_timeout', {
                  setValueAs: coerceToNumber,
                  min: {
                    value: 0,
                    message: 'Timeout must be at least 0 seconds',
                  },
                })}
              />
              {errors.external_grading_timeout && (
                <div id="external_grading_timeout-error" className="invalid-feedback">
                  {errors.external_grading_timeout.message}
                </div>
              )}
              <small className="form-text text-muted">
                The number of seconds after which the grading job will timeout.
              </small>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="external_grading_environment">
                Environment
              </label>
              <textarea
                className={clsx(
                  'form-control',
                  errors.external_grading_environment && 'is-invalid',
                )}
                id="external_grading_environment"
                disabled={!canEdit}
                aria-invalid={!!errors.external_grading_environment || undefined}
                defaultValue={defaultValues.external_grading_environment}
                aria-errormessage={
                  errors.external_grading_environment
                    ? 'external_grading_environment-error'
                    : undefined
                }
                {...register('external_grading_environment', {
                  validate: validateJsonObject,
                })}
              />
              {errors.external_grading_environment && (
                <div id="external_grading_environment-error" className="invalid-feedback">
                  {errors.external_grading_environment.message}
                </div>
              )}
              <small className="form-text text-muted">
                Environment variables to set inside the grading container. Variables must be
                specified as a JSON object (e.g. <code>{'{"key":"value"}'}</code>).
              </small>
            </div>

            <div className="mb-3 form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="external_grading_enable_networking"
                disabled={!canEdit}
                defaultChecked={defaultValues.external_grading_enable_networking}
                {...register('external_grading_enable_networking')}
              />
              <label className="form-check-label" htmlFor="external_grading_enable_networking">
                Enable networking
              </label>
              <div className="small text-muted">
                Whether the grading containers should have network access. Access is disabled by
                default.
              </div>
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <>
          <button
            id="save-button"
            type="submit"
            className="btn btn-primary mb-2"
            disabled={!isDirty}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary mb-2 ms-2"
            onClick={() => window.location.reload()}
          >
            Cancel
          </button>
        </>
      )}
    </form>
  );
};

QuestionSettingsForm.displayName = 'QuestionSettingsForm';

function PreferenceRow({
  field,
  index,
  canEdit,
  register,
  watch,
  setValue,
  errors,
  remove,
}: {
  field: FieldArrayWithId<QuestionSettingsFormValues, 'preferences', 'id'>;
  index: number;
  canEdit: boolean;
  register: UseFormRegister<QuestionSettingsFormValues>;
  watch: UseFormWatch<QuestionSettingsFormValues>;
  setValue: UseFormSetValue<QuestionSettingsFormValues>;
  errors?: FieldErrors<PreferenceField>;
  remove: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: !canEdit,
  });

  const draggableStyle = makeDraggableStyle({ isDragging, transform, transition });
  const prefType = watch(`preferences.${index}.type`);
  const allPreferences = watch('preferences');

  return (
    <tr ref={setNodeRef} style={draggableStyle}>
      {canEdit && (
        <td>
          <DragHandle attributes={attributes} listeners={listeners} disabled={!canEdit} />
        </td>
      )}
      <td>
        <input
          type="text"
          className={clsx(
            'form-control form-control-sm font-monospace',
            errors?.name && 'is-invalid',
          )}
          id={`pref-${index}-name`}
          disabled={!canEdit}
          placeholder="e.g. gravitational_constant"
          defaultValue={field.name}
          aria-invalid={!!errors?.name || undefined}
          aria-errormessage={errors?.name ? `pref-${index}-name-error` : undefined}
          {...register(`preferences.${index}.name`, {
            required: 'Name is required',
            validate: {
              unique: (value) => {
                const duplicates = allPreferences.filter((p, i) => i !== index && p.name === value);
                return duplicates.length === 0 || 'Name must be unique';
              },
            },
          })}
        />
        {errors?.name && (
          <div id={`pref-${index}-name-error`} className="invalid-feedback">
            {errors.name.message}
          </div>
        )}
      </td>
      <td>
        <select
          className="form-select form-select-sm"
          id={`pref-${index}-type`}
          disabled={!canEdit}
          defaultValue={field.type}
          {...register(`preferences.${index}.type`)}
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
        </select>
      </td>
      <td>
        {prefType === 'boolean' ? (
          <select
            className={clsx('form-select form-select-sm', errors?.default && 'is-invalid')}
            id={`pref-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `pref-${index}-default-error` : undefined}
            {...register(`preferences.${index}.default`, {
              required: 'Default is required',
            })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={prefType === 'number' ? 'number' : 'text'}
            step={prefType === 'number' ? 'any' : undefined}
            className={clsx('form-control form-control-sm', errors?.default && 'is-invalid')}
            id={`pref-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `pref-${index}-default-error` : undefined}
            {...register(`preferences.${index}.default`, {
              required: 'Default is required',
              validate: {
                matchesType: (value) => {
                  if (prefType === 'number' && Number.isNaN(Number(value))) {
                    return 'Must be a number';
                  }
                  return true;
                },
                inEnum: (value) => {
                  const enumValues = watch(`preferences.${index}.enum`);
                  if (enumValues.length > 0 && !enumValues.includes(String(value))) {
                    return 'Default must be one of the allowed values';
                  }
                  return true;
                },
              },
            })}
          />
        )}
        {errors?.default && (
          <div id={`pref-${index}-default-error`} className="invalid-feedback">
            {errors.default.message}
          </div>
        )}
      </td>
      <td>
        {prefType === 'boolean' ? (
          <span className="text-muted small">N/A</span>
        ) : (
          <EnumInput index={index} canEdit={canEdit} watch={watch} setValue={setValue} />
        )}
      </td>
      {canEdit && (
        <td>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            aria-label={`Remove preference ${index + 1}`}
            onClick={() => remove(index)}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </button>
        </td>
      )}
    </tr>
  );
}

function EnumInput({
  index,
  canEdit,
  watch,
  setValue,
}: {
  index: number;
  canEdit: boolean;
  watch: UseFormWatch<QuestionSettingsFormValues>;
  setValue: UseFormSetValue<QuestionSettingsFormValues>;
}) {
  const [inputValue, setInputValue] = useState('');
  const enumValues = watch(`preferences.${index}.enum`);

  function addValue() {
    const trimmed = inputValue.trim();
    if (trimmed && !enumValues.includes(trimmed)) {
      setValue(`preferences.${index}.enum`, [...enumValues, trimmed], { shouldDirty: true });
      setInputValue('');
    }
  }

  function removeValue(val: string) {
    setValue(
      `preferences.${index}.enum`,
      enumValues.filter((v) => v !== val),
      { shouldDirty: true },
    );
  }

  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <input type="hidden" name={`preferences.${index}.enum`} value={enumValues.join(', ')} />
      <div className="d-flex gap-1">
        {canEdit && (
          <div className="input-group input-group-sm" style={{ flex: 1 }}>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Add value"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addValue();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={addValue}
            >
              <i className="bi bi-plus" aria-hidden="true" />
            </button>
          </div>
        )}
        {enumValues.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary text-nowrap"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {enumValues.length} value{enumValues.length !== 1 && 's'}{' '}
            <i
              className={clsx('bi', expanded ? 'bi-chevron-up' : 'bi-chevron-down')}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      {expanded && enumValues.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mt-1">
          {enumValues.map((val) => (
            <span
              key={val}
              className="badge bg-secondary d-inline-flex align-items-center gap-1"
              title={val}
              style={{ maxWidth: '12rem' }}
            >
              <span className="text-truncate">{val}</span>
              {canEdit && (
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  style={{ fontSize: '0.5rem' }}
                  aria-label={`Remove ${val}`}
                  onClick={() => removeValue(val)}
                />
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

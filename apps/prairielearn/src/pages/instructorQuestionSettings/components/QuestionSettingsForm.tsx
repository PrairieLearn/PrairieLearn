import clsx from 'clsx';
import { type ReactNode, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

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
import type { SelectedAssessments } from '../instructorQuestionSettings.types.js';

function CollapsibleSection({
  title,
  description,
  isOpen,
  onToggle,
  collapsible = true,
  children,
}: {
  title: string;
  description: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  collapsible?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      {collapsible ? (
        <button
          type="button"
          className="btn btn-link p-0 text-start text-decoration-none text-body w-100"
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          <div className="d-flex align-items-center">
            <i
              className={clsx('bi me-2', isOpen ? 'bi-chevron-down' : 'bi-chevron-right')}
              aria-hidden="true"
            />
            <h2 className="h4 mb-0">{title}</h2>
          </div>
          <small className="text-muted ps-4">{description}</small>
        </button>
      ) : (
        <div>
          <h2 className="h4 mb-0">{title}</h2>
          <small className="text-muted">{description}</small>
        </div>
      )}
      {isOpen && <div className={clsx('mt-3', collapsible && 'ps-4')}>{children}</div>}
    </div>
  );
}

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

interface QuestionSettingsFormValues {
  qid: string;
  title: string;
  topic: string;
  tags: string[];
  grading_method: 'Internal' | 'External' | 'Manual';
  single_variant: boolean;
  show_correct_answer: boolean;
  workspace_image: string;
  workspace_port: string;
  workspace_home: string;
  workspace_graded_files: string;
  workspace_args: string;
  workspace_environment: string;
  workspace_enable_networking: boolean;
  workspace_rewrite_url: boolean;
  external_grading_enabled: boolean;
  external_grading_image: string;
  external_grading_entrypoint: string;
  external_grading_files: string;
  external_grading_timeout: string;
  external_grading_enable_networking: boolean;
  external_grading_environment: string;
}

export function validateJson(value: string): string | true {
  if (!value || value.trim() === '' || value.trim() === '{}') return true;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
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
  const [showWorkspaceOptions, setShowWorkspaceOptions] = useState(!!question.workspace_image);
  const [showExternalGradingOptions, setShowExternalGradingOptions] = useState(
    !!question.external_grading_image,
  );

  const defaultValues: QuestionSettingsFormValues = {
    qid: question.qid ?? '',
    title: question.title ?? '',
    topic: topic.name,
    tags: questionTags.map((t) => t.name),
    grading_method: question.grading_method,
    single_variant: question.single_variant ?? false,
    show_correct_answer: question.show_correct_answer ?? true,
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
    external_grading_enabled: question.external_grading_enabled ?? false,
    external_grading_image: question.external_grading_image ?? '',
    external_grading_entrypoint: question.external_grading_entrypoint ?? '',
    external_grading_files: question.external_grading_files?.join(', ') ?? '',
    external_grading_timeout: question.external_grading_timeout?.toString() ?? '',
    external_grading_enable_networking: question.external_grading_enable_networking ?? false,
    external_grading_environment:
      Object.keys(question.external_grading_environment).length > 0
        ? JSON.stringify(question.external_grading_environment, null, 2)
        : '{}',
  };

  const {
    register,
    watch,
    setValue,
    trigger,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<QuestionSettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const selectedTopic = watch('topic');
  const selectedTags = watch('tags');
  const selectedGradingMethod = watch('grading_method');

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

  const handleFormSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    const isValid = await trigger();
    if (!isValid) {
      e.preventDefault();
    }
  };

  const handleRemoveWorkspaceConfiguration = () => {
    setValue('workspace_image', '', { shouldDirty: true });
    setValue('workspace_port', '', { shouldDirty: true });
    setValue('workspace_home', '', { shouldDirty: true });
    setValue('workspace_graded_files', '', { shouldDirty: true });
    setValue('workspace_args', '', { shouldDirty: true });
    setValue('workspace_environment', '{}', { shouldDirty: true });
    setValue('workspace_enable_networking', false, { shouldDirty: true });
    setValue('workspace_rewrite_url', true, { shouldDirty: true });
    setShowWorkspaceOptions(false);
  };

  const handleRemoveExternalGradingConfiguration = () => {
    setValue('external_grading_enabled', false, { shouldDirty: true });
    setValue('external_grading_image', '', { shouldDirty: true });
    setValue('external_grading_entrypoint', '', { shouldDirty: true });
    setValue('external_grading_files', '', { shouldDirty: true });
    setValue('external_grading_timeout', '', { shouldDirty: true });
    setValue('external_grading_enable_networking', false, { shouldDirty: true });
    setValue('external_grading_environment', '{}', { shouldDirty: true });
    setShowExternalGradingOptions(false);
  };

  return (
    <form name="edit-question-settings-form" method="POST" onSubmit={handleFormSubmit}>
      <input type="hidden" name="__csrf_token" value={csrfToken} />
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
        {errors.qid && <div className="invalid-feedback">{errors.qid.message}</div>}
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
                      <div>
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
                      <div>
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
          {...register('grading_method', {
            onChange: (e) => {
              if (e.target.value === 'External') {
                // Auto-enable external grading when selecting External mode (if not already configured)
                if (question.external_grading_enabled == null) {
                  setValue('external_grading_enabled', true);
                }
              } else {
                // Clear external grading validation errors when switching away from External
                clearErrors('external_grading_image');
              }
            },
          })}
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

      <CollapsibleSection
        title="Workspace"
        description={
          <>
            Configure a{' '}
            <a
              href="https://prairielearn.readthedocs.io/en/latest/workspaces/"
              onClick={(e) => e.stopPropagation()}
            >
              remote development environment
            </a>{' '}
            for students.
          </>
        }
        isOpen={showWorkspaceOptions}
        onToggle={() => setShowWorkspaceOptions(!showWorkspaceOptions)}
      >
        <div id="workspace-options">
          <div className="mb-3">
            <label className="form-label" htmlFor="workspace_image">
              Image
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.workspace_image && 'is-invalid')}
              id="workspace_image"
              disabled={!canEdit}
              {...register('workspace_image', {
                required: showWorkspaceOptions && 'Image is required for workspace',
              })}
            />
            {errors.workspace_image && (
              <div className="invalid-feedback">{errors.workspace_image.message}</div>
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
              // Disable default behavior of incrementing/decrementing the value when scrolling
              onWheel={(e) => e.currentTarget.blur()}
              {...register('workspace_port', {
                required: showWorkspaceOptions && 'Port is required for workspace',
              })}
            />
            {errors.workspace_port && (
              <div className="invalid-feedback">{errors.workspace_port.message}</div>
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
              {...register('workspace_home', {
                required: showWorkspaceOptions && 'Home is required for workspace',
              })}
            />
            {errors.workspace_home && (
              <div className="invalid-feedback">{errors.workspace_home.message}</div>
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
              {...register('workspace_args')}
            />
            <small className="form-text text-muted">
              Command line arguments to pass to the Docker container. Multiple arguments should be
              separated by spaces and escaped as necessary using the same format as a typical shell.
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
              {...register('workspace_environment', {
                validate: validateJson,
              })}
            />
            {errors.workspace_environment && (
              <div className="invalid-feedback">{errors.workspace_environment.message}</div>
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
          {canEdit && (
            <button
              className="btn btn-sm btn-outline-danger"
              type="button"
              onClick={handleRemoveWorkspaceConfiguration}
            >
              Remove workspace configuration
            </button>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="External grading"
        description={
          <>
            Configure{' '}
            <a
              href="https://prairielearn.readthedocs.io/en/latest/externalGrading/"
              onClick={(e) => e.stopPropagation()}
            >
              grading using a Docker container
            </a>
            .
          </>
        }
        isOpen={isExternalGrading || showExternalGradingOptions}
        collapsible={!isExternalGrading}
        onToggle={() => setShowExternalGradingOptions(!showExternalGradingOptions)}
      >
        <div id="external-grading-options">
          <div className="mb-3 form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="external_grading_enabled"
              disabled={!canEdit}
              {...register('external_grading_enabled')}
            />
            <label className="form-check-label" htmlFor="external_grading_enabled">
              Enabled
            </label>
            <div className="small text-muted">
              Whether the external grader is currently enabled. Useful for troubleshooting external
              grader failures, for instance.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="external_grading_image">
              Image
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.external_grading_image && 'is-invalid')}
              id="external_grading_image"
              disabled={!canEdit}
              {...register('external_grading_image', {
                required: isExternalGrading && 'Image is required for external grading',
              })}
            />
            {errors.external_grading_image && (
              <div className="invalid-feedback">{errors.external_grading_image.message}</div>
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
              className="form-control"
              id="external_grading_timeout"
              min="0"
              disabled={!canEdit}
              // Disable default behavior of incrementing/decrementing the value when scrolling
              onWheel={(e) => e.currentTarget.blur()}
              {...register('external_grading_timeout')}
            />
            <small className="form-text text-muted">
              The number of seconds after which the grading job will timeout.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="external_grading_environment">
              Environment
            </label>
            <textarea
              className={clsx('form-control', errors.external_grading_environment && 'is-invalid')}
              id="external_grading_environment"
              disabled={!canEdit}
              {...register('external_grading_environment', {
                validate: validateJson,
              })}
            />
            {errors.external_grading_environment && (
              <div className="invalid-feedback">{errors.external_grading_environment.message}</div>
            )}
            <small className="form-text text-muted">
              Environment variables to set inside the grading container. Variables must be specified
              as a JSON object (e.g. <code>{'{"key":"value"}'}</code>).
            </small>
          </div>

          <div className="mb-3 form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="external_grading_enable_networking"
              disabled={!canEdit}
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
          {canEdit && (
            <button
              className="btn btn-sm btn-outline-danger"
              type="button"
              onClick={handleRemoveExternalGradingConfiguration}
            >
              Remove external grading configuration
            </button>
          )}
        </div>
      </CollapsibleSection>

      {canEdit && (
        <>
          <button
            id="save-button"
            type="submit"
            className="btn btn-primary mb-2"
            name="__action"
            value="update_question"
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

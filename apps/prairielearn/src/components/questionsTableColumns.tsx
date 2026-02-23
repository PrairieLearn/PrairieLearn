import { type Header, createColumnHelper } from '@tanstack/react-table';

import { run } from '@prairielearn/run';
import { CategoricalColumnFilter } from '@prairielearn/ui';

import { assessmentLabel } from '../lib/assessment.shared.js';
import type { PublicCourseInstance } from '../lib/client/safe-db-types.js';
import { getInstructorUrlPrefix, getQuestionPreviewUrl } from '../lib/client/url.js';

import { AssessmentBadge } from './AssessmentBadge.js';
import { CopyButton } from './CopyButton.js';
import { IssueBadge } from './IssueBadge.js';
import type { SafeQuestionsPageData } from './QuestionsTable.shared.js';
import { SyncProblemButton } from './SyncProblemButton.js';
import { TagBadgeList } from './TagBadge.js';
import { TopicBadge } from './TopicBadge.js';

const columnHelper = createColumnHelper<SafeQuestionsPageData>();

export function createQuestionsTableColumns({
  courseInstances,
  qidPrefix,
  showSharingSets,
  courseId,
  courseInstanceId,
  isPublic,
}: {
  courseInstances: PublicCourseInstance[];
  qidPrefix?: string;
  showSharingSets: boolean;
  courseId: string;
  courseInstanceId?: string;
  isPublic?: boolean;
}) {
  const urlPrefix = getInstructorUrlPrefix({ courseId, courseInstanceId });

  return [
    columnHelper.accessor('qid', {
      id: 'qid',
      header: 'QID',
      cell: (info) => {
        const question = info.row.original;
        const prefix = qidPrefix && question.share_publicly ? qidPrefix : '';

        return (
          <span className="text-nowrap">
            <CopyButton
              text={`${prefix}${question.qid}`}
              tooltipId={`copy-qid-${question.qid}`}
              ariaLabel="Copy QID"
            />
            {run(() => {
              if (question.sync_errors) {
                return <SyncProblemButton type="error" output={question.sync_errors} />;
              }
              if (question.sync_warnings) {
                return <SyncProblemButton type="warning" output={question.sync_warnings} />;
              }
              return null;
            })}
            <a
              href={getQuestionPreviewUrl({
                courseId,
                courseInstanceId,
                questionId: question.id,
                isPublic,
              })}
            >
              {prefix}
              {question.qid}
            </a>
            {question.open_issue_count > 0 && (
              <IssueBadge
                count={question.open_issue_count}
                className="ms-1"
                issueQid={question.qid}
                urlPrefix={urlPrefix}
              />
            )}
          </span>
        );
      },
      size: 250,
      maxSize: 800,
    }),

    columnHelper.accessor('title', {
      id: 'title',
      header: 'Title',
      cell: (info) => <div className="text-wrap">{info.getValue()}</div>,
      size: 300,
      maxSize: 800,
    }),

    columnHelper.accessor('topic', {
      id: 'topic',
      header: 'Topic',
      cell: (info) => <TopicBadge topic={info.getValue()} />,
      sortingFn: (rowA, rowB, columnId) => {
        const topicA = rowA.getValue<SafeQuestionsPageData['topic']>(columnId);
        const topicB = rowB.getValue<SafeQuestionsPageData['topic']>(columnId);
        return topicA.name.localeCompare(topicB.name);
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const topic = row.getValue<SafeQuestionsPageData['topic']>(columnId);
        return filterValues.includes(topic.name);
      },
      size: 150,
    }),

    columnHelper.accessor('tags', {
      id: 'tags',
      header: 'Tags',
      cell: (info) => (
        <div className="d-flex flex-wrap gap-1">
          <TagBadgeList tags={info.getValue()} />
        </div>
      ),
      enableSorting: false,
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const tags = row.getValue<SafeQuestionsPageData['tags']>(columnId) ?? [];
        return filterValues.some((v) => tags.some((t) => t.name === v));
      },
      size: 200,
    }),

    ...(showSharingSets
      ? [
          columnHelper.display({
            id: 'sharing_sets',
            header: 'Sharing',
            cell: (info) => {
              const question = info.row.original;
              return (
                <span className="text-nowrap">
                  {question.share_publicly && (
                    <span className="badge color-green3 me-1">Public</span>
                  )}
                  {question.share_source_publicly && (
                    <span className="badge color-green3 me-1">Public source</span>
                  )}
                  {question.sharing_sets?.map((s) => (
                    <span key={s.name} className="badge color-gray1 me-1">
                      {s.name}
                    </span>
                  ))}
                </span>
              );
            },
            enableSorting: false,
            filterFn: (row, _columnId, filterValues: string[]) => {
              if (filterValues.length === 0) return true;
              const items: string[] = [];
              if (row.original.share_publicly) items.push('Public');
              if (row.original.share_source_publicly) items.push('Public source');
              row.original.sharing_sets?.forEach((s) => {
                if (s.name) items.push(s.name);
              });
              return filterValues.some((v) => items.includes(v));
            },
            size: 150,
          }),
        ]
      : []),

    columnHelper.accessor('display_type', {
      id: 'display_type',
      header: 'Version',
      cell: (info) => {
        const value = info.getValue();
        return <span className={`badge color-${value === 'v3' ? 'green1' : 'red1'}`}>{value}</span>;
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        return filterValues.includes(row.getValue<SafeQuestionsPageData['display_type']>(columnId));
      },
      size: 200,
    }),

    columnHelper.accessor('grading_method', {
      id: 'grading_method',
      header: 'Grading Method',
      cell: (info) => info.getValue(),
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        return filterValues.includes(
          row.getValue<SafeQuestionsPageData['grading_method']>(columnId),
        );
      },
      size: 150,
    }),

    columnHelper.accessor('external_grading_image', {
      id: 'external_grading_image',
      header: 'External Grading Image',
      cell: (info) => {
        const value = info.getValue();
        return value ? <code>{value}</code> : '—';
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const value = row.getValue<SafeQuestionsPageData['external_grading_image']>(columnId);
        if (!value) return filterValues.includes('(None)');
        return filterValues.includes(value);
      },
      size: 200,
    }),

    columnHelper.accessor('workspace_image', {
      id: 'workspace_image',
      header: 'Workspace Image',
      cell: (info) => {
        const value = info.getValue();
        return value ? <code>{value}</code> : '—';
      },
      filterFn: (row, columnId, filterValues: string[]) => {
        if (filterValues.length === 0) return true;
        const value = row.getValue<SafeQuestionsPageData['workspace_image']>(columnId);
        if (!value) return filterValues.includes('(None)');
        return filterValues.includes(value);
      },
      size: 200,
    }),

    // Dynamic assessment columns per course instance, grouped under "Referenced assessments"
    ...(courseInstances.length > 0
      ? [
          columnHelper.group({
            id: 'referenced_assessments',
            header: 'Referenced assessments',
            columns: courseInstances.map((ci) =>
              columnHelper.accessor(
                (row) =>
                  row.assessments
                    ?.filter((a) => a.assessment.course_instance_id === ci.id)
                    .map((a) => assessmentLabel(a.assessment, a.assessment_set)) ?? [],
                {
                  id: `ci_${ci.id}`,
                  // TODO: Make non-nullable once we update the database schema
                  header: ci.short_name!,
                  meta: { label: ci.short_name! },
                  cell: (info) => {
                    const assessments =
                      info.row.original.assessments
                        ?.filter((a) => a.assessment.course_instance_id === ci.id)
                        .sort((a, b) => {
                          return assessmentLabel(a.assessment, a.assessment_set).localeCompare(
                            assessmentLabel(b.assessment, b.assessment_set),
                            undefined,
                            {
                              numeric: true,
                            },
                          );
                        }) ?? [];
                    if (assessments.length === 0) return null;
                    return (
                      <div className="d-flex flex-wrap gap-1">
                        {assessments.map((a) => (
                          <AssessmentBadge
                            key={a.assessment.id}
                            assessment={{
                              assessment_id: a.assessment.id,
                              color: a.assessment_set.color,
                              label: assessmentLabel(a.assessment, a.assessment_set),
                            }}
                            courseInstanceId={ci.id}
                          />
                        ))}
                      </div>
                    );
                  },
                  enableSorting: false,
                  filterFn: (row, _columnId, filterValues: string[]) => {
                    if (filterValues.length === 0) return true;
                    const assessments =
                      row.original.assessments?.filter(
                        (a) => a.assessment.course_instance_id === ci.id,
                      ) ?? [];
                    if (assessments.length === 0) {
                      return filterValues.includes('(None)');
                    }
                    return filterValues.some((v) =>
                      assessments.some(
                        (a) => assessmentLabel(a.assessment, a.assessment_set) === v,
                      ),
                    );
                  },
                  size: 500,
                  maxSize: 800,
                },
              ),
            ),
          }),
        ]
      : []),
  ];
}

export function createQuestionsTableFilters({
  questions,
  courseInstances,
}: {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
}) {
  const allTopics = [...new Set(questions.map((q) => q.topic.name))].sort((a, b) =>
    a.localeCompare(b),
  );

  const allTags = [...new Set(questions.flatMap((q) => q.tags?.map((t) => t.name) ?? []))].sort(
    (a, b) => a.localeCompare(b),
  );

  const allVersions = [...new Set(questions.map((q) => q.display_type))].sort();

  const allGradingMethods = [...new Set(questions.map((q) => q.grading_method))].sort();

  const allExternalGradingImages = [
    '(None)',
    ...Array.from(
      new Set(questions.map((q) => q.external_grading_image).filter((v): v is string => v != null)),
    ).sort(),
  ];

  const allWorkspaceImages = [
    '(None)',
    ...Array.from(
      new Set(questions.map((q) => q.workspace_image).filter((v): v is string => v != null)),
    ).sort(),
  ];

  const allSharingSets = run(() => {
    const sets = new Set<string>(['Public', 'Public source']);
    questions.forEach((q) => {
      q.sharing_sets?.forEach((s) => {
        if (s.name) sets.add(s.name);
      });
    });
    return [...sets];
  });

  const assessmentsByCourseInstance = run(() => {
    const map = new Map<string, Set<string>>();
    for (const q of questions) {
      for (const a of q.assessments ?? []) {
        const ciId = a.assessment.course_instance_id;
        if (!map.has(ciId)) {
          map.set(ciId, new Set());
        }
        map.get(ciId)?.add(assessmentLabel(a.assessment, a.assessment_set));
      }
    }
    return map;
  });

  const filterMap: Record<
    string,
    (props: { header: Header<SafeQuestionsPageData, unknown> }) => React.ReactNode
  > = {
    topic: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allTopics}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    tags: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allTags}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    display_type: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allVersions}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    grading_method: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allGradingMethods}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    external_grading_image: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allExternalGradingImages}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    workspace_image: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allWorkspaceImages}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
    sharing_sets: ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={allSharingSets}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    ),
  };

  courseInstances.forEach((ci) => {
    const assessments = assessmentsByCourseInstance.get(ci.id) ?? new Set();
    const assessmentLabels = [
      '(None)',
      ...Array.from(assessments).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    ];

    filterMap[`ci_${ci.id}`] = ({ header }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={assessmentLabels}
        renderValueLabel={({ value }) => <span>{value}</span>}
      />
    );
  });

  return filterMap;
}

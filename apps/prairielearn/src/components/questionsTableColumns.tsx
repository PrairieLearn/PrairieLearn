import { type Header, createColumnHelper } from '@tanstack/react-table';

import { run } from '@prairielearn/run';
import {
  BooleanColumnFilter,
  type BooleanFilterOption,
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  applyBooleanFilter,
  applyMultiSelectFilter,
} from '@prairielearn/ui';

import { assessmentLabel } from '../lib/assessment.shared.js';
import type { PublicCourseInstance } from '../lib/client/safe-db-types.js';
import { getAssessmentQuestionEditorUrl, getQuestionPreviewUrl } from '../lib/client/url.js';

import { CopyButton } from './CopyButton.js';
import { IssueBadge } from './IssueBadge.js';
import type { SafeQuestionsPageData } from './QuestionsTable.shared.js';
import { SyncProblemButton } from './SyncProblemButton.js';
import { TagBadge, TagBadgeList } from './TagBadge.js';
import { TopicBadge } from './TopicBadge.js';

const columnHelper = createColumnHelper<SafeQuestionsPageData>();
const NONE_FILTER_VALUE = '(None)';
const AUTO_SIZE_SAMPLE_COUNT = 5;

function imageFilterValue(value: string | null | undefined): string {
  return value == null || value.trim() === '' ? NONE_FILTER_VALUE : value;
}

function autoSizeSampleByMeasure(
  questions: SafeQuestionsPageData[],
  measureQuestion: (question: SafeQuestionsPageData) => number,
) {
  return questions
    .map((question, index) => ({ measure: measureQuestion(question), index }))
    .sort((a, b) => b.measure - a.measure)
    .slice(0, AUTO_SIZE_SAMPLE_COUNT)
    .map(({ index }) => index);
}

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
  return [
    columnHelper.accessor('qid', {
      id: 'qid',
      header: 'QID',
      cell: (info) => {
        const question = info.row.original;
        const prefix = qidPrefix && question.share_publicly ? qidPrefix : '';

        return (
          <span className="d-inline-flex align-items-center text-nowrap" style={{ minWidth: 0 }}>
            <CopyButton
              text={`${prefix}${question.qid}`}
              className="p-0 me-1"
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
              className="text-truncate"
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
                className="ms-1 flex-shrink-0"
                issueQid={question.qid}
                {...(courseInstanceId === undefined ? { courseId } : { courseInstanceId })}
              />
            )}
          </span>
        );
      },
      meta: {
        autoSize: true,
        autoSizeSample: (questions) =>
          autoSizeSampleByMeasure(questions, (q) => {
            const issueCountChars = q.open_issue_count.toString().length;
            const qidChars = q.qid.length;
            return qidChars + issueCountChars;
          }),
      },
      size: 250,
    }),

    columnHelper.accessor('title', {
      id: 'title',
      header: 'Title',
      cell: (info) => <div className="text-wrap">{info.getValue()}</div>,
      size: 300,
      maxSize: 500,
      meta: {
        autoSize: true,
        autoSizeSample: (questions) => autoSizeSampleByMeasure(questions, (q) => q.title.length),
      },
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
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const topic = row.getValue<SafeQuestionsPageData['topic']>(columnId);
        return applyMultiSelectFilter(filter, (values) => values.includes(topic.name));
      },
      size: 150,
    }),

    columnHelper.accessor('tags', {
      id: 'tag',
      header: 'Tags',
      cell: (info) => (
        <div className="d-flex flex-wrap gap-1">
          <TagBadgeList tags={info.getValue()} />
        </div>
      ),
      enableSorting: false,
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const tags = row.getValue<SafeQuestionsPageData['tags']>(columnId) ?? [];
        return applyMultiSelectFilter(filter, (values) =>
          values.some((v) => tags.some((t) => t.name === v)),
        );
      },
      size: 200,
      maxSize: 500,
      meta: {
        autoSize: true,
        autoSizeSample: (questions) =>
          autoSizeSampleByMeasure(
            questions,
            (q) => q.tags?.reduce((sum, tag) => sum + tag.name.length, 0) ?? 0,
          ),
      },
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
            filterFn: (row, _columnId, filter: MultiSelectFilterValue) => {
              const items: string[] = [];
              if (row.original.share_publicly) items.push('Public');
              if (row.original.share_source_publicly) items.push('Public source');
              row.original.sharing_sets?.forEach((s) => {
                if (s.name) items.push(s.name);
              });
              return applyMultiSelectFilter(filter, (values) =>
                values.some((v) => items.includes(v)),
              );
            },
            size: 150,
            maxSize: 500,
            meta: {
              autoSize: true,
              autoSizeSample: (questions) =>
                autoSizeSampleByMeasure(questions, (q) => {
                  let measure = 0;
                  if (q.share_publicly) measure += 'Public'.length;
                  if (q.share_source_publicly) measure += 'Public source'.length;
                  measure +=
                    q.sharing_sets?.reduce((sum, set) => sum + (set.name?.length ?? 0), 0) ?? 0;
                  return measure;
                }),
            },
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
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const value = row.getValue<SafeQuestionsPageData['display_type']>(columnId);
        return applyMultiSelectFilter(filter, (values) => values.includes(value));
      },
      size: 200,
    }),

    columnHelper.accessor('grading_method', {
      id: 'grading_method',
      header: 'Grading Method',
      cell: (info) => info.getValue(),
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const value = row.getValue<SafeQuestionsPageData['grading_method']>(columnId);
        return applyMultiSelectFilter(filter, (values) => values.includes(value));
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
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const value = row.getValue<SafeQuestionsPageData['external_grading_image']>(columnId);
        return applyMultiSelectFilter(filter, (values) => values.includes(imageFilterValue(value)));
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
      filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
        const value = row.getValue<SafeQuestionsPageData['workspace_image']>(columnId);
        return applyMultiSelectFilter(filter, (values) => values.includes(imageFilterValue(value)));
      },
      size: 200,
    }),

    columnHelper.accessor('single_variant', {
      id: 'single_variant',
      header: 'Single variant',
      cell: (info) => (info.getValue() ? 'Yes' : 'No'),
      filterFn: (row, columnId, filter: MultiSelectFilterValue<BooleanFilterOption>) => {
        return applyBooleanFilter(filter, row.getValue<boolean>(columnId));
      },
      size: 190,
    }),

    columnHelper.accessor('has_preferences', {
      id: 'has_preferences',
      header: 'Has preferences',
      cell: (info) => (info.getValue() ? 'Yes' : 'No'),
      filterFn: (row, columnId, filter: MultiSelectFilterValue<BooleanFilterOption>) => {
        return applyBooleanFilter(filter, row.getValue<boolean>(columnId));
      },
      size: 170,
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
                  header: () => <code>{ci.short_name}</code>,
                  meta: {
                    label: ci.short_name,
                    autoSize: true,
                    autoSizeSample: (questions) =>
                      autoSizeSampleByMeasure(
                        questions,
                        (q) =>
                          q.assessments
                            ?.filter((a) => a.assessment.course_instance_id === ci.id)
                            .reduce(
                              (sum, a) =>
                                sum + assessmentLabel(a.assessment, a.assessment_set).length,
                              0,
                            ) ?? 0,
                      ),
                  },
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
                          <a
                            key={a.assessment.id}
                            href={getAssessmentQuestionEditorUrl({
                              courseInstanceId: ci.id,
                              assessmentId: a.assessment.id,
                              qid: info.row.original.qid,
                            })}
                            className={`btn btn-badge color-${a.assessment_set.color}`}
                          >
                            {assessmentLabel(a.assessment, a.assessment_set)}
                          </a>
                        ))}
                      </div>
                    );
                  },
                  enableSorting: false,
                  filterFn: (row, _columnId, filter: MultiSelectFilterValue) => {
                    const assessments =
                      row.original.assessments?.filter(
                        (a) => a.assessment.course_instance_id === ci.id,
                      ) ?? [];
                    return applyMultiSelectFilter(filter, (values) => {
                      if (assessments.length === 0) {
                        return values.includes('(None)');
                      }
                      return values.some((v) =>
                        assessments.some(
                          (a) => assessmentLabel(a.assessment, a.assessment_set) === v,
                        ),
                      );
                    });
                  },
                  size: 300,
                  maxSize: 500,
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
  const topicsByName = new Map<string, SafeQuestionsPageData['topic']>();
  questions.forEach((q) => {
    if (!topicsByName.has(q.topic.name)) topicsByName.set(q.topic.name, q.topic);
  });
  const allTopics = [...topicsByName.keys()].sort((a, b) => a.localeCompare(b));

  const tagsByName = new Map<string, NonNullable<SafeQuestionsPageData['tags']>[number]>();
  questions.forEach((q) => {
    q.tags?.forEach((t) => {
      if (!tagsByName.has(t.name)) tagsByName.set(t.name, t);
    });
  });
  const allTags = [...tagsByName.keys()].sort((a, b) => a.localeCompare(b));

  const allVersions = [...new Set(questions.map((q) => q.display_type))].sort();

  const allGradingMethods = [...new Set(questions.map((q) => q.grading_method))].sort();

  const allExternalGradingImages = [
    ...Array.from(new Set(questions.map((q) => imageFilterValue(q.external_grading_image)))).sort(),
  ];

  const allWorkspaceImages = [
    ...Array.from(new Set(questions.map((q) => imageFilterValue(q.workspace_image)))).sort(),
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
    const map = new Map<string, Map<string, { color: string }>>();
    for (const q of questions) {
      for (const a of q.assessments ?? []) {
        const ciId = a.assessment.course_instance_id;
        if (!map.has(ciId)) {
          map.set(ciId, new Map());
        }
        const label = assessmentLabel(a.assessment, a.assessment_set);
        const byLabel = map.get(ciId);
        if (byLabel && !byLabel.has(label)) {
          byLabel.set(label, { color: a.assessment_set.color });
        }
      }
    }
    return map;
  });

  const filterMap: Record<
    string,
    (props: { header: Header<SafeQuestionsPageData, unknown> }) => React.ReactNode
  > = {
    topic: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={allTopics}
        renderValueLabel={({ value }) => {
          const topic = topicsByName.get(value);
          return topic ? (
            <TopicBadge topic={topic} />
          ) : (
            <span className="text-nowrap">{value}</span>
          );
        }}
      />
    ),
    tag: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={allTags}
        renderValueLabel={({ value }) => {
          const tag = tagsByName.get(value);
          return tag ? <TagBadge tag={tag} /> : <span className="text-nowrap">{value}</span>;
        }}
      />
    ),
    display_type: ({ header }) => (
      <MultiSelectColumnFilter column={header.column} allColumnValues={allVersions} />
    ),
    grading_method: ({ header }) => (
      <MultiSelectColumnFilter column={header.column} allColumnValues={allGradingMethods} />
    ),
    external_grading_image: ({ header }) => (
      <MultiSelectColumnFilter column={header.column} allColumnValues={allExternalGradingImages} />
    ),
    workspace_image: ({ header }) => (
      <MultiSelectColumnFilter column={header.column} allColumnValues={allWorkspaceImages} />
    ),
    single_variant: ({ header }) => <BooleanColumnFilter column={header.column} />,
    has_preferences: ({ header }) => <BooleanColumnFilter column={header.column} />,
    sharing_sets: ({ header }) => (
      <MultiSelectColumnFilter column={header.column} allColumnValues={allSharingSets} />
    ),
  };

  courseInstances.forEach((ci) => {
    const assessments =
      assessmentsByCourseInstance.get(ci.id) ?? new Map<string, { color: string }>();
    const assessmentLabels = [
      NONE_FILTER_VALUE,
      ...Array.from(assessments.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    ];

    filterMap[`ci_${ci.id}`] = ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={assessmentLabels}
        renderValueLabel={({ value }) => {
          const info = assessments.get(value);
          return info ? (
            <span className={`badge color-${info.color}`}>{value}</span>
          ) : (
            <span className="text-nowrap">{value}</span>
          );
        }}
      />
    );
  });

  return filterMap;
}

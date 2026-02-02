import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type SortingState,
  type Updater,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  TanstackTableEmptyState,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../lib/client/tanstackQuery.js';
import { getAiQuestionGenerationDraftsUrl } from '../lib/client/url.js';

import { AssessmentBadgeList } from './AssessmentBadge.js';
import { IssueBadge } from './IssueBadge.js';
import {
  type CourseInstance,
  type SafeQuestionsPageData,
  SafeQuestionsPageDataSchema,
} from './QuestionsTable.shared.js';
import { SyncProblemButton } from './SyncProblemButton.js';
import { TagBadgeList } from './TagBadge.js';
import { TopicBadge } from './TopicBadge.js';

export type { CourseInstance, SafeQuestionsPageData } from './QuestionsTable.shared.js';

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: ['qid'], right: [] };

const columnHelper = createColumnHelper<SafeQuestionsPageData>();

interface ColumnWithOptionalChildren {
  id?: string;
  columns?: ColumnWithOptionalChildren[];
}

/**
 * Recursively extracts leaf column IDs from column definitions.
 * Group columns are skipped, only actual data columns are included.
 */
function extractLeafColumnIds(columns: ColumnWithOptionalChildren[]): string[] {
  const leafIds: string[] = [];
  for (const col of columns) {
    if (col.columns && col.columns.length > 0) {
      leafIds.push(...extractLeafColumnIds(col.columns));
    } else if (col.id) {
      leafIds.push(col.id);
    }
  }
  return leafIds;
}

function CopyQidButton({ qid, qidPrefix }: { qid: string; qidPrefix: string }) {
  const [copied, setCopied] = useState(false);
  const fullQid = `${qidPrefix}${qid}`;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullQid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [fullQid]);

  return (
    <OverlayTrigger
      tooltip={{
        body: copied ? 'Copied!' : 'Copy QID',
        props: { id: `copy-qid-${qid}` },
      }}
    >
      <button
        type="button"
        className="btn btn-xs btn-ghost me-1"
        aria-label="Copy QID"
        onClick={handleCopy}
      >
        <i className={copied ? 'bi bi-check' : 'bi bi-copy'} />
      </button>
    </OverlayTrigger>
  );
}

interface QuestionsTableCardProps {
  questions: SafeQuestionsPageData[];
  courseInstances: CourseInstance[];
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  /** Required when showAddQuestionButton is true */
  onAddQuestion?: () => void;
}

function QuestionsTableCard({
  questions: initialQuestions,
  courseInstances,
  currentCourseInstanceId,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  qidPrefix,
  onAddQuestion,
}: QuestionsTableCardProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  // Topic filter
  const allTopics = useMemo(() => {
    const topics = new Set<string>();
    initialQuestions.forEach((q) => topics.add(q.topic.name));
    return [...topics].sort((a, b) => a.localeCompare(b));
  }, [initialQuestions]);

  const [topicFilter, setTopicFilter] = useQueryState(
    'topic',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Tags filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    initialQuestions.forEach((q) => {
      q.tags?.forEach((tag) => tags.add(tag.name));
    });
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [initialQuestions]);

  const [tagsFilter, setTagsFilter] = useQueryState(
    'tags',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Sharing sets filter
  const allSharingSets = useMemo(() => {
    const sets = new Set<string>(['Public', 'Public source']);
    initialQuestions.forEach((q) => {
      q.sharing_sets?.forEach((s) => {
        if (s.name) sets.add(s.name);
      });
    });
    return [...sets];
  }, [initialQuestions]);

  const [sharingSetsFilter, setSharingSetsFilter] = useQueryState(
    'sharing',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Assessment filters per course instance (URL-persisted)
  const courseInstanceIds = useMemo(() => courseInstances.map((ci) => ci.id), [courseInstances]);

  const defaultAssessmentFilterParsers = useMemo(() => {
    return Object.fromEntries(
      courseInstanceIds.map((id) => [`ci_${id}`, parseAsArrayOf(parseAsString).withDefault([])]),
    );
  }, [courseInstanceIds]);

  const [assessmentFilters, setAssessmentFilters] = useQueryStates(defaultAssessmentFilterParsers);

  const hasLegacyQuestions = useMemo(() => {
    return initialQuestions.some((q) => q.display_type !== 'v3');
  }, [initialQuestions]);

  // Version filter
  const allVersions = useMemo(() => {
    const versions = new Set<string>();
    initialQuestions.forEach((q) => versions.add(q.display_type));
    return [...versions].sort();
  }, [initialQuestions]);

  const [versionFilter, setVersionFilter] = useQueryState(
    'version',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Grading method filter
  const allGradingMethods = useMemo(() => {
    const methods = new Set<string>();
    initialQuestions.forEach((q) => methods.add(q.grading_method));
    return [...methods].sort();
  }, [initialQuestions]);

  const [gradingMethodFilter, setGradingMethodFilter] = useQueryState(
    'grading',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // External grading image filter
  const allExternalGradingImages = useMemo(() => {
    const images = new Set<string>();
    initialQuestions.forEach((q) => {
      if (q.external_grading_image) images.add(q.external_grading_image);
    });
    return ['(None)', ...Array.from(images).sort()];
  }, [initialQuestions]);

  const [externalGradingImageFilter, setExternalGradingImageFilter] = useQueryState(
    'extImage',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Workspace image filter
  const allWorkspaceImages = useMemo(() => {
    const images = new Set<string>();
    initialQuestions.forEach((q) => {
      if (q.workspace_image) images.add(q.workspace_image);
    });
    return ['(None)', ...Array.from(images).sort()];
  }, [initialQuestions]);

  const [workspaceImageFilter, setWorkspaceImageFilter] = useQueryState(
    'wsImage',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // Assessment filters per course instance
  const assessmentsByCourseInstance = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const q of initialQuestions) {
      for (const a of q.assessments ?? []) {
        if (!map.has(a.course_instance_id)) {
          map.set(a.course_instance_id, new Set());
        }
        map.get(a.course_instance_id)?.add(a.label);
      }
    }
    return map;
  }, [initialQuestions]);

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];

    if (topicFilter.length > 0) {
      filters.push({ id: 'topic', value: topicFilter });
    }
    if (tagsFilter.length > 0) {
      filters.push({ id: 'tags', value: tagsFilter });
    }
    if (sharingSetsFilter.length > 0) {
      filters.push({ id: 'sharing_sets', value: sharingSetsFilter });
    }
    if (versionFilter.length > 0) {
      filters.push({ id: 'display_type', value: versionFilter });
    }
    if (gradingMethodFilter.length > 0) {
      filters.push({ id: 'grading_method', value: gradingMethodFilter });
    }
    if (externalGradingImageFilter.length > 0) {
      filters.push({ id: 'external_grading_image', value: externalGradingImageFilter });
    }
    if (workspaceImageFilter.length > 0) {
      filters.push({ id: 'workspace_image', value: workspaceImageFilter });
    }

    // Add assessment filters (map from URL key ci_${id} to column ID ci_${id}_assessments)
    for (const [urlKey, values] of Object.entries(assessmentFilters)) {
      if (values.length > 0) {
        filters.push({ id: `${urlKey}_assessments`, value: values });
      }
    }

    return filters;
  }, [
    topicFilter,
    tagsFilter,
    sharingSetsFilter,
    versionFilter,
    gradingMethodFilter,
    externalGradingImageFilter,
    workspaceImageFilter,
    assessmentFilters,
  ]);

  // We keep a consistent interface for the column filter setters
  const columnFilterSetters = useMemo<
    Record<string, ((_columnId: string, value: string[]) => void) | undefined>
  >(() => {
    return {
      qid: undefined,
      title: undefined,
      topic: (_columnId: string, value: string[]) => void setTopicFilter(value),
      tags: (_columnId: string, value: string[]) => void setTagsFilter(value),
      sharing_sets: (_columnId: string, value: string[]) => void setSharingSetsFilter(value),
      display_type: (_columnId: string, value: string[]) => void setVersionFilter(value),
      grading_method: (_columnId: string, value: string[]) => void setGradingMethodFilter(value),
      external_grading_image: (_columnId: string, value: string[]) =>
        void setExternalGradingImageFilter(value),
      workspace_image: (_columnId: string, value: string[]) => void setWorkspaceImageFilter(value),
      // Assessment filter setters (column ID ci_${id}_assessments -> URL key ci_${id})
      ...Object.fromEntries(
        courseInstanceIds.map((id) => [
          `ci_${id}_assessments`,
          (_columnId: string, value: string[]) =>
            void setAssessmentFilters({ [`ci_${id}`]: value }),
        ]),
      ),
    };
  }, [
    setTopicFilter,
    setTagsFilter,
    setSharingSetsFilter,
    setVersionFilter,
    setGradingMethodFilter,
    setExternalGradingImageFilter,
    setWorkspaceImageFilter,
    courseInstanceIds,
    setAssessmentFilters,
  ]);

  const handleColumnFiltersChange = useMemo(
    () => (updaterOrValue: Updater<ColumnFiltersState>) => {
      const newFilters =
        typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;

      // Track current filter IDs to detect removed filters
      const currentFilterIds = new Set(columnFilters.map((f) => f.id));
      const newFilterIds = new Set(newFilters.map((f) => f.id));

      // Update filters that changed or were added
      for (const filter of newFilters) {
        columnFilterSetters[filter.id]?.(filter.id, filter.value as string[]);
      }

      // Clear filters that were removed
      for (const id of currentFilterIds) {
        if (!newFilterIds.has(id)) {
          columnFilterSetters[id]?.(id, []);
        }
      }
    },
    [columnFilters, columnFilterSetters],
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const {
    data: questions,
    error: questionsError,
    isError: isQuestionsError,
  } = useQuery<SafeQuestionsPageData[], Error>({
    queryKey: ['questions', urlPrefix],
    queryFn: async () => {
      const res = await fetch(`${window.location.pathname}/data.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch questions: HTTP ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      const parsedData = z.array(SafeQuestionsPageDataSchema).safeParse(data);
      if (!parsedData.success) {
        const errorDetails = parsedData.error.errors
          .slice(0, 3)
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        throw new Error(`Failed to parse questions: ${errorDetails}`);
      }
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData: initialQuestions,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('qid', {
        id: 'qid',
        header: 'QID',
        cell: (info) => {
          const question = info.row.original;
          const prefix = qidPrefix && question.share_publicly ? qidPrefix : '';

          return (
            <span className="text-nowrap">
              <CopyQidButton qid={question.qid} qidPrefix={prefix} />
              {question.sync_errors ? (
                <SyncProblemButton type="error" output={question.sync_errors} />
              ) : question.sync_warnings ? (
                <SyncProblemButton type="warning" output={question.sync_warnings} />
              ) : null}
              <a href={`${urlPrefix}/question/${question.id}/preview`}>
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
        sortingFn: (rowA, rowB) => {
          return rowA.original.topic.name.localeCompare(rowB.original.topic.name);
        },
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.topic.name);
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
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const tags = row.original.tags ?? [];
          return filterValues.some((v) => tags.some((t) => t.name === v));
        },
        size: 200,
      }),

      ...(showSharingSets
        ? [
            columnHelper.accessor(
              (row) => {
                const items: string[] = [];
                if (row.share_publicly) items.push('Public');
                if (row.share_source_publicly) items.push('Public source');
                row.sharing_sets?.forEach((s) => {
                  if (s.name) items.push(s.name);
                });
                return items;
              },
              {
                id: 'sharing_sets',
                header: 'Sharing',
                cell: (info) => {
                  const question = info.row.original;
                  const items: React.ReactNode[] = [];

                  if (question.share_publicly) {
                    items.push(
                      <span key="public" className="badge color-green3 me-1">
                        Public
                      </span>,
                    );
                  }
                  if (question.share_source_publicly) {
                    items.push(
                      <span key="public-source" className="badge color-green3 me-1">
                        Public source
                      </span>,
                    );
                  }
                  question.sharing_sets?.forEach((s) =>
                    items.push(
                      <span key={s.name} className="badge color-gray1 me-1">
                        {s.name}
                      </span>,
                    ),
                  );

                  return <span className="text-nowrap">{items}</span>;
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
              },
            ),
          ]
        : []),

      columnHelper.accessor('display_type', {
        id: 'display_type',
        header: 'Version',
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={`badge color-${value === 'v3' ? 'green1' : 'red1'}`}>{value}</span>
          );
        },
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.display_type);
        },
        size: 200,
      }),

      columnHelper.accessor('grading_method', {
        id: 'grading_method',
        header: 'Grading Method',
        cell: (info) => info.getValue(),
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.grading_method);
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
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const value = row.original.external_grading_image;
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
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const value = row.original.workspace_image;
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
                      ?.filter((a) => a.course_instance_id === ci.id)
                      .map((a) => a.label) ?? [],
                  {
                    id: `ci_${ci.id}_assessments`,
                    header: ci.short_name,
                    meta: { label: ci.short_name },
                    cell: (info) => {
                      const assessments =
                        info.row.original.assessments
                          ?.filter((a) => a.course_instance_id === ci.id)
                          .sort((a, b) =>
                            a.label.localeCompare(b.label, undefined, { numeric: true }),
                          ) ?? [];
                      if (assessments.length === 0) return null;
                      return (
                        <div className="d-flex flex-wrap gap-1">
                          <AssessmentBadgeList assessments={assessments} courseInstanceId={ci.id} />
                        </div>
                      );
                    },
                    enableSorting: false,
                    filterFn: (row, _columnId, filterValues: string[]) => {
                      if (filterValues.length === 0) return true;
                      const assessments =
                        row.original.assessments?.filter((a) => a.course_instance_id === ci.id) ??
                        [];
                      if (assessments.length === 0) {
                        return filterValues.includes('(None)');
                      }
                      return filterValues.some((v) =>
                        v === '(None)' ? false : assessments.some((a) => a.label === v),
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
    ],
    [courseInstances, qidPrefix, showSharingSets, urlPrefix],
  );

  const allColumnIds = extractLeafColumnIds(columns);

  const defaultColumnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const id of allColumnIds) {
      // Default visibility based on column type
      if (id === 'sharing_sets') {
        visibility[id] = false;
      } else if (id === 'display_type') {
        visibility[id] = hasLegacyQuestions;
      } else if (id === 'grading_method') {
        visibility[id] = false;
      } else if (id === 'external_grading_image') {
        visibility[id] = false;
      } else if (id === 'workspace_image') {
        visibility[id] = false;
      } else if (id.startsWith('ci_')) {
        // Show assessment columns for current course instance
        const ciId = id.split('_')[1];
        visibility[id] = currentCourseInstanceId === ciId;
      } else {
        visibility[id] = true;
      }
    }
    return visibility;
  }, [allColumnIds, currentCourseInstanceId, hasLegacyQuestions]);

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  // Filters configuration
  const filters = useMemo(() => {
    const filterMap: Record<
      string,
      (props: { header: Header<SafeQuestionsPageData, unknown> }) => React.JSX.Element
    > = {
      topic: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allTopics}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      tags: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allTags}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      display_type: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allVersions}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      grading_method: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allGradingMethods}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      external_grading_image: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allExternalGradingImages}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      workspace_image: ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allWorkspaceImages}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
    };

    if (showSharingSets) {
      filterMap.sharing_sets = ({ header }: { header: Header<SafeQuestionsPageData, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={allSharingSets}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      );
    }

    // Add assessment filters for each course instance
    courseInstances.forEach((ci) => {
      const assessments = assessmentsByCourseInstance.get(ci.id) ?? new Set();
      const assessmentLabels = [
        '(None)',
        ...Array.from(assessments).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      ];

      filterMap[`ci_${ci.id}_assessments`] = ({
        header,
      }: {
        header: Header<SafeQuestionsPageData, unknown>;
      }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={assessmentLabels}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      );
    });

    return filterMap;
  }, [
    allTags,
    allTopics,
    allVersions,
    allGradingMethods,
    allExternalGradingImages,
    allWorkspaceImages,
    allSharingSets,
    showSharingSets,
    courseInstances,
    assessmentsByCourseInstance,
  ]);

  const table = useReactTable({
    data: questions,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
    },
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 80,
      size: 150,
      maxSize: 500,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  const aiGenerateUrl = getAiQuestionGenerationDraftsUrl({ urlPrefix });

  return (
    <>
      {isQuestionsError && (
        <Alert variant="danger" className="mb-3">
          <strong>Error loading questions:</strong> {questionsError.message}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Questions"
        className={isQuestionsError ? undefined : 'h-100'}
        singularLabel="question"
        pluralLabel="questions"
        headerButtons={
          showAddQuestionButton ? (
            <>
              <Button variant="light" size="sm" onClick={onAddQuestion}>
                <i className="fa fa-plus me-2" aria-hidden="true" />
                Add question
              </Button>
              {showAiGenerateQuestionButton && (
                <Button variant="light" size="sm" as="a" href={aiGenerateUrl}>
                  <i className="bi bi-stars me-2" aria-hidden="true" />
                  Generate with AI
                </Button>
              )}
            </>
          ) : undefined
        }
        globalFilter={{
          placeholder: 'Search by QID, title...',
        }}
        tableOptions={{
          filters,
          emptyState: (
            <TanstackTableEmptyState iconName="bi-file-earmark-code">
              <div className="d-flex flex-column align-items-center gap-3">
                <div className="text-center">
                  <h5 className="mb-2">No questions found</h5>
                  <p className="text-muted mb-0" style={{ textWrap: 'balance' }}>
                    A question is a problem or task that tests a student's understanding of a
                    specific concept.
                  </p>
                  <p className="text-muted">
                    Learn more in the{' '}
                    <a
                      href="https://prairielearn.readthedocs.io/en/latest/question/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      question documentation
                    </a>
                    .
                  </p>
                </div>
                {showAddQuestionButton && (
                  <div className="d-flex gap-2">
                    <Button variant="primary" onClick={onAddQuestion}>
                      <i className="fa fa-plus me-2" aria-hidden="true" />
                      Add question
                    </Button>
                    {showAiGenerateQuestionButton && (
                      <Button variant="outline-primary" as="a" href={aiGenerateUrl}>
                        <i className="bi bi-stars me-2" aria-hidden="true" />
                        Generate with AI
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TanstackTableEmptyState>
          ),
          noResultsState: (
            <TanstackTableEmptyState iconName="bi-search">
              No questions found matching your search criteria.
            </TanstackTableEmptyState>
          ),
        }}
      />
    </>
  );
}

export interface QuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: CourseInstance[];
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  search: string;
  isDevMode: boolean;
  /** Required when showAddQuestionButton is true */
  onAddQuestion?: () => void;
}

export function QuestionsTable({
  questions,
  courseInstances,
  currentCourseInstanceId,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  urlPrefix,
  qidPrefix,
  search,
  isDevMode,
  onAddQuestion,
}: QuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <QuestionsTableCard
          questions={questions}
          courseInstances={courseInstances}
          currentCourseInstanceId={currentCourseInstanceId}
          showAddQuestionButton={showAddQuestionButton}
          showAiGenerateQuestionButton={showAiGenerateQuestionButton}
          showSharingSets={showSharingSets}
          urlPrefix={urlPrefix}
          qidPrefix={qidPrefix}
          onAddQuestion={onAddQuestion}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

QuestionsTable.displayName = 'QuestionsTable';

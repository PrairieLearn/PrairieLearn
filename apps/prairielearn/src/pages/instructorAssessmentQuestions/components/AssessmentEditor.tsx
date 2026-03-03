import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { run } from '@prairielearn/run';
import { useModalState } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { QuestionByQidResult } from '../trpc.js';
import type {
  QuestionAlternativeForm,
  SelectedItem,
  ViewType,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';
import {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
} from '../utils/dataTransform.js';
import {
  buildQuestionMetadata,
  normalizeQuestionPoints,
  questionDisplayName,
} from '../utils/questions.js';
import { createAssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC, useTRPCClient } from '../utils/trpc-context.js';
import { findQuestionByTrackingId, useAssessmentEditor } from '../utils/useAssessmentEditor.js';

import { EditModeToolbar } from './EditModeToolbar.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
import { SplitPane } from './SplitPane.js';
import { DetailPanel } from './detail/DetailPanel.js';
import { AssessmentTree } from './tree/AssessmentTree.js';

interface AssessmentEditorInnerProps {
  course: StaffCourse;
  courseInstance: StaffCourseInstance;
  questionRows: StaffAssessmentQuestionRow[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
}

function AssessmentEditorInner({
  course,
  courseInstance,
  questionRows,
  jsonZones,
  urlPrefix,
  assessment,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
}: AssessmentEditorInnerProps) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const [initialState] = useState(() => ({
    zones: addTrackingIds(jsonZones),
    questionMetadata: Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), r]),
    ),
    collapsedGroups: new Set<string>(),
    collapsedZones: new Set<string>(),
  }));

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesJson = useMemo(() => JSON.stringify(initialState.zones), [initialState.zones]);

  const [editMode, setEditMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [viewType, setViewType] = useState<ViewType>('simple');
  const resetModal = useModalState<string>(null);

  const courseQuestionsQuery = useQuery({
    ...trpc.courseQuestions.queryOptions(),
    enabled: editMode,
  });
  const courseQuestions = courseQuestionsQuery.data ?? [];

  const questionsInAssessment = useMemo(() => {
    const qids = new Set<string>();
    for (const zone of zones) {
      for (const question of zone.questions) {
        if (question.id) qids.add(question.id);
        if (question.alternatives) {
          for (const alt of question.alternatives) {
            if (alt.id) qids.add(alt.id);
          }
        }
      }
    }
    return qids;
  }, [zones]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const positionByStableId = useMemo(() => {
    const map: Record<string, { zoneIndex: number; questionIndex: number }> = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
      });
    });
    return map;
  }, [zones]);

  const handleAddQuestion = (zoneTrackingId: string) => {
    setSelectedItem({ type: 'picker', zoneTrackingId });
  };

  const handleQuestionPicked = async (qid: string) => {
    if (selectedItem?.type !== 'picker') return;

    if (selectedItem.returnToSelection) {
      // Returning to a question detail panel after picking a new QID
      const returnTo = selectedItem.returnToSelection;
      if (returnTo.type === 'question' || returnTo.type === 'alternative') {
        const questionTrackingId = returnTo.questionTrackingId;

        let questionData: QuestionByQidResult;
        try {
          questionData = await trpcClient.questionByQid.query({ qid });
        } catch {
          return;
        }

        const found = findQuestionByTrackingId(zones, questionTrackingId);
        if (found) {
          const oldId =
            returnTo.type === 'alternative'
              ? found.question.alternatives?.find(
                  (a) => a.trackingId === returnTo.alternativeTrackingId,
                )?.id
              : found.question.id;

          dispatch({
            type: 'UPDATE_QUESTION_METADATA',
            questionId: qid,
            oldQuestionId: oldId,
            questionData: buildQuestionMetadata({
              data: questionData,
              assessment,
              courseInstance,
              course,
            }),
          });

          if (returnTo.type === 'alternative') {
            dispatch({
              type: 'UPDATE_QUESTION',
              questionTrackingId,
              alternativeTrackingId: returnTo.alternativeTrackingId,
              question: { id: qid },
            });
          } else {
            dispatch({
              type: 'UPDATE_QUESTION',
              questionTrackingId,
              question: { id: qid },
            });
          }
        }

        setSelectedItem(returnTo);
      }
      return;
    }

    // Adding a new question to a zone
    let questionData: QuestionByQidResult;
    try {
      questionData = await trpcClient.questionByQid.query({ qid });
    } catch {
      return;
    }

    const newQuestion = {
      id: qid,
      ...createQuestionWithTrackingId(),
    } as ZoneQuestionBlockForm;

    dispatch({
      type: 'ADD_QUESTION',
      zoneTrackingId: selectedItem.zoneTrackingId,
      question: newQuestion,
      questionData: buildQuestionMetadata({
        data: questionData,
        assessment,
        courseInstance,
        course,
      }),
    });

    // Stay in picker for "add another" behavior
  };

  const handlePickerDone = () => {
    setSelectedItem(null);
  };

  const handlePickQuestion = (currentSelection: SelectedItem) => {
    if (!currentSelection) return;
    const zoneTrackingId = run(() => {
      if (currentSelection.type === 'question' || currentSelection.type === 'alternative') {
        return zones.find((z) =>
          z.questions.some((q) => q.trackingId === currentSelection.questionTrackingId),
        )?.trackingId;
      }
      return undefined;
    });
    if (!zoneTrackingId) return;
    setSelectedItem({ type: 'picker', zoneTrackingId, returnToSelection: currentSelection });
  };

  const handleUpdateQuestion = (
    questionTrackingId: string,
    updatedQuestion: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => {
    const normalized = normalizeQuestionPoints(
      updatedQuestion as ZoneQuestionBlockForm | QuestionAlternativeForm,
    );

    dispatch({
      type: 'UPDATE_QUESTION',
      questionTrackingId,
      question: normalized,
      alternativeTrackingId,
    });
  };

  const handleDeleteQuestion = (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => {
    // Clear selection if the deleted item was selected
    if (
      selectedItem?.type === 'question' &&
      selectedItem.questionTrackingId === questionTrackingId
    ) {
      setSelectedItem(null);
    }
    if (
      selectedItem?.type === 'alternative' &&
      selectedItem.alternativeTrackingId === alternativeTrackingId
    ) {
      setSelectedItem(null);
    }

    dispatch({
      type: 'DELETE_QUESTION',
      questionTrackingId,
      questionId,
      alternativeTrackingId,
    });
  };

  const handleAddZone = () => {
    const zone = createZoneWithTrackingId({
      questions: [] as ZoneAssessmentForm['questions'],
      lockpoint: false,
      canSubmit: [],
      canView: [],
    } as Omit<ZoneAssessmentForm, 'trackingId'>);
    dispatch({ type: 'ADD_ZONE', zone });
    setSelectedItem({ type: 'zone', zoneTrackingId: zone.trackingId });
  };

  const handleUpdateZone = (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => {
    dispatch({ type: 'UPDATE_ZONE', zoneTrackingId, zone });
  };

  const handleDeleteZone = (zoneTrackingId: string) => {
    if (selectedItem?.type === 'zone' && selectedItem.zoneTrackingId === zoneTrackingId) {
      setSelectedItem(null);
    }
    dispatch({ type: 'DELETE_ZONE', zoneTrackingId });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeType = active.data.current?.type as 'zone' | 'question' | undefined;

    if (activeType === 'zone') {
      const fromZoneIndex = zones.findIndex((z) => z.trackingId === activeIdStr);
      if (fromZoneIndex === -1) return;

      const toZoneIndex = zones.findIndex((z) => z.trackingId === overIdStr);
      if (toZoneIndex === -1 || fromZoneIndex === toZoneIndex) return;

      const isDraggingDown = fromZoneIndex < toZoneIndex;
      let beforeZoneTrackingId: string | null;

      if (isDraggingDown) {
        const nextIndex = toZoneIndex + 1;
        beforeZoneTrackingId = nextIndex < zones.length ? zones[nextIndex].trackingId : null;
      } else {
        beforeZoneTrackingId = zones[toZoneIndex].trackingId;
      }

      dispatch({
        type: 'REORDER_ZONE',
        zoneTrackingId: activeIdStr,
        beforeZoneTrackingId,
      });
      return;
    }

    const fromPosition = positionByStableId[activeIdStr];
    const toPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !toPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];
    const toZone = zones[toPosition.zoneIndex];

    if (fromZone.trackingId !== toZone.trackingId) return;
    if (fromPosition.questionIndex === toPosition.questionIndex) return;

    const isDraggingDown = fromPosition.questionIndex < toPosition.questionIndex;
    const beforeQuestionTrackingId = isDraggingDown
      ? (toZone.questions[toPosition.questionIndex + 1]?.trackingId ?? null)
      : toZone.questions[toPosition.questionIndex].trackingId;

    dispatch({
      type: 'REORDER_QUESTION',
      questionTrackingId: activeIdStr,
      toZoneTrackingId: toZone.trackingId,
      beforeQuestionTrackingId,
    });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeType = active.data.current?.type as 'zone' | 'question' | undefined;
    if (activeType !== 'question') return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const fromPosition = positionByStableId[activeIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];

    const targetZone = zones.find((z) => `${z.trackingId}-empty-drop` === overIdStr);
    if (targetZone && fromZone.trackingId !== targetZone.trackingId) {
      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId: activeIdStr,
        toZoneTrackingId: targetZone.trackingId,
        beforeQuestionTrackingId: null,
      });
      return;
    }

    const toPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!toPosition) return;
    const toZone = zones[toPosition.zoneIndex];
    if (fromZone.trackingId !== toZone.trackingId) {
      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId: activeIdStr,
        toZoneTrackingId: toZone.trackingId,
        beforeQuestionTrackingId: toZone.questions[toPosition.questionIndex].trackingId,
      });
    }
  };

  const isAllExpanded = collapsedZones.size === 0 && collapsedGroups.size === 0;

  const saveButtonDisabled =
    JSON.stringify(zones) === initialZonesJson || zones.some((zone) => zone.questions.length === 0);

  const saveButtonDisabledReason = zones.some((zone) => zone.questions.length === 0)
    ? 'Cannot save: one or more zones have no questions'
    : undefined;

  const zonesForSave = useMemo(() => stripTrackingIds(zones), [zones]);

  const toggleExpandCollapse = () => {
    if (isAllExpanded) {
      dispatch({ type: 'COLLAPSE_ALL' });
    } else {
      dispatch({ type: 'EXPAND_ALL' });
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div>
          <SplitPane
            forceOpen={selectedItem}
            left={
              <AssessmentTree
                zones={zones}
                questionMetadata={questionMetadata}
                editMode={editMode}
                viewType={viewType}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                collapsedGroups={collapsedGroups}
                collapsedZones={collapsedZones}
                urlPrefix={urlPrefix}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                assessmentType={assessment.type}
                dispatch={dispatch}
                isAllExpanded={isAllExpanded}
                editControls={
                  <EditModeToolbar
                    csrfToken={csrfToken}
                    origHash={origHash}
                    zones={zonesForSave}
                    editMode={editMode}
                    canEdit={canEdit && !!origHash}
                    setEditMode={setEditMode}
                    saveButtonDisabled={saveButtonDisabled}
                    saveButtonDisabledReason={saveButtonDisabledReason}
                    onCancel={() => {
                      dispatch({ type: 'RESET' });
                      setEditMode(false);
                    }}
                  />
                }
                onAddQuestion={handleAddQuestion}
                onAddZone={handleAddZone}
                onDeleteQuestion={handleDeleteQuestion}
                onDeleteZone={handleDeleteZone}
                onViewTypeChange={setViewType}
                onToggleExpandCollapse={toggleExpandCollapse}
              />
            }
            right={
              <DetailPanel
                selectedItem={selectedItem}
                zones={zones}
                questionMetadata={questionMetadata}
                editMode={editMode}
                assessmentType={assessment.type}
                urlPrefix={urlPrefix}
                courseId={course.id}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                courseQuestions={courseQuestions}
                courseQuestionsLoading={courseQuestionsQuery.isLoading}
                questionsInAssessment={questionsInAssessment}
                currentAssessmentId={assessment.id}
                onUpdateZone={handleUpdateZone}
                onUpdateQuestion={handleUpdateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onDeleteZone={handleDeleteZone}
                onQuestionPicked={handleQuestionPicked}
                onPickerDone={handlePickerDone}
                onPickQuestion={handlePickQuestion}
                onResetButtonClick={resetModal.showWithData}
              />
            }
          />
        </div>
      </DndContext>
      {assessment.type === 'Homework' ? (
        <ResetQuestionVariantsModal
          csrfToken={csrfToken}
          assessmentQuestionId={resetModal.data ?? ''}
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      ) : (
        <ExamResetNotSupportedModal
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      )}
    </>
  );
}

interface AssessmentEditorProps extends AssessmentEditorInnerProps {
  trpcCsrfToken: string;
}

export function AssessmentEditor({ trpcCsrfToken, ...innerProps }: AssessmentEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAssessmentQuestionsTrpcClient(trpcCsrfToken));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentEditorInner {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AssessmentEditor.displayName = 'AssessmentEditor';

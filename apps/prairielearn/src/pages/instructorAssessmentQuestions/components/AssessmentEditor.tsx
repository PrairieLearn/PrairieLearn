import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';
import { NuqsAdapter, OverlayTrigger, useModalState } from '@prairielearn/ui';

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
  DetailActions,
  DetailState,
  QuestionAlternativeForm,
  SelectedItem,
  TreeActions,
  TreeState,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';
import {
  createAltGroupWithTrackingId,
  createAlternativeWithTrackingId,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  prepareZonesForEditor,
  stripTrackingIds,
} from '../utils/dataTransform.js';
import type { AssessmentAdvancedDefaults } from '../utils/formHelpers.js';
import { buildPropsMap, computeChangeTracking } from '../utils/modifiedTracking.js';
import {
  buildQuestionMetadata,
  normalizeQuestionPoints,
  questionDisplayName,
} from '../utils/questions.js';
import { createAssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC } from '../utils/trpc-context.js';
import { findQuestionByTrackingId, useAssessmentEditor } from '../utils/useAssessmentEditor.js';

import { EditModeToolbar } from './EditModeToolbar.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
import { SplitPane } from './SplitPane.js';
import { DetailPanel } from './detail/DetailPanel.js';
import { AssessmentTree } from './tree/AssessmentTree.js';
import { DragPreview } from './tree/DragPreview.js';

/**
 * Shows a browser confirmation dialog when the user tries to navigate away or
 * close the tab while `enabled` is true. Useful for warning about unsaved changes.
 *
 * TODO: Extract to prairielearn/ui as a reusable hook. We could also
 * consider using `usehooks-ts`.
 */
function useBeforeUnload(enabled: boolean): () => void {
  const disabledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: BeforeUnloadEvent) => {
      if (disabledRef.current) return;
      event.preventDefault();
      event.returnValue = 'prompt';
      return 'prompt';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);

  return () => {
    disabledRef.current = true;
  };
}

/**
 * Collision detection for vertical lists that uses item boundaries instead of
 * center distances. Unlike closestCenter, this works correctly for items of
 * different heights (e.g. a tall alt group next to a short question row).
 */
const verticalBoundaryCollision: CollisionDetection = (args) => {
  const { collisionRect, droppableContainers, droppableRects } = args;
  const centerY = collisionRect.top + collisionRect.height / 2;

  const items = droppableContainers
    .map((c) => {
      const rect = droppableRects.get(c.id);
      return rect ? { id: c.id, top: rect.top, bottom: rect.top + rect.height } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => a.top - b.top);

  if (items.length === 0) return [];

  // Use the midpoint between adjacent items as the boundary.
  for (let i = 0; i < items.length - 1; i++) {
    const boundary = (items[i].bottom + items[i + 1].top) / 2;
    if (centerY < boundary) {
      return [{ id: items[i].id }];
    }
  }

  return [{ id: items[items.length - 1].id }];
};

interface AssessmentEditorInnerProps {
  course: StaffCourse;
  courseInstance: StaffCourseInstance;
  questionRows: StaffAssessmentQuestionRow[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
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
  assessment,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
}: AssessmentEditorInnerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const questionByQidMutation = useMutation({
    mutationFn: (qid: string) => queryClient.fetchQuery(trpc.questionByQid.queryOptions({ qid })),
  });

  const [initialState] = useState(() => ({
    zones: prepareZonesForEditor(jsonZones, assessment.type),
    questionMetadata: Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), r]),
    ),
    collapsedGroups: new Set<string>(),
    collapsedZones: new Set<string>(),
  }));

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesJson = useMemo(() => JSON.stringify(initialState.zones), [initialState.zones]);
  const initialPropsMap = useMemo(() => buildPropsMap(initialState.zones), [initialState.zones]);
  const changeTracking = useMemo(
    () => computeChangeTracking(initialPropsMap, zones),
    [initialPropsMap, zones],
  );

  const assessmentDefaults: AssessmentAdvancedDefaults = useMemo(
    () => ({
      advanceScorePerc: assessment.advance_score_perc ?? undefined,
      gradeRateMinutes: assessment.json_grade_rate_minutes ?? undefined,
      allowRealTimeGrading: assessment.json_allow_real_time_grading ?? true,
    }),
    [
      assessment.advance_score_perc,
      assessment.json_grade_rate_minutes,
      assessment.json_allow_real_time_grading,
    ],
  );

  const [editMode, setEditMode] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const isDragging = activeDragId !== null;
  const isKeyboardDragRef = useRef(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  // Ref tracks the latest selectedItem so async handlers (handleQuestionPicked)
  // can detect if the selection changed during an await and bail out early.
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  const [viewType, setViewType] = useQueryState(
    'view',
    parseAsStringLiteral(['simple', 'detailed']).withDefault('simple'),
  );
  const resetModal = useModalState<string>(null);

  const courseQuestionsQuery = useQuery({
    ...trpc.courseQuestions.queryOptions(),
    enabled: editMode,
  });
  const courseQuestions = courseQuestionsQuery.data ?? [];

  const questionsInAssessment = useMemo(() => {
    const qidToZones = new Map<string, string[]>();
    zones.forEach((zone, index) => {
      const zoneName = zone.title || `Zone ${index + 1}`;
      for (const question of zone.questions) {
        if (question.id) {
          const existing = qidToZones.get(question.id) ?? [];
          existing.push(zoneName);
          qidToZones.set(question.id, existing);
        }
        if (question.alternatives) {
          for (const alt of question.alternatives) {
            if (alt.id) {
              const existing = qidToZones.get(alt.id) ?? [];
              existing.push(zoneName);
              qidToZones.set(alt.id, existing);
            }
          }
        }
      }
    });
    return qidToZones;
  }, [zones]);

  const disabledQids = useMemo(() => {
    const disabled = new Set<string>();
    if (selectedItem?.type === 'picker') {
      const returnTo = selectedItem.returnToSelection;
      if (returnTo?.type === 'alternative') {
        // Changing an alternative: disable only siblings in the same alt group
        const result = findQuestionByTrackingId(zones, returnTo.questionTrackingId);
        if (result?.question.alternatives) {
          for (const alt of result.question.alternatives) {
            if (alt.id) disabled.add(alt.id);
          }
        }
      } else {
        // Adding to zone or changing a standalone question: disable only
        // standalone QIDs already directly in the zone (not ones inside alt
        // groups, since selecting those would move them out of the group).
        const zone = zones.find((z) => z.trackingId === selectedItem.zoneTrackingId);
        if (zone) {
          for (const q of zone.questions) {
            if (q.id) disabled.add(q.id);
          }
        }
      }
    } else if (selectedItem?.type === 'altGroupPicker' && selectedItem.altGroupTrackingId) {
      // Disable only QIDs in the target alt group
      for (const zone of zones) {
        for (const q of zone.questions) {
          if (q.trackingId === selectedItem.altGroupTrackingId && q.alternatives) {
            for (const alt of q.alternatives) {
              if (alt.id) disabled.add(alt.id);
            }
          }
        }
      }
    }
    return disabled;
  }, [selectedItem, zones]);

  const currentChangeQid = useMemo(() => {
    if (selectedItem?.type !== 'picker' || !selectedItem.returnToSelection) return undefined;
    const returnTo = selectedItem.returnToSelection;
    if (returnTo.type !== 'question' && returnTo.type !== 'alternative') return undefined;
    const result = findQuestionByTrackingId(zones, returnTo.questionTrackingId);
    if (!result) return undefined;
    if (returnTo.type === 'alternative') {
      return result.question.alternatives?.find(
        (a) => a.trackingId === returnTo.alternativeTrackingId,
      )?.id;
    }
    return result.question.id;
  }, [selectedItem, zones]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Custom collision detection:
  // 1. For standalone question drags (mouse only): check if the cursor is inside
  //    an alt group's merge zone. If yes, return the merge zone so the question
  //    can be merged into the group on drop. The merge zone is inset from the alt
  //    group edges so the top/bottom resolve to reorder instead of merge.
  // 2. Fall back to boundary-based vertical collision (not closestCenter) to
  //    determine reorder position. closestCenter uses item centers, which breaks
  //    for items of very different heights — tall alt groups have centers far from
  //    their edges, making it impossible to position items immediately above/below.
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current;
    const activeType = activeData?.type;

    // For standalone questions, check merge zones via rect containment first.
    // Skip merge zones for keyboard drags — sortableKeyboardCoordinates can't
    // navigate to droppables that aren't part of a SortableContext, which causes
    // the keyboard sensor to get stuck.
    if (activeType === 'question' && !activeData?.hasAlternatives && !isKeyboardDragRef.current) {
      const dragCenterY = args.collisionRect.top + args.collisionRect.height / 2;
      for (const container of args.droppableContainers) {
        if (container.data.current?.type !== 'merge-zone') continue;
        const rect = args.droppableRects.get(container.id);
        if (!rect) continue;
        // Inset the merge zone so the edges of the alt group body still resolve
        // to reorder. This gives the user room to drag past the group without
        // accidentally triggering a merge.
        const inset = Math.min(20, (rect.bottom - rect.top) / 4);
        if (dragCenterY >= rect.top + inset && dragCenterY <= rect.bottom - inset) {
          return [{ id: container.id }];
        }
      }
    }

    // Filter alternatives and merge zones for question drags; only merge zones for others.
    const filtered = args.droppableContainers.filter((c) => {
      const type = c.data.current?.type;
      if (activeType === 'question' && type === 'alternative') return false;
      if (activeType !== 'zone' && type === 'zone') return false;
      if (type === 'merge-zone') return false;
      // When dragging an alternative, exclude its parent alt group so siblings
      // resolve correctly in boundary collision
      if (
        activeType === 'alternative' &&
        type === 'question' &&
        String(c.id) === activeData?.parentTrackingId
      ) {
        return false;
      }
      return true;
    });

    return verticalBoundaryCollision({ ...args, droppableContainers: filtered });
  };

  const positionByStableId = useMemo(() => {
    const map: Record<
      string,
      { zoneIndex: number; questionIndex: number; alternativeIndex?: number }
    > = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
        question.alternatives?.forEach((alt, alternativeIndex) => {
          map[alt.trackingId] = { zoneIndex, questionIndex, alternativeIndex };
        });
      });
    });
    return map;
  }, [zones]);

  const handleAddQuestion = (zoneTrackingId: string) => {
    setSelectedItem({ type: 'picker', zoneTrackingId });
  };

  const handleQuestionPicked = async (qid: string) => {
    if (selectedItem?.type === 'altGroupPicker') {
      let questionData: QuestionByQidResult;
      try {
        questionData = await questionByQidMutation.mutateAsync(qid);
      } catch {
        // mutateAsync re-throws, but the error is stored in mutation.error
        // and surfaced via pickerError. We just need to bail out here.
        return;
      }
      if (selectedItemRef.current !== selectedItem) return;

      const metadata = buildQuestionMetadata({
        data: questionData,
        assessment,
        courseInstance,
        course,
        courseQuestions,
      });

      // Remove from current location if already in assessment (move behavior)
      if (questionsInAssessment.has(qid)) {
        handleRemoveQuestionByQid(qid);
      }

      if (selectedItem.altGroupTrackingId) {
        // Adding to existing alt group
        const newAlt = { ...createAlternativeWithTrackingId(), id: qid } as QuestionAlternativeForm;
        dispatch({
          type: 'ADD_ALTERNATIVE',
          altGroupTrackingId: selectedItem.altGroupTrackingId,
          alternative: newAlt,
          questionData: metadata,
        });
      } else {
        // Creating new alt group: first question picked creates the group
        const newAltGroup = createAltGroupWithTrackingId(assessment.type);
        const firstAlt = {
          ...createAlternativeWithTrackingId(),
          id: qid,
        } as QuestionAlternativeForm;
        newAltGroup.alternatives = [firstAlt];

        // Don't pass questionData to ADD_QUESTION — it stores metadata under
        // question.id, which is undefined for alt groups. Store it separately.
        dispatch({
          type: 'ADD_QUESTION',
          zoneTrackingId: selectedItem.zoneTrackingId,
          question: newAltGroup,
        });
        dispatch({
          type: 'UPDATE_QUESTION_METADATA',
          questionId: qid,
          questionData: metadata,
        });

        // Update selection so subsequent picks add to this group
        setSelectedItem({
          type: 'altGroupPicker',
          zoneTrackingId: selectedItem.zoneTrackingId,
          altGroupTrackingId: newAltGroup.trackingId,
        });
      }
      // Stay in picker for "add another" behavior
      return;
    }

    if (selectedItem?.type !== 'picker') return;

    if (selectedItem.returnToSelection) {
      // Returning to a question detail panel after picking a new QID
      const returnTo = selectedItem.returnToSelection;
      if (returnTo.type === 'question' || returnTo.type === 'alternative') {
        const questionTrackingId = returnTo.questionTrackingId;

        let questionData: QuestionByQidResult;
        try {
          questionData = await questionByQidMutation.mutateAsync(qid);
        } catch {
          // mutateAsync re-throws, but the error is stored in mutation.error
          // and surfaced via pickerError. We just need to bail out here.
          return;
        }
        if (selectedItemRef.current !== selectedItem) return;

        const found = findQuestionByTrackingId(zones, questionTrackingId);

        // Remove from current location if already in assessment (move behavior),
        // but skip if the question being removed is the one we're about to update.
        if (questionsInAssessment.has(qid)) {
          const currentQid = run(() => {
            if (!found) return undefined;
            if (returnTo.type === 'alternative') {
              return found.question.alternatives?.find(
                (a) => a.trackingId === returnTo.alternativeTrackingId,
              )?.id;
            }
            return found.question.id;
          });
          if (currentQid !== qid) {
            handleRemoveQuestionByQid(qid);
          }
        }
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
              courseQuestions,
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
      questionData = await questionByQidMutation.mutateAsync(qid);
    } catch {
      // mutateAsync re-throws, but the error is stored in mutation.error
      // and surfaced via pickerError. We just need to bail out here.
      return;
    }
    if (selectedItemRef.current !== selectedItem) return;

    // Remove from current location if already in assessment (move behavior)
    if (questionsInAssessment.has(qid)) {
      handleRemoveQuestionByQid(qid);
    }

    const newQuestion = {
      id: qid,
      ...createQuestionWithTrackingId(assessment.type),
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
        courseQuestions,
      }),
    });

    // Stay in picker for "add another" behavior
  };

  const handlePickerDone = () => {
    if (selectedItem?.type === 'altGroupPicker' && selectedItem.altGroupTrackingId) {
      // After adding to an alt group, select the alt group detail panel
      setSelectedItem({
        type: 'altGroup',
        questionTrackingId: selectedItem.altGroupTrackingId,
      });
      return;
    }
    if (selectedItem?.type === 'picker' && selectedItem.returnToSelection) {
      setSelectedItem(selectedItem.returnToSelection);
      return;
    }
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

    if (alternativeTrackingId !== undefined) {
      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId,
        question: normalized as Partial<QuestionAlternativeForm>,
        alternativeTrackingId,
      });
    } else {
      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId,
        question: normalized as Partial<ZoneQuestionBlockForm>,
      });
    }
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
    if (
      selectedItem?.type === 'altGroup' &&
      selectedItem.questionTrackingId === questionTrackingId &&
      alternativeTrackingId === undefined
    ) {
      setSelectedItem(null);
    }
    if (
      selectedItem?.type === 'altGroupPicker' &&
      selectedItem.altGroupTrackingId === questionTrackingId &&
      alternativeTrackingId === undefined
    ) {
      setSelectedItem(null);
    }
    if (selectedItem?.type === 'picker' && selectedItem.returnToSelection) {
      const returnTo = selectedItem.returnToSelection;
      if (
        (returnTo.type === 'question' || returnTo.type === 'altGroup') &&
        returnTo.questionTrackingId === questionTrackingId
      ) {
        setSelectedItem(null);
      }
      if (
        returnTo.type === 'alternative' &&
        returnTo.alternativeTrackingId === alternativeTrackingId
      ) {
        setSelectedItem(null);
      }
    }

    dispatch({
      type: 'DELETE_QUESTION',
      questionTrackingId,
      questionId,
      alternativeTrackingId,
    });
  };

  const handleRemoveQuestionByQid = (qid: string) => {
    dispatch({ type: 'REMOVE_QUESTION_BY_QID', qid });
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
    if (selectedItem) {
      const zone = zones.find((z) => z.trackingId === zoneTrackingId);
      const trackingIds = new Set<string>([zoneTrackingId]);
      if (zone) {
        for (const q of zone.questions) {
          trackingIds.add(q.trackingId);
          for (const alt of q.alternatives ?? []) {
            trackingIds.add(alt.trackingId);
          }
        }
      }

      const shouldClear = run(() => {
        switch (selectedItem.type) {
          case 'zone':
            return trackingIds.has(selectedItem.zoneTrackingId);
          case 'question':
          case 'altGroup':
            return trackingIds.has(selectedItem.questionTrackingId);
          case 'alternative':
            return trackingIds.has(selectedItem.alternativeTrackingId);
          case 'picker':
            return trackingIds.has(selectedItem.zoneTrackingId);
          case 'altGroupPicker':
            return (
              trackingIds.has(selectedItem.zoneTrackingId) ||
              (selectedItem.altGroupTrackingId !== undefined &&
                trackingIds.has(selectedItem.altGroupTrackingId))
            );
          default:
            return false;
        }
      });

      if (shouldClear) {
        setSelectedItem(null);
      }
    }
    dispatch({ type: 'DELETE_ZONE', zoneTrackingId });
  };

  const handleAddAltGroup = (zoneTrackingId: string) => {
    const newAltGroup = createAltGroupWithTrackingId(assessment.type);
    dispatch({
      type: 'ADD_QUESTION',
      zoneTrackingId,
      question: newAltGroup,
    });
    setSelectedItem({
      type: 'altGroup',
      questionTrackingId: newAltGroup.trackingId,
    });
  };

  const handleAddToAltGroup = (altGroupTrackingId: string) => {
    const zoneTrackingId = zones.find((z) =>
      z.questions.some((q) => q.trackingId === altGroupTrackingId),
    )?.trackingId;
    if (!zoneTrackingId) return;
    setSelectedItem({ type: 'altGroupPicker', zoneTrackingId, altGroupTrackingId });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeType = active.data.current?.type as 'zone' | 'question' | 'alternative' | undefined;

    // Zone reorder
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

    // Alternative reorder within same group
    if (activeType === 'alternative') {
      const fromPos = positionByStableId[activeIdStr];
      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPos || !toPos) return;
      if (fromPos.alternativeIndex == null || toPos.alternativeIndex == null) return;

      // Only handle within-group reorder here; cross-group is handled in handleDragOver
      const fromBlock = zones[fromPos.zoneIndex].questions[fromPos.questionIndex];
      const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
      if (fromBlock.trackingId !== toBlock.trackingId) return;
      if (fromPos.alternativeIndex === toPos.alternativeIndex) return;

      const alts = fromBlock.alternatives!;
      const isDraggingDown = fromPos.alternativeIndex < toPos.alternativeIndex;
      const beforeAlternativeTrackingId = isDraggingDown
        ? (alts[toPos.alternativeIndex + 1]?.trackingId ?? null)
        : alts[toPos.alternativeIndex].trackingId;

      dispatch({
        type: 'REORDER_ALTERNATIVE',
        alternativeTrackingId: activeIdStr,
        toAltGroupTrackingId: fromBlock.trackingId,
        beforeAlternativeTrackingId,
      });
      return;
    }

    // Merge standalone question into alt group via merge zone
    if (over.data.current?.type === 'merge-zone') {
      const altGroupTrackingId = over.data.current.altGroupTrackingId as string;
      dispatch({
        type: 'MERGE_QUESTION_INTO_ALT_GROUP',
        questionTrackingId: activeIdStr,
        toAltGroupTrackingId: altGroupTrackingId,
        beforeAlternativeTrackingId: null,
      });
      // The question's trackingId is preserved but it's now an alternative
      // inside the group. Update the selection so DetailPanel can find it.
      if (selectedItem?.type === 'question' && selectedItem.questionTrackingId === activeIdStr) {
        setSelectedItem({
          type: 'alternative',
          questionTrackingId: altGroupTrackingId,
          alternativeTrackingId: activeIdStr,
        });
      }
      return;
    }

    // Question block reorder within same zone
    const fromPosition = positionByStableId[activeIdStr];
    const rawToPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !rawToPosition) return;

    // If "over" resolved to an alternative inside an alt group, use the alt group's position
    const toPosition =
      rawToPosition.alternativeIndex != null
        ? { zoneIndex: rawToPosition.zoneIndex, questionIndex: rawToPosition.questionIndex }
        : rawToPosition;

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

    const activeType = active.data.current?.type as 'zone' | 'question' | 'alternative' | undefined;
    const overType = over.data.current?.type as string | undefined;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Merge zone — handled in handleDragEnd, ignore during dragOver
    if (overType === 'merge-zone') return;

    if (activeType === 'alternative') {
      const fromPos = positionByStableId[activeIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPos) return;
      // After extraction, the item becomes a question block (no alternativeIndex).
      // dnd-kit's active.data.current.type stays frozen as 'alternative', so guard here.
      if (fromPos.alternativeIndex == null) return;
      const fromBlock = zones[fromPos.zoneIndex].questions[fromPos.questionIndex];

      // Alternative dragged over empty zone drop target → extract to zone
      const targetZone = zones.find((z) => `${z.trackingId}-empty-drop` === overIdStr);
      if (targetZone) {
        dispatch({
          type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
          alternativeTrackingId: activeIdStr,
          toZoneTrackingId: targetZone.trackingId,
          beforeQuestionTrackingId: null,
        });
        setSelectedItem(null);
        return;
      }

      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!toPos) return;

      if (overType === 'alternative' && toPos.alternativeIndex != null) {
        // Alternative dragged over alternative in different group → cross-group move
        const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
        if (fromBlock.trackingId !== toBlock.trackingId) {
          dispatch({
            type: 'REORDER_ALTERNATIVE',
            alternativeTrackingId: activeIdStr,
            toAltGroupTrackingId: toBlock.trackingId,
            beforeAlternativeTrackingId: toBlock.alternatives![toPos.alternativeIndex].trackingId,
          });
        }
        return;
      }

      if (overType === 'question') {
        // If the alternative resolved to its own parent group, skip extraction
        const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
        if (fromBlock.trackingId === toBlock.trackingId) return;

        // Alternative dragged over a question block → extract to zone
        const toZone = zones[toPos.zoneIndex];
        dispatch({
          type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
          alternativeTrackingId: activeIdStr,
          toZoneTrackingId: toZone.trackingId,
          beforeQuestionTrackingId: toZone.questions[toPos.questionIndex].trackingId,
        });
        setSelectedItem(null);
      }
      return;
    }

    if (activeType === 'question') {
      const fromPosition = positionByStableId[activeIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPosition) return;
      const fromZone = zones[fromPosition.zoneIndex];

      // Question dragged over empty zone drop target → cross-zone move
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

      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!toPos) return;

      // Cross-zone question reorder
      const toZone = zones[toPos.zoneIndex];
      if (fromZone.trackingId !== toZone.trackingId) {
        dispatch({
          type: 'REORDER_QUESTION',
          questionTrackingId: activeIdStr,
          toZoneTrackingId: toZone.trackingId,
          beforeQuestionTrackingId: toZone.questions[toPos.questionIndex].trackingId,
        });
      }
    }
  };

  const isAllExpanded = collapsedGroups.size === 0;

  const zonesForSave = useMemo(() => stripTrackingIds(zones), [zones]);
  const hasZoneWithNoEffectiveQuestions = zonesForSave.some((zone) => zone.questions.length === 0);

  // Check against pre-stripped zones since stripTrackingIds silently drops empty alt groups
  const hasEmptyAltGroup = zones.some((zone) =>
    zone.questions.some((q) => q.alternatives?.length === 0),
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(zones) !== initialZonesJson,
    [zones, initialZonesJson],
  );

  const saveButtonDisabled =
    !hasUnsavedChanges || hasZoneWithNoEffectiveQuestions || hasEmptyAltGroup;

  const disableBeforeUnload = useBeforeUnload(editMode && hasUnsavedChanges);

  const saveButtonDisabledReason = hasZoneWithNoEffectiveQuestions
    ? 'Cannot save: one or more zones have no questions'
    : hasEmptyAltGroup
      ? 'Cannot save: one or more alternative groups have no questions'
      : undefined;

  const treeState: TreeState = useMemo(
    () => ({
      editMode,
      viewType,
      selectedItem,
      questionMetadata,
      collapsedGroups,
      collapsedZones,
      changeTracking,
      courseInstanceId: courseInstance.id,
      hasCoursePermissionPreview,
      assessmentType: assessment.type,
    }),
    [
      editMode,
      viewType,
      selectedItem,
      questionMetadata,
      collapsedGroups,
      collapsedZones,
      changeTracking,
      courseInstance.id,
      hasCoursePermissionPreview,
      assessment.type,
    ],
  );

  const treeActions: TreeActions = useMemo(
    () => ({
      onAddQuestion: handleAddQuestion,
      onAddAltGroup: handleAddAltGroup,
      onAddToAltGroup: handleAddToAltGroup,
      onDeleteQuestion: handleDeleteQuestion,
      onDeleteZone: handleDeleteZone,
      setSelectedItem,
      dispatch,
    }),
    // Handlers close over `zones` (updated on dispatch), so `[zones, selectedItem]`
    // correctly captures all change triggers. Listing each handler individually
    // would be redundant and cause unnecessary re-memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, selectedItem],
  );

  const detailState: DetailState = useMemo(
    () => ({
      editMode,
      assessmentType: assessment.type,
      constantQuestionValue: assessment.constant_question_value ?? false,
      assessmentDefaults,
      courseInstanceId: courseInstance.id,
      courseId: course.id,
      hasCoursePermissionPreview,
    }),
    [
      editMode,
      assessment.type,
      assessment.constant_question_value,
      assessmentDefaults,
      courseInstance.id,
      course.id,
      hasCoursePermissionPreview,
    ],
  );

  const detailActions: DetailActions = useMemo(
    () => ({
      onUpdateZone: handleUpdateZone,
      onUpdateQuestion: handleUpdateQuestion,
      onDeleteQuestion: handleDeleteQuestion,
      onDeleteZone: handleDeleteZone,
      onAddToAltGroup: handleAddToAltGroup,
      onQuestionPicked: handleQuestionPicked,
      onPickQuestion: handlePickQuestion,
      onRemoveQuestionByQid: handleRemoveQuestionByQid,
      onResetButtonClick: resetModal.showWithData,
    }),
    // Handlers close over `zones` (updated on dispatch) and `courseQuestions`
    // (used by handleQuestionPicked to build metadata), so these deps
    // correctly capture all change triggers. Listing each handler individually
    // would be redundant and cause unnecessary re-memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, selectedItem, courseQuestions],
  );

  const toggleExpandCollapse = () => {
    if (isAllExpanded) {
      dispatch({ type: 'COLLAPSE_ALL_GROUPS' });
    } else {
      dispatch({ type: 'EXPAND_ALL_GROUPS' });
    }
  };

  const zoneDisplayName = (trackingId: string) => {
    const index = zones.findIndex((z) => z.trackingId === trackingId);
    if (index === -1) return 'Zone';
    return zones[index].title || `Zone ${index + 1}`;
  };

  const docsTooltipId = useId();
  const rightTitle = run(() => {
    if (!selectedItem) return undefined;

    const docsLink = (label: string, docsLabel: string, anchor: string) => (
      <>
        {label}{' '}
        <OverlayTrigger
          tooltip={{ body: `View ${docsLabel} documentation`, props: { id: docsTooltipId } }}
        >
          <a
            href={`https://docs.prairielearn.com/assessment/configuration/${anchor}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${docsLabel} documentation`}
            className="text-muted"
          >
            <i className="bi bi-question-circle" aria-hidden="true" />
          </a>
        </OverlayTrigger>
      </>
    );

    switch (selectedItem.type) {
      case 'zone': {
        const label = editMode ? 'Edit zone' : zoneDisplayName(selectedItem.zoneTrackingId);
        return docsLink(label, 'zone', '#question-specification');
      }
      case 'question':
        return docsLink(
          editMode ? 'Edit question' : 'Question',
          'question',
          '#question-specification',
        );
      case 'alternative':
        return docsLink(
          editMode ? 'Edit alternative' : 'Alternative',
          'alternative',
          '#question-alternatives',
        );
      case 'altGroup':
        return docsLink(
          editMode ? 'Edit alternative group' : 'Alternative group',
          'alternative group',
          '#question-alternatives',
        );
      case 'picker': {
        if (selectedItem.returnToSelection) {
          return selectedItem.returnToSelection.type === 'alternative'
            ? 'Change alternative'
            : 'Change question';
        }
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return `Adding to "${name}"`;
      }
      case 'altGroupPicker': {
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return selectedItem.altGroupTrackingId
          ? `Adding to alternative group in "${name}"`
          : `Creating alternative group in "${name}"`;
      }
    }
  });

  const rightHeaderAction = run(() => {
    if (selectedItem?.type === 'picker' || selectedItem?.type === 'altGroupPicker') {
      return (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={questionByQidMutation.isPending}
          onClick={handlePickerDone}
        >
          Done
        </button>
      );
    }
    return undefined;
  });

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        autoScroll={false}
        onDragStart={(event: DragStartEvent) => {
          setActiveDragId(String(event.active.id));
          isKeyboardDragRef.current = event.activatorEvent instanceof KeyboardEvent;
        }}
        onDragOver={handleDragOver}
        onDragEnd={(event: DragEndEvent) => {
          setActiveDragId(null);
          isKeyboardDragRef.current = false;
          handleDragEnd(event);
        }}
        onDragCancel={() => {
          setActiveDragId(null);
          isKeyboardDragRef.current = false;
        }}
      >
        <div
          data-dragging={isDragging || undefined}
          style={{ height: '100%' }}
          data-assessment-editor
        >
          <SplitPane
            forceOpen={selectedItem}
            rightCollapsed={selectedItem == null ? true : undefined}
            rightTitle={rightTitle}
            rightHeaderAction={rightHeaderAction}
            left={
              <AssessmentTree
                zones={zones}
                state={treeState}
                actions={treeActions}
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
                    onSubmit={disableBeforeUnload}
                    onCancel={() => {
                      setSelectedItem(null);
                      dispatch({ type: 'RESET' });
                      setEditMode(false);
                    }}
                  />
                }
                onAddZone={handleAddZone}
                onViewTypeChange={setViewType}
                onToggleExpandCollapse={toggleExpandCollapse}
              />
            }
            right={
              <DetailPanel
                selectedItem={selectedItem}
                zones={zones}
                questionMetadata={questionMetadata}
                state={detailState}
                actions={detailActions}
                courseQuestions={courseQuestions}
                courseQuestionsLoading={courseQuestionsQuery.isLoading}
                questionsInAssessment={questionsInAssessment}
                disabledQids={disabledQids}
                currentChangeQid={currentChangeQid}
                currentAssessmentId={assessment.id}
                isPickingQuestion={questionByQidMutation.isPending}
                pickerError={questionByQidMutation.error}
              />
            }
            onClose={() => setSelectedItem(null)}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (
            <DragPreview
              activeDragId={activeDragId}
              zones={zones}
              questionMetadata={questionMetadata}
            />
          ) : null}
        </DragOverlay>
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
  search: string;
}

export function AssessmentQuestionsEditor({
  trpcCsrfToken,
  search,
  ...innerProps
}: AssessmentEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAssessmentQuestionsTrpcClient(trpcCsrfToken));
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentEditorInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionsEditor.displayName = 'AssessmentQuestionsEditor';

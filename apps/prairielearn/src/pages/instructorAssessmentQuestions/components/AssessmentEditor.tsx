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
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';
import { NuqsAdapter, OverlayTrigger, SplitPane, useModalState } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAssessmentTool, ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessment/context.js';
import type {
  DetailActions,
  DetailState,
  EditorState,
  QuestionAlternativeForm,
  SelectedItem,
  TreeActions,
  TreeState,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';
import {
  createAltPoolWithTrackingId,
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
  toEditorMetadata,
} from '../utils/questions.js';
import { getStructuralSaveValidationErrorKind } from '../utils/saveValidation.js';
import { useAssessmentEditor } from '../utils/useAssessmentEditor.js';
import {
  findAltPoolByTrackingId,
  findAlternativeByTrackingId,
  findQuestionByTrackingId,
  findZoneByTrackingId,
  getInitialSelectedZoneItem,
} from '../utils/zoneLookup.js';

import { EditModeToolbar } from './EditModeToolbar.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
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
 * different heights (e.g. a tall alt pool next to a short question row).
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
  assessmentToolDefaults: Partial<Record<EnumAssessmentTool, boolean>>;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  switchViewUrl: string | null;
  questionSharingEnabled: boolean;
  consumePublicQuestionsEnabled: boolean;
  search: string;
}

function AssessmentEditorInner({
  course,
  courseInstance,
  questionRows,
  jsonZones,
  assessment,
  assessmentToolDefaults,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  canEdit,
  csrfToken,
  origHash,
  switchViewUrl,
  questionSharingEnabled,
  consumePublicQuestionsEnabled,
  search,
}: AssessmentEditorInnerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const questionByQidMutation = useMutation({
    mutationFn: (qid: string) =>
      queryClient.fetchQuery(trpc.assessmentQuestions.questionByQid.queryOptions({ qid })),
  });

  const [_preselection, setPreselection] = useQueryState('selected', parseAsString.withDefault(''));

  const [initialState] = useState<EditorState>(() => {
    const questionMetadataMap = Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), toEditorMetadata(r)]),
    );

    const zones = prepareZonesForEditor(jsonZones, questionMetadataMap);

    return {
      zones,
      questionMetadata: questionMetadataMap,
      collapsedPools: new Set<string>(),
      collapsedZones: new Set<string>(),
      dismissedBanners: new Set<string>(),
      selectedItem: getInitialSelectedZoneItem(search, zones),
    };
  });

  const {
    zones,
    questionMetadata,
    collapsedPools,
    collapsedZones,
    dismissedBanners,
    selectedItem,
    dispatch,
  } = useAssessmentEditor(initialState);

  const setSelectedItem = useCallback(
    (item: SelectedItem) => {
      dispatch({ type: 'SET_SELECTED_ITEM', selectedItem: item });
    },
    [dispatch],
  );

  useEffect(() => {
    const next = run(() => {
      switch (selectedItem?.type) {
        case 'question': {
          const foundQuestion = findQuestionByTrackingId(zones, selectedItem.questionTrackingId);
          return foundQuestion?.question.id ? `q:${foundQuestion.question.id}` : null;
        }
        case 'zone': {
          const foundZone = findZoneByTrackingId(zones, selectedItem.zoneTrackingId);
          return foundZone ? `z:${foundZone.zoneIndex}` : null;
        }
        case 'altPool': {
          const foundAltPool = findAltPoolByTrackingId(zones, selectedItem.questionTrackingId);
          return foundAltPool ? `z:${foundAltPool.zoneIndex}:${foundAltPool.altPoolIndex}` : null;
        }
        case 'alternative': {
          const foundAlt = findAlternativeByTrackingId(zones, selectedItem.alternativeTrackingId);
          return foundAlt ? `q:${foundAlt.alternative.id}` : null;
        }
        default:
          return null;
      }
    });
    void setPreselection(next);
  }, [selectedItem, zones, setPreselection]);

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

  // Tracks validation errors for the currently mounted detail form only.
  // Invalid draft values in the open form are discarded on unmount because
  // useAutoSave never commits invalid data to `zones`. Structural invariants
  // that can be broken by tree edits are validated separately from `zones`.
  const [selectedFormHasErrors, setSelectedFormHasErrors] = useState(false);
  const handleFormValidChange = useCallback((isValid: boolean) => {
    setSelectedFormHasErrors(!isValid);
  }, []);
  // Reset the open-form error state when the selection changes. The next
  // mounted form will report its own validity, while persisted tree-state
  // invariants are checked separately from `zones`.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, react-you-might-not-need-an-effect/no-chain-state-updates, @eslint-react/set-state-in-effect
    setSelectedFormHasErrors(false);
  }, [selectedItem]);

  const [viewType, setViewType] = useQueryState(
    'view',
    parseAsStringLiteral(['simple', 'detailed']).withDefault('simple'),
  );
  const resetModal = useModalState<string>(null);

  const courseQuestionsQuery = useQuery({
    ...trpc.assessmentQuestions.courseQuestions.queryOptions(),
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
        // Changing an alternative: disable only siblings in the same alt pool
        const result = findQuestionByTrackingId(zones, returnTo.questionTrackingId);
        if (result?.question.alternatives) {
          for (const alt of result.question.alternatives) {
            if (alt.id) disabled.add(alt.id);
          }
        }
      } else {
        // Adding to zone or changing a standalone question: disable only
        // standalone QIDs already directly in the zone (not ones inside alt
        // pools, since selecting those would move them out of the pool).
        const zone = zones.find((z) => z.trackingId === selectedItem.zoneTrackingId);
        if (zone) {
          for (const q of zone.questions) {
            if (q.id) disabled.add(q.id);
          }
        }
      }
    } else if (selectedItem?.type === 'altPoolPicker' && selectedItem.altPoolTrackingId) {
      // Disable only QIDs in the target alt pool
      for (const zone of zones) {
        for (const q of zone.questions) {
          if (q.trackingId === selectedItem.altPoolTrackingId && q.alternatives) {
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
  //    an alt pool's merge zone. If yes, return the merge zone so the question
  //    can be merged into the pool on drop. The merge zone is inset from the alt
  //    pool edges so the top/bottom resolve to reorder instead of merge.
  // 2. Fall back to boundary-based vertical collision (not closestCenter) to
  //    determine reorder position. closestCenter uses item centers, which breaks
  //    for items of very different heights — tall alt pools have centers far from
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
        // Inset the merge zone so the edges of the alt pool body still resolve
        // to reorder. This gives the user room to drag past the pool without
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
      // When dragging an alternative, exclude its parent alt pool so siblings
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
    try {
      const questionData = await questionByQidMutation.mutateAsync(qid);
      dispatch({
        type: 'QUESTION_PICKED',
        qid,
        metadata: buildQuestionMetadata({
          data: questionData,
          assessment,
          courseInstance,
          courseQuestions,
        }),
        expectedSelectedItem: selectedItem,
      });
    } catch {
      // mutateAsync re-throws, but the error is stored in mutation.error
      // and surfaced via pickerError. We just need to bail out here.
    }
  };

  const handlePickerDone = () => {
    if (selectedItem?.type === 'altPoolPicker' && selectedItem.altPoolTrackingId) {
      // After adding to an alt pool, select the alt pool detail panel
      setSelectedItem({
        type: 'altPool',
        questionTrackingId: selectedItem.altPoolTrackingId,
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
    dispatch({ type: 'DELETE_ZONE', zoneTrackingId });
  };

  const handleAddAltPool = (zoneTrackingId: string) => {
    const newAltPool = createAltPoolWithTrackingId();
    dispatch({
      type: 'ADD_QUESTION',
      zoneTrackingId,
      question: newAltPool,
    });
    setSelectedItem({
      type: 'altPool',
      questionTrackingId: newAltPool.trackingId,
    });
  };

  const handleAddToAltPool = (altPoolTrackingId: string) => {
    const zoneTrackingId = zones.find((z) =>
      z.questions.some((q) => q.trackingId === altPoolTrackingId),
    )?.trackingId;
    if (!zoneTrackingId) return;
    setSelectedItem({ type: 'altPoolPicker', zoneTrackingId, altPoolTrackingId });
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

    // Alternative reorder within same pool
    if (activeType === 'alternative') {
      const fromPos = positionByStableId[activeIdStr];
      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPos || !toPos) return;
      if (fromPos.alternativeIndex == null || toPos.alternativeIndex == null) return;

      // Only handle within-pool reorder here; cross-pool is handled in handleDragOver
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
        toAltPoolTrackingId: fromBlock.trackingId,
        beforeAlternativeTrackingId,
      });
      return;
    }

    // Merge standalone question into alt pool via merge zone
    if (over.data.current?.type === 'merge-zone') {
      const altPoolTrackingId = over.data.current.altPoolTrackingId as string;
      dispatch({
        type: 'MERGE_QUESTION_INTO_ALT_POOL',
        questionTrackingId: activeIdStr,
        toAltPoolTrackingId: altPoolTrackingId,
        beforeAlternativeTrackingId: null,
      });
      return;
    }

    // Question block reorder within same zone
    const fromPosition = positionByStableId[activeIdStr];
    const rawToPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !rawToPosition) return;

    // If "over" resolved to an alternative inside an alt pool, use the alt pool's position
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

        return;
      }

      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!toPos) return;

      if (overType === 'alternative' && toPos.alternativeIndex != null) {
        // Alternative dragged over alternative in different pool → cross-pool move
        const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
        if (fromBlock.trackingId !== toBlock.trackingId) {
          dispatch({
            type: 'REORDER_ALTERNATIVE',
            alternativeTrackingId: activeIdStr,
            toAltPoolTrackingId: toBlock.trackingId,
            beforeAlternativeTrackingId: toBlock.alternatives![toPos.alternativeIndex].trackingId,
          });
        }
        return;
      }

      if (overType === 'question') {
        // If the alternative resolved to its own parent pool, skip extraction
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

  const isAllExpanded = collapsedPools.size === 0;

  const zonesForSave = useMemo(() => stripTrackingIds(zones), [zones]);
  const hasZoneWithNoEffectiveQuestions = zonesForSave.some((zone) => zone.questions.length === 0);

  // Check against pre-stripped zones since stripTrackingIds silently drops empty alt pools
  const hasEmptyAltPool = zones.some((zone) =>
    zone.questions.some((q) => q.alternatives?.length === 0),
  );
  const structuralSaveValidationErrorKind = useMemo(
    () => getStructuralSaveValidationErrorKind(zones),
    [zones],
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(zones) !== initialZonesJson,
    [zones, initialZonesJson],
  );

  const saveButtonDisabled =
    !hasUnsavedChanges ||
    hasZoneWithNoEffectiveQuestions ||
    hasEmptyAltPool ||
    selectedFormHasErrors ||
    structuralSaveValidationErrorKind != null;

  const disableBeforeUnload = useBeforeUnload(editMode && hasUnsavedChanges);

  const selectedFormErrorDisabledReason = selectedFormHasErrors
    ? run(() => {
        switch (selectedItem?.type) {
          case 'zone':
            return 'Cannot save: the selected zone has configuration errors';
          case 'question':
            return 'Cannot save: the selected question has configuration errors';
          case 'altPool':
            return 'Cannot save: the selected alternative pool has configuration errors';
          case 'alternative':
            return 'Cannot save: the selected alternative has configuration errors';
          default:
            return 'Cannot save: there are configuration errors';
        }
      })
    : undefined;
  const structuralSaveValidationErrorReason = run(() => {
    switch (structuralSaveValidationErrorKind) {
      case 'zone':
        return 'Cannot save: one or more zones have configuration errors';
      case 'altPool':
        return 'Cannot save: one or more alternative pools have configuration errors';
      default:
        return undefined;
    }
  });

  const saveButtonDisabledReason = hasZoneWithNoEffectiveQuestions
    ? 'Cannot save: one or more zones have no questions'
    : hasEmptyAltPool
      ? 'Cannot save: one or more alternative pools have no questions'
      : (selectedFormErrorDisabledReason ?? structuralSaveValidationErrorReason);

  const treeState: TreeState = useMemo(
    () => ({
      editMode,
      viewType,
      selectedItem,
      questionMetadata,
      collapsedPools,
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
      collapsedPools,
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
      onAddAltPool: handleAddAltPool,
      onAddToAltPool: handleAddToAltPool,
      onDeleteQuestion: handleDeleteQuestion,
      onDeleteZone: handleDeleteZone,
      setSelectedItem,
      dispatch,
    }),
    // Handlers close over `zones` (updated on dispatch), so `[zones, selectedItem]`
    // correctly captures all change triggers. Listing each handler individually
    // would be redundant and cause unnecessary re-memoization.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
    [zones, selectedItem],
  );

  const detailState: DetailState = useMemo(
    () => ({
      editMode,
      hasCourseInstancePermissionEdit,
      assessmentType: assessment.type,
      constantQuestionValue: assessment.constant_question_value ?? false,
      assessmentDefaults,
      assessmentToolDefaults,
      courseInstanceId: courseInstance.id,
      courseId: course.id,
      hasCoursePermissionPreview,
      dismissedBanners,
    }),
    [
      editMode,
      hasCourseInstancePermissionEdit,
      assessment.type,
      assessment.constant_question_value,
      assessmentDefaults,
      assessmentToolDefaults,
      courseInstance.id,
      course.id,
      hasCoursePermissionPreview,
      dismissedBanners,
    ],
  );

  const handleDismissBanner = useCallback(
    (trackingId: string) => dispatch({ type: 'DISMISS_BANNER', trackingId }),
    [dispatch],
  );

  const detailActions: DetailActions = useMemo(
    () => ({
      onUpdateZone: handleUpdateZone,
      onUpdateQuestion: handleUpdateQuestion,
      onDeleteQuestion: handleDeleteQuestion,
      onDeleteZone: handleDeleteZone,
      onAddToAltPool: handleAddToAltPool,
      onQuestionPicked: handleQuestionPicked,
      onPickQuestion: handlePickQuestion,
      onRemoveQuestionByQid: handleRemoveQuestionByQid,
      onResetButtonClick: resetModal.showWithData,
      onFormValidChange: handleFormValidChange,
      onDismissBanner: handleDismissBanner,
    }),
    // Handlers close over `zones` (updated on dispatch) and `courseQuestions`
    // (used by handleQuestionPicked to build metadata), so these deps
    // correctly capture all change triggers. Listing each handler individually
    // would be redundant and cause unnecessary re-memoization.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
    [zones, selectedItem, courseQuestions, handleDismissBanner],
  );

  const toggleExpandCollapse = () => {
    if (isAllExpanded) {
      dispatch({ type: 'COLLAPSE_ALL_POOLS' });
    } else {
      dispatch({ type: 'EXPAND_ALL_POOLS' });
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
      case 'altPool':
        return docsLink(
          editMode ? 'Edit alternative pool' : 'Alternative pool',
          'alternative pool',
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
      case 'altPoolPicker': {
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return selectedItem.altPoolTrackingId
          ? `Adding to alternative pool in "${name}"`
          : `Creating alternative pool in "${name}"`;
      }
    }
  });

  const rightHeaderAction = run(() => {
    if (selectedItem?.type === 'picker' || selectedItem?.type === 'altPoolPicker') {
      const isChangeMode = selectedItem.type === 'picker' && selectedItem.returnToSelection != null;
      return (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={questionByQidMutation.isPending}
          onClick={handlePickerDone}
        >
          {isChangeMode ? 'Cancel' : 'Done'}
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
          data-split-pane-page
        >
          <SplitPane
            forceOpen={selectedItem}
            left={{
              content: (
                <AssessmentTree
                  zones={zones}
                  state={treeState}
                  actions={treeActions}
                  isAllExpanded={isAllExpanded}
                  switchViewUrl={switchViewUrl}
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
                        dispatch({ type: 'RESET' });
                        setEditMode(false);
                      }}
                    />
                  }
                  onAddZone={handleAddZone}
                  onViewTypeChange={setViewType}
                  onToggleExpandCollapse={toggleExpandCollapse}
                />
              ),
            }}
            right={{
              content: (
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
                  questionSharingEnabled={questionSharingEnabled}
                  consumePublicQuestionsEnabled={consumePublicQuestionsEnabled}
                />
              ),
              title: rightTitle,
              headerAction: rightHeaderAction,
              collapsed: selectedItem == null ? true : undefined,
            }}
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
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: innerProps.courseInstance.id,
      assessmentId: innerProps.assessment.id,
    }),
  );

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentEditorInner search={search} {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionsEditor.displayName = 'AssessmentQuestionsEditor';
